"""
Analytics Router — Performance, risk analysis, and portfolio optimization endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional

import pandas as pd
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.fetcher import fetch_nav_history, fetch_multiple_navs
from data.preprocessor import clean_nav_data
from analytics.performance import (
    simulate_sip_growth, simulate_lumpsum_growth, simulate_with_transactions,
    compare_funds, calculate_cagr, calculate_absolute_return
)
from analytics.risk import calculate_risk_score, analyze_portfolio_risk
from analytics.optimizer import optimize_portfolio, generate_efficient_frontier
from analytics.tax_harvesting import compute_tax_harvest
from analytics.portfolio_metrics import compute_simplified_biases
from analytics.regime import detect_regimes, compute_fund_regime_performance
from analytics.overlap import compute_overlap
from analytics.behavioral_bias import analyze_behavioral_biases
from analytics.factor_attribution import run_factor_attribution, FACTOR_CODES
from analytics.health_score import calculate_health_score

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# ── Request Models ──
class TransactionInput(BaseModel):
    date: str                # "YYYY-MM-DD"
    amount: float            # ₹ amount
    type: str = "buy"        # "buy" | "sip" | "sell"
    note: Optional[str] = None

class FundInput(BaseModel):
    scheme_code: str
    name: Optional[str] = None
    category: Optional[str] = None
    investment_amount: float = 0
    monthly_sip: float = 0
    weight: Optional[float] = None
    transactions: Optional[List[TransactionInput]] = None  # actual transaction history
    purchase_date: Optional[str] = None                   # actual start date — overrides req.start_date per fund
    plan_type: Optional[str] = "Direct"                   # "Direct" | "Regular" — affects expense ratio lookup

class PerformanceRequest(BaseModel):
    funds: List[FundInput]
    mode: str = "sip"  # "sip" or "lumpsum"
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class RiskRequest(BaseModel):
    funds: List[FundInput]
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class OptimizeRequest(BaseModel):
    funds: List[FundInput]
    target: str = "max_sharpe"  # "max_sharpe" or "min_volatility"

class BehavioralBiasRequest(BaseModel):
    funds: List[FundInput]

class FactorAttributionRequest(BaseModel):
    funds: List[FundInput]
    expense_ratios: Optional[Dict[str, float]] = None  # scheme_code → TER %

class PortfolioMetricsRequest(BaseModel):
    funds: List[FundInput]


@router.post("/performance")
def analyze_performance(req: PerformanceRequest):
    """Compute portfolio performance metrics and growth curves."""
    results = []

    for fund in req.funds:
        df = fetch_nav_history(fund.scheme_code)
        if df is None or df.empty:
            results.append({"scheme_code": fund.scheme_code, "error": "No data available"})
            continue

        df = clean_nav_data(df)

        # Per-fund start date: use actual purchase_date if set, else fall back to the period filter
        effective_start = fund.purchase_date or req.start_date

        if fund.transactions and len(fund.transactions) > 0:
            # Actual transaction history — compute real XIRR, ignore period filter
            txn_list = [{"date": t.date, "amount": t.amount, "type": t.type} for t in fund.transactions]
            perf = simulate_with_transactions(df, txn_list)
        elif req.mode == "sip" and fund.monthly_sip > 0:
            perf = simulate_sip_growth(df, fund.monthly_sip, effective_start, req.end_date)
            perf["data_source"] = "estimated_sip"
        elif fund.investment_amount > 0:
            perf = simulate_lumpsum_growth(df, fund.investment_amount, effective_start)
            perf["data_source"] = "estimated_lumpsum"
        else:
            perf = simulate_lumpsum_growth(df, 10000, effective_start)
            perf["data_source"] = "estimated_lumpsum"
            perf["data_source_warning"] = "No investment amount set — showing illustrative ₹10,000 lumpsum. Set monthly SIP or investment amount in Portfolio Builder."

        perf["scheme_code"] = fund.scheme_code
        perf["name"] = fund.name or fund.scheme_code
        results.append(perf)

    # Total portfolio
    total_invested = sum(r.get("total_invested", 0) for r in results if "error" not in r)
    total_current = sum(r.get("current_value", 0) for r in results if "error" not in r)

    return {
        "funds": results,
        "portfolio_summary": {
            "total_invested": round(total_invested, 2),
            "current_value": round(total_current, 2),
            "absolute_return_pct": round(calculate_absolute_return(total_invested, total_current), 2),
            "gain_loss": round(total_current - total_invested, 2),
        }
    }


def _slice_by_dates(df, start_date: Optional[str], end_date: Optional[str]):
    """Filter a NAV DataFrame to [start_date, end_date] inclusive (both optional)."""
    if df is None or df.empty:
        return df
    if start_date:
        df = df[df["date"] >= pd.to_datetime(start_date)]
    if end_date:
        df = df[df["date"] <= pd.to_datetime(end_date)]
    return df.reset_index(drop=True)


@router.post("/risk")
def analyze_risk(req: RiskRequest):
    """Compute risk metrics for each fund and the portfolio over the requested window."""
    fund_risks = []

    for fund in req.funds:
        df = fetch_nav_history(fund.scheme_code)
        if df is None or df.empty:
            continue

        df = clean_nav_data(df)
        df = _slice_by_dates(df, req.start_date, req.end_date)
        if df is None or len(df) < 2:
            continue

        risk = calculate_risk_score(df)
        risk["scheme_code"] = fund.scheme_code
        risk["name"] = fund.name or fund.scheme_code
        fund_risks.append(risk)

    # Portfolio-level risk
    portfolio_risk = None
    if len(req.funds) >= 2:
        codes = [f.scheme_code for f in req.funds]
        nav_dict = fetch_multiple_navs(codes)
        nav_dict = {
            code: _slice_by_dates(df, req.start_date, req.end_date)
            for code, df in nav_dict.items()
        }
        nav_dict = {c: d for c, d in nav_dict.items() if d is not None and len(d) >= 2}

        # Calculate weights from investment amounts or equal weight
        total = sum(f.investment_amount or f.monthly_sip or 1 for f in req.funds)
        weights = {
            f.scheme_code: (f.investment_amount or f.monthly_sip or 1) / total
            for f in req.funds
        }

        try:
            portfolio_risk = analyze_portfolio_risk(nav_dict, weights)
        except Exception as e:
            portfolio_risk = {"error": str(e)}

    return {
        "fund_risks": fund_risks,
        "portfolio_risk": portfolio_risk,
    }


@router.post("/optimize")
def optimize(req: OptimizeRequest):
    """Run MPT portfolio optimization."""
    if len(req.funds) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 funds for optimization")

    codes = [f.scheme_code for f in req.funds]
    nav_dict = fetch_multiple_navs(codes)

    if len(nav_dict) < 2:
        raise HTTPException(status_code=404, detail="Could not fetch enough fund data")

    # Current weights
    total = sum(f.investment_amount or f.monthly_sip or 1 for f in req.funds)
    current_weights = {
        f.scheme_code: (f.investment_amount or f.monthly_sip or 1) / total
        for f in req.funds
    }

    result = optimize_portfolio(nav_dict, current_weights, req.target)

    # Add fund names to output
    name_map = {f.scheme_code: f.name or f.scheme_code for f in req.funds}
    result["fund_names"] = name_map

    return result


@router.post("/efficient-frontier")
def efficient_frontier(req: OptimizeRequest):
    """Generate efficient frontier data."""
    if len(req.funds) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 funds")

    codes = [f.scheme_code for f in req.funds]
    nav_dict = fetch_multiple_navs(codes)

    if len(nav_dict) < 2:
        raise HTTPException(status_code=404, detail="Could not fetch enough fund data")

    result = generate_efficient_frontier(nav_dict, n_points=40)

    name_map = {f.scheme_code: f.name or f.scheme_code for f in req.funds}
    result["fund_names"] = name_map

    return result


@router.post("/compare")
def compare(req: PerformanceRequest):
    """
    Rich side-by-side fund comparison: returns over multiple windows,
    risk metrics (vol/Sharpe/Sortino/MaxDD), pairwise correlation matrix,
    best/worst calendar year, and a one-line verdict per fund.
    Up to ~6 funds at a time.
    """
    import numpy as np
    codes = [f.scheme_code for f in req.funds]
    nav_dict = fetch_multiple_navs(codes)
    if not nav_dict:
        raise HTTPException(status_code=404, detail="No fund data found")

    name_map = {f.scheme_code: f.name or f.scheme_code for f in req.funds}
    cat_map  = {f.scheme_code: f.category or "—" for f in req.funds}

    funds_out = []
    return_series = {}   # for correlation matrix

    for code, raw in nav_dict.items():
        df = raw.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)
        if len(df) < 30:
            continue
        df = clean_nav_data(df)

        latest_nav   = float(df["nav"].iloc[-1])
        latest_date  = str(df["date"].iloc[-1].date())
        inception    = str(df["date"].iloc[0].date())
        years_avail  = (df["date"].iloc[-1] - df["date"].iloc[0]).days / 365.25

        # Multi-window returns
        def _ret(days):
            if len(df) <= days: return None
            start = float(df["nav"].iloc[-(days + 1)])
            return round((latest_nav - start) / max(start, 1e-9) * 100, 2)

        def _cagr(days):
            r = _ret(days)
            if r is None: return None
            yrs = days / 365.25
            return round(((1 + r/100) ** (1/yrs) - 1) * 100, 2) if yrs >= 1 else r

        returns = {
            "1m":  _ret(30),
            "3m":  _ret(90),
            "6m":  _ret(180),
            "1y":  _cagr(365),
            "3y":  _cagr(1095),
            "5y":  _cagr(1825),
            "inception": round((((latest_nav / float(df["nav"].iloc[0])) ** (1/max(years_avail, 0.01))) - 1) * 100, 2) if years_avail >= 0.5 else None,
        }

        # Risk metrics
        risk = calculate_risk_score(df)
        dd   = risk.get("max_drawdown", {}) if isinstance(risk.get("max_drawdown"), dict) else {}

        # Best/worst calendar year
        yearly = df.copy()
        yearly["year"] = yearly["date"].dt.year
        first_per_yr = yearly.groupby("year")["nav"].first()
        last_per_yr  = yearly.groupby("year")["nav"].last()
        yearly_ret   = ((last_per_yr - first_per_yr) / first_per_yr * 100).dropna()
        best_yr  = {"year": int(yearly_ret.idxmax()), "return_pct": round(float(yearly_ret.max()), 2)} if len(yearly_ret) else None
        worst_yr = {"year": int(yearly_ret.idxmin()), "return_pct": round(float(yearly_ret.min()), 2)} if len(yearly_ret) else None

        # Verdict — combine Sharpe + drawdown + recovery
        sharpe = risk.get("sharpe_ratio", 0)
        dd_pct = dd.get("max_drawdown_pct", 0)
        if sharpe >= 1.2 and dd_pct < 30:
            verdict = "🏆 Strong risk-adjusted performer"
        elif sharpe >= 0.8:
            verdict = "👍 Decent returns for the risk"
        elif sharpe >= 0.3:
            verdict = "⚠️ Modest reward for volatility"
        else:
            verdict = "❌ High risk, low risk-adjusted return"

        funds_out.append({
            "scheme_code":   code,
            "name":          name_map.get(code, code),
            "category":      cat_map.get(code, "—"),
            "latest_nav":    round(latest_nav, 2),
            "latest_date":   latest_date,
            "inception":     inception,
            "years_history": round(years_avail, 1),
            "returns":       returns,
            "risk": {
                "volatility_pct":  risk.get("volatility_pct"),
                "sharpe_ratio":    risk.get("sharpe_ratio"),
                "sortino_ratio":   risk.get("sortino_ratio"),
                "max_drawdown_pct": dd.get("max_drawdown_pct"),
                "recovery_days":   dd.get("recovery_days"),
                "risk_score":      risk.get("risk_score"),
                "risk_category":   risk.get("risk_category"),
            },
            "best_year":  best_yr,
            "worst_year": worst_yr,
            "verdict":    verdict,
        })

        # Build aligned return series for correlation (use weekly to reduce noise)
        weekly = df.set_index("date")["nav"].resample("W").last().pct_change().dropna()
        return_series[code] = weekly

    # Pairwise correlation matrix (only if we have ≥2 funds with overlap)
    correlation = {}
    if len(return_series) >= 2:
        aligned = pd.concat(return_series, axis=1).dropna()
        if len(aligned) >= 12:  # at least 12 weeks of overlap
            corr_df = aligned.corr()
            correlation = {
                a: {b: round(float(corr_df.loc[a, b]), 3) for b in corr_df.columns}
                for a in corr_df.index
            }

    return {
        "funds":       funds_out,
        "correlation": correlation,
    }


# ── Tax Loss Harvesting ────────────────────────────────────────────────────────

@router.post("/tax-harvest")
def tax_harvest(req: PerformanceRequest):
    """
    Identify loss positions in the portfolio and compute tax savings
    from harvesting them against existing gains.
    """
    # Run performance analysis first to get current values
    perf_results = []
    for fund in req.funds:
        df = fetch_nav_history(fund.scheme_code)
        if df is None or df.empty:
            continue
        df = clean_nav_data(df)
        effective_start = fund.purchase_date or req.start_date
        if fund.transactions and len(fund.transactions) > 0:
            txn_list = [{"date": t.date, "amount": t.amount, "type": t.type} for t in fund.transactions]
            perf = simulate_with_transactions(df, txn_list)
        elif req.mode == "sip" and fund.monthly_sip > 0:
            perf = simulate_sip_growth(df, fund.monthly_sip, effective_start, req.end_date)
        elif fund.investment_amount > 0:
            perf = simulate_lumpsum_growth(df, fund.investment_amount, effective_start)
        else:
            continue

        perf_results.append({
            "scheme_code":    fund.scheme_code,
            "name":           fund.name or fund.scheme_code,
            "total_invested": perf.get("total_invested", 0),
            "current_value":  perf.get("current_value", 0),
            "purchase_date":  fund.purchase_date,
            "category":       fund.category,
        })

    if not perf_results:
        raise HTTPException(status_code=400, detail="No fund data available for analysis")

    result = compute_tax_harvest(perf_results)
    return result


# ── Market Regime Analysis ─────────────────────────────────────────────────────

NIFTY_PROXY_CODE = "118741"   # Nippon India Index Fund – Nifty 50

@router.post("/regime")
def regime_analysis(req: RiskRequest):
    """
    Detect current market regime (Bull / Bear / Sideways) using GMM on
    Nifty 50 rolling returns, then show per-fund performance in each regime.
    """
    # Fetch benchmark
    benchmark_df = fetch_nav_history(NIFTY_PROXY_CODE)
    if benchmark_df is None or benchmark_df.empty:
        raise HTTPException(status_code=404, detail="Could not fetch benchmark data")
    benchmark_df = clean_nav_data(benchmark_df)

    # Detect regimes
    regime_result = detect_regimes(benchmark_df)
    if "error" in regime_result:
        raise HTTPException(status_code=400, detail=regime_result["error"])

    # Fetch fund NAVs
    codes     = [f.scheme_code for f in req.funds]
    nav_dict  = fetch_multiple_navs(codes)
    name_map  = {f.scheme_code: f.name or f.scheme_code for f in req.funds}

    # Clean each fund's NAV
    cleaned_nav_dict = {}
    for code, df in nav_dict.items():
        cleaned_nav_dict[code] = clean_nav_data(df)

    fund_perf = compute_fund_regime_performance(cleaned_nav_dict, name_map, regime_result)

    # Strip the internal pandas DataFrame before returning
    regime_result.pop("regime_dates", None)

    return {
        **regime_result,
        **fund_perf,
    }


# ── Portfolio Overlap ──────────────────────────────────────────────────────────

@router.post("/overlap")
def portfolio_overlap(req: RiskRequest):
    """
    Compute pairwise NAV correlation between all portfolio funds
    and return a diversification score + high-overlap warnings.
    """
    if len(req.funds) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 funds for overlap analysis")

    codes    = [f.scheme_code for f in req.funds]
    nav_dict = fetch_multiple_navs(codes)

    if len(nav_dict) < 2:
        raise HTTPException(status_code=404, detail="Could not fetch enough fund data")

    # Clean NAVs
    cleaned = {code: clean_nav_data(df) for code, df in nav_dict.items()}
    name_map = {f.scheme_code: f.name or f.scheme_code for f in req.funds}

    result = compute_overlap(cleaned, name_map)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# ── Behavioral Bias Analyzer ──────────────────────────────────────────────────

@router.post("/behavioral-bias")
def behavioral_bias(req: BehavioralBiasRequest):
    """
    Analyse each fund's transaction history for behavioural biases:
    disposition effect, overtrading, and recency bias.
    Quantifies the ₹ cost of each bias vs a passive hold strategy.
    Requires funds to have actual transaction history.
    """
    results = []

    for fund in req.funds:
        if not fund.transactions or len(fund.transactions) == 0:
            results.append({
                "fund_name": fund.name or fund.scheme_code,
                "scheme_code": fund.scheme_code,
                "has_transactions": False,
                "biases": [],
                "total_bias_cost": 0,
                "detected_count": 0,
                "passive_comparison": {},
                "summary_narrative": "No transaction history. Add buy/sell records in Portfolio Builder.",
            })
            continue

        df = fetch_nav_history(fund.scheme_code)
        if df is None or df.empty:
            results.append({"scheme_code": fund.scheme_code, "error": "No NAV data available"})
            continue

        df = clean_nav_data(df)
        txn_list = [{"date": t.date, "amount": t.amount, "type": t.type} for t in fund.transactions]

        analysis = analyze_behavioral_biases(df, txn_list, fund.name or fund.scheme_code)
        analysis["scheme_code"] = fund.scheme_code
        results.append(analysis)

    total_cost = sum(r.get("total_bias_cost", 0) for r in results)
    funds_with_bias = sum(1 for r in results if r.get("detected_count", 0) > 0)

    return {
        "fund_analyses": results,
        "portfolio_summary": {
            "total_bias_cost": round(total_cost, 2),
            "funds_with_bias": funds_with_bias,
            "funds_analysed": len(results),
        },
    }


# ── Fama-French Factor Attribution ────────────────────────────────────────────

@router.post("/factor-attribution")
def factor_attribution(req: FactorAttributionRequest):
    """
    Decompose each fund's returns into market beta, size (SMB), midcap (MMB),
    and true alpha using a 3-factor OLS regression.
    Uses Indian index funds as factor proxies.
    """
    # Fetch factor index NAVs (shared across all funds)
    factor_navs_raw = fetch_multiple_navs(list(FACTOR_CODES.values()))
    factor_navs = {}
    for label, code in FACTOR_CODES.items():
        if code in factor_navs_raw:
            factor_navs[label] = clean_nav_data(factor_navs_raw[code])

    if len(factor_navs) < 3:
        raise HTTPException(
            status_code=503,
            detail="Could not fetch one or more factor index NAVs. Try again later.",
        )

    # Build TER map: user-provided values take precedence, otherwise auto-lookup
    from data.expense_ratios import get_expense_ratio
    er_map = req.expense_ratios or {}
    results = []

    for fund in req.funds:
        df = fetch_nav_history(fund.scheme_code)
        if df is None or df.empty:
            results.append({"scheme_code": fund.scheme_code, "error": "No NAV data available"})
            continue

        df = clean_nav_data(df)

        # Auto-lookup TER if user didn't provide one
        expense_ratio = er_map.get(fund.scheme_code)
        ter_source = "user"
        if expense_ratio is None:
            expense_ratio = get_expense_ratio(
                scheme_code=fund.scheme_code,
                name=fund.name,
                category=fund.category,
                plan_type=getattr(fund, "plan_type", None) or "Direct",
            )
            ter_source = "auto"

        result = run_factor_attribution(df, factor_navs, fund.name or fund.scheme_code, expense_ratio)
        result["scheme_code"] = fund.scheme_code
        result["ter_source"] = ter_source   # "user" | "auto"
        results.append(result)

    return {
        "fund_attributions": results,
        "factor_proxies": {
            "market":   "Nippon India Nifty 50 Index Fund (code 118741)",
            "smb":      "SBI Nifty Smallcap 250 - Nifty 50 (codes 150677, 118741)",
            "mmb":      "SBI Nifty Midcap 150 - Nifty 50 (codes 150673, 118741)",
            "risk_free": "6.5% p.a. Indian G-sec proxy",
        },
    }


@router.post("/portfolio-metrics")
def portfolio_metrics(req: PortfolioMetricsRequest):
    """
    Simplified portfolio health metrics that don't require transaction history:
    - Churn Rate: % of funds <6 months old (turnover risk)
    - Concentration Risk: category overlap detection
    - Tax Efficiency Score: % of funds LTCG-eligible
    """
    funds_dict = [
        {
            "scheme_code": f.scheme_code,
            "name": f.name,
            "category": f.category,
            "purchase_date": f.purchase_date,
            "investment_amount": f.investment_amount
        }
        for f in req.funds
    ]
    metrics = compute_simplified_biases(funds_dict)
    return metrics


# ── Portfolio Health Score ─────────────────────────────────────────────
@router.post("/health-score")
def health_score(req: PerformanceRequest):
    """
    Compute a composite 0–100 Portfolio Health Score based on:
    diversification, concentration, cost drag (Direct vs Regular),
    risk-adjusted return (portfolio Sharpe), and tax efficiency.
    """
    if not req.funds:
        return calculate_health_score([], {}, None)

    funds_dict = [{
        "scheme_code":       f.scheme_code,
        "name":              f.name or f.scheme_code,
        "category":          f.category,
        "investment_amount": f.investment_amount,
        "monthly_sip":       f.monthly_sip,
        "purchase_date":     f.purchase_date,
        "plan_type":         f.plan_type,
    } for f in req.funds]

    # Fetch NAVs for correlation calc + portfolio Sharpe
    codes = [f["scheme_code"] for f in funds_dict]
    nav_dict = fetch_multiple_navs(codes)
    cleaned = {c: clean_nav_data(df) for c, df in nav_dict.items()} if nav_dict else {}

    # Compute weights and portfolio Sharpe
    total = sum((f["investment_amount"] or 0) + (f["monthly_sip"] or 0) * 12 for f in funds_dict) or 1
    weights = {f["scheme_code"]: ((f["investment_amount"] or 0) + (f["monthly_sip"] or 0) * 12) / total for f in funds_dict}

    port_sharpe = None
    if len(cleaned) >= 2:
        try:
            port_risk = analyze_portfolio_risk(cleaned, weights)
            port_sharpe = port_risk.get("sharpe_ratio")
        except Exception:
            port_sharpe = None
    elif len(cleaned) == 1:
        # Single fund — use its own Sharpe
        only = next(iter(cleaned.values()))
        try:
            r = calculate_risk_score(only)
            port_sharpe = r.get("sharpe_ratio")
        except Exception:
            port_sharpe = None

    return calculate_health_score(funds_dict, cleaned, port_sharpe)


# ── Historical Snapshot (drawdown replay) ──────────────────────────────
class HistoricalSnapshotRequest(BaseModel):
    funds: List[FundInput]
    as_of_date: str  # "YYYY-MM-DD"


@router.post("/historical-snapshot")
def historical_snapshot(req: HistoricalSnapshotRequest):
    """
    Compute what the user's portfolio value would have been on a past date.
    Uses actual NAV history + each fund's purchase_date + monthly_sip.
    Also returns drawdown-from-peak and days-since-peak for that date.
    """
    try:
        target = pd.to_datetime(req.as_of_date).normalize()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid as_of_date (need YYYY-MM-DD)")

    fund_snapshots = []
    total_invested = 0.0
    total_value    = 0.0
    max_ever_value = 0.0   # for drawdown calc
    portfolio_curve = {}  # date -> total portfolio value across all funds

    for f in req.funds:
        df = fetch_nav_history(f.scheme_code)
        if df is None or df.empty:
            continue
        df = clean_nav_data(df)
        df["date"] = pd.to_datetime(df["date"])

        # Only include funds that existed by the target date
        df_upto = df[df["date"] <= target]
        if df_upto.empty:
            continue

        # Simulate lumpsum + SIP up to target date, using each fund's purchase_date
        purchase_dt = pd.to_datetime(f.purchase_date) if f.purchase_date else df["date"].min()
        if purchase_dt > target:
            continue  # fund not purchased by target date

        # Filter NAVs between purchase and target
        active = df_upto[df_upto["date"] >= purchase_dt].reset_index(drop=True)
        if active.empty:
            continue

        # Build the SIP schedule once, then evaluate units-held at each historical
        # sample date by summing only the SIPs whose date <= that sample date.
        first_nav = float(active.iloc[0]["nav"])
        target_nav = float(active.iloc[-1]["nav"])

        # Each entry: (event_date, units_added, invested_added)
        events: List = []
        if f.investment_amount and first_nav > 0:
            events.append((purchase_dt, (f.investment_amount / first_nav), float(f.investment_amount)))

        if f.monthly_sip and f.monthly_sip > 0:
            month_starts = pd.date_range(start=purchase_dt.replace(day=1), end=target, freq="MS")
            for m in month_starts:
                if m < purchase_dt: continue
                after = active[active["date"] >= m]
                if after.empty: continue
                nav_at = float(after.iloc[0]["nav"])
                sip_dt = after.iloc[0]["date"]
                events.append((sip_dt, f.monthly_sip / nav_at, float(f.monthly_sip)))

        events.sort(key=lambda e: e[0])
        total_units    = sum(u for _, u, _ in events)
        invested_this  = sum(a for _, _, a in events)
        current_val    = total_units * target_nav

        # Portfolio curve — at each sampled historical date, compute units-held
        # by summing only the SIP events with event_date <= sample_date.
        step = max(1, len(active) // 60)
        event_dates  = [e[0] for e in events]
        event_units  = [e[1] for e in events]
        # Cumulative units running total, aligned to events
        cum_units = []
        running = 0.0
        for u in event_units:
            running += u
            cum_units.append(running)

        for i in range(0, len(active), step):
            row = active.iloc[i]
            row_date = row["date"]
            # Binary-search-friendly: how many events happened by row_date?
            idx = 0
            for j, ed in enumerate(event_dates):
                if ed <= row_date:
                    idx = j + 1
                else:
                    break
            units_at = cum_units[idx - 1] if idx > 0 else 0.0
            if units_at == 0: continue
            date_str = str(row_date.date())
            portfolio_curve[date_str] = portfolio_curve.get(date_str, 0) + units_at * float(row["nav"])

        fund_snapshots.append({
            "scheme_code":   f.scheme_code,
            "name":          f.name or f.scheme_code,
            "invested":      round(invested_this, 2),
            "current_value": round(current_val, 2),
            "gain":          round(current_val - invested_this, 2),
            "gain_pct":      round((current_val - invested_this) / max(invested_this, 1) * 100, 2),
            "target_nav":    round(target_nav, 4),
        })
        total_invested += invested_this
        total_value    += current_val

    # Sort portfolio curve chronologically
    curve = [{"date": d, "value": round(v, 2)} for d, v in sorted(portfolio_curve.items())]

    # Drawdown analytics from the curve
    peak_value = 0
    peak_date = None
    drawdown_pct = 0
    for point in curve:
        if point["value"] > peak_value:
            peak_value = point["value"]
            peak_date = point["date"]
    if peak_value > 0:
        drawdown_pct = (total_value - peak_value) / peak_value * 100

    return {
        "as_of_date":    req.as_of_date,
        "total_invested": round(total_invested, 2),
        "total_value":    round(total_value, 2),
        "gain":           round(total_value - total_invested, 2),
        "gain_pct":       round((total_value - total_invested) / max(total_invested, 1) * 100, 2),
        "drawdown_from_peak_pct": round(drawdown_pct, 2),
        "peak_value":     round(peak_value, 2),
        "peak_date":      peak_date,
        "funds":          fund_snapshots,
        "portfolio_curve": curve,
    }
