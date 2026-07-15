"""
Portfolio Health Score — a single 0-100 gauge summarising overall health.

Composite of five sub-scores:
  1. Diversification (avg pairwise correlation from weekly returns)
  2. Concentration  (max single-fund weight)
  3. Cost drag     (share of assets in Regular plans, expense ratio penalty)
  4. Risk profile  (portfolio-level Sharpe ratio, higher = better)
  5. Tax efficiency (share of assets in LTCG regime, i.e. held ≥1 year)

Each sub-score is 0-100. The composite is weighted:
  0.25 diversification + 0.20 concentration + 0.15 cost + 0.25 risk + 0.15 tax
"""
from datetime import date, datetime
from typing import Dict, List
import numpy as np
import pandas as pd


def _pairwise_correlation(nav_dict: Dict[str, pd.DataFrame]) -> float:
    """Average absolute pairwise correlation across weekly returns. 0 = perfectly diversified, 1 = redundant."""
    if len(nav_dict) < 2:
        return 0.0
    series = {}
    for code, df in nav_dict.items():
        d = df.copy()
        d["date"] = pd.to_datetime(d["date"])
        d = d.set_index("date")["nav"].resample("W").last().pct_change().dropna()
        if len(d) >= 12:
            series[code] = d
    if len(series) < 2:
        return 0.0
    aligned = pd.concat(series, axis=1).dropna()
    if len(aligned) < 12:
        return 0.0
    corr = aligned.corr()
    # Extract upper triangle (excluding diagonal)
    vals = corr.values[np.triu_indices_from(corr.values, k=1)]
    return float(np.mean(np.abs(vals))) if len(vals) > 0 else 0.0


def _holding_years(purchase_date_str) -> float:
    if not purchase_date_str:
        return 0.0
    try:
        pd_ = datetime.strptime(purchase_date_str, "%Y-%m-%d").date()
        return (date.today() - pd_).days / 365.25
    except Exception:
        return 0.0


def calculate_health_score(funds: List[Dict], nav_dict: Dict[str, pd.DataFrame],
                            portfolio_sharpe: float = None) -> Dict:
    """
    Return a comprehensive health-score payload.

    Args:
      funds: list of {scheme_code, name, category, investment_amount, monthly_sip,
                      purchase_date, plan_type}
      nav_dict: {scheme_code -> DataFrame(date, nav)} for correlation calc
      portfolio_sharpe: pre-computed portfolio Sharpe (or None)

    Returns:
      { overall: 0-100, grade: 'A+'..'F', components: {...}, recommendations: [...] }
    """
    if not funds:
        return {
            "overall": 0,
            "grade": "N/A",
            "message": "Add funds to your portfolio to compute a health score.",
            "components": {},
            "recommendations": [],
        }

    n = len(funds)
    total_invested = sum((f.get("investment_amount", 0) or 0) + (f.get("monthly_sip", 0) or 0) * 12 for f in funds) or 1
    weights = [((f.get("investment_amount", 0) or 0) + (f.get("monthly_sip", 0) or 0) * 12) / total_invested for f in funds]

    recs = []

    # ── 1. Diversification ──────────────────────────────────────────────
    avg_corr = _pairwise_correlation(nav_dict) if nav_dict else 0.5
    # 0.0 corr → 100, 0.5 → 75, 0.8 → 40, 1.0 → 0
    div_score = round(max(0, 100 - avg_corr * 100), 1)
    if n == 1:
        div_score = 30
        recs.append("Add 3–5 uncorrelated funds to improve diversification.")
    elif avg_corr > 0.75:
        recs.append(f"Your funds move together too much (avg correlation {avg_corr:.2f}). Consider adding a debt or international fund.")
    elif avg_corr < 0.3:
        pass  # Already well-diversified

    # ── 2. Concentration ────────────────────────────────────────────────
    max_wt = max(weights) if weights else 1
    # 0.25 wt → 100, 0.4 → 70, 0.6 → 30, 1.0 → 0
    concentration_score = round(max(0, 100 - (max_wt - 0.25) * 250), 1) if max_wt > 0.25 else 100.0
    if max_wt > 0.5:
        top = funds[weights.index(max_wt)]
        recs.append(f"'{top.get('name','a fund')}' holds {max_wt*100:.0f}% of your portfolio. Consider rebalancing to <40%.")

    # Category concentration
    cat_map = {}
    for i, f in enumerate(funds):
        c = f.get("category") or "Unknown"
        cat_map[c] = cat_map.get(c, 0) + weights[i]
    max_cat_wt = max(cat_map.values()) if cat_map else 0
    if max_cat_wt > 0.7:
        top_cat = max(cat_map, key=cat_map.get)
        recs.append(f"{max_cat_wt*100:.0f}% of your portfolio is in {top_cat}. Consider spreading across categories.")

    # ── 3. Cost drag (Regular vs Direct) ────────────────────────────────
    regular_wt = sum(w for f, w in zip(funds, weights) if (f.get("plan_type") or "").lower() == "regular")
    # 0% regular → 100, 100% regular → 40 (Regular ≈ 1% higher TER → compounds)
    cost_score = round(100 - regular_wt * 60, 1)
    if regular_wt > 0.3:
        recs.append(f"{regular_wt*100:.0f}% of your portfolio is in Regular plans. Switching to Direct could save 0.5–1.5%/year in fees.")

    # ── 4. Risk-adjusted return (from Sharpe) ───────────────────────────
    # Sharpe 0 → 40, 1.0 → 75, 1.5+ → 100
    if portfolio_sharpe is None or not isinstance(portfolio_sharpe, (int, float)):
        risk_score = 50
    elif portfolio_sharpe < 0:
        risk_score = 20
    else:
        risk_score = min(100, 40 + portfolio_sharpe * 40)
    risk_score = round(risk_score, 1)
    if portfolio_sharpe is not None and portfolio_sharpe < 0.5:
        recs.append("Your risk-adjusted return (Sharpe) is low. Consider consolidating into higher-quality funds.")

    # ── 5. Tax efficiency ────────────────────────────────────────────────
    # Effective contribution per fund = lumpsum + one year's worth of SIP.
    # Without the SIP term, a pure-SIP investor gets amt=0 for every fund,
    # ltcg_pct=0/1=0, and score is stuck at the 30-point floor with the
    # wrong "consider LTCG timing" recommendation.
    def _fund_amt(f):
        return (f.get("investment_amount", 0) or 0) + (f.get("monthly_sip", 0) or 0) * 12

    total_amt = sum(_fund_amt(f) for f in funds) or 1
    ltcg_amt = 0
    stcg_amt = 0
    unknown_amt = 0
    for f in funds:
        amt = _fund_amt(f)
        yrs = _holding_years(f.get("purchase_date"))
        if yrs >= 1: ltcg_amt += amt
        elif yrs > 0: stcg_amt += amt
        else: unknown_amt += amt
    ltcg_pct = ltcg_amt / total_amt
    # 100% LTCG → 100, 100% STCG → 30
    tax_score = round(30 + ltcg_pct * 70, 1)
    if stcg_amt / total_amt > 0.3:
        recs.append(f"{(stcg_amt/total_amt)*100:.0f}% of your assets are in STCG regime (<1yr). Wait or plan withdrawals to reduce tax.")

    # ── Composite ────────────────────────────────────────────────────────
    overall = round(
        0.25 * div_score +
        0.20 * concentration_score +
        0.15 * cost_score +
        0.25 * risk_score +
        0.15 * tax_score, 1
    )

    # Grade
    if   overall >= 90: grade, tone = "A+", "Excellent"
    elif overall >= 80: grade, tone = "A",  "Strong"
    elif overall >= 70: grade, tone = "B",  "Solid"
    elif overall >= 60: grade, tone = "C",  "Fair"
    elif overall >= 50: grade, tone = "D",  "Needs work"
    else:               grade, tone = "F",  "Underperforming"

    if not recs:
        recs.append("Your portfolio looks healthy overall. Continue monitoring quarterly and rebalance as needed.")

    return {
        "overall": overall,
        "grade": grade,
        "tone": tone,
        "components": {
            "diversification":   {"score": div_score,             "weight": 25, "detail": f"Avg pairwise correlation: {avg_corr:.2f}"},
            "concentration":     {"score": concentration_score,   "weight": 20, "detail": f"Largest single-fund weight: {max_wt*100:.0f}%"},
            "cost_efficiency":   {"score": cost_score,             "weight": 15, "detail": f"{regular_wt*100:.0f}% in Regular plans"},
            "risk_adjusted":     {"score": risk_score,             "weight": 25, "detail": f"Portfolio Sharpe: {portfolio_sharpe if portfolio_sharpe is not None else 'n/a'}"},
            "tax_efficiency":    {"score": tax_score,             "weight": 15, "detail": f"{ltcg_pct*100:.0f}% in LTCG regime (≥1y)"},
        },
        "recommendations": recs,
    }
