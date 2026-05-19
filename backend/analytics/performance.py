"""
Performance Analytics — CAGR, absolute returns, rolling returns, portfolio growth.

All calculations follow standard financial formulae used in the Indian MF industry.
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime


def calculate_cagr(start_value: float, end_value: float, years: float) -> float:
    """
    Compound Annual Growth Rate.
    CAGR = (end/start)^(1/years) - 1
    """
    if start_value <= 0 or years <= 0:
        return 0.0
    return (pow(end_value / start_value, 1.0 / years) - 1) * 100


def calculate_absolute_return(invested: float, current: float) -> float:
    """Absolute return percentage = (current - invested) / invested × 100"""
    if invested <= 0:
        return 0.0
    return ((current - invested) / invested) * 100


def calculate_xirr(cashflows: List[Dict]) -> float:
    """
    Extended Internal Rate of Return for irregular cash flows.
    cashflows: list of {"date": datetime, "amount": float}
    Negative amounts = investments, positive = redemptions/current value.

    Uses Newton's method to solve: Σ cf_i / (1+r)^(t_i) = 0
    """
    if len(cashflows) < 2:
        return 0.0

    # Sort by date
    cashflows = sorted(cashflows, key=lambda x: x["date"])
    dates = [cf["date"] for cf in cashflows]
    amounts = [cf["amount"] for cf in cashflows]

    # Day fractions from first date
    t0 = dates[0]
    day_fracs = [(d - t0).days / 365.25 for d in dates]

    # Newton's method
    rate = 0.1  # initial guess 10%
    converged = False
    for _ in range(200):
        f_val = sum(a / pow(1 + rate, t) for a, t in zip(amounts, day_fracs))
        f_deriv = sum(-t * a / pow(1 + rate, t + 1) for a, t in zip(amounts, day_fracs))

        if abs(f_deriv) < 1e-12:
            break
        new_rate = rate - f_val / f_deriv

        if abs(new_rate - rate) < 1e-8:
            rate = new_rate
            converged = True
            break
        rate = new_rate

        # Clamp to prevent divergence
        rate = max(min(rate, 10.0), -0.99)

    # If not converged, check if the residual is acceptably small
    if not converged:
        f_val = sum(a / pow(1 + rate, t) for a, t in zip(amounts, day_fracs))
        if abs(f_val) > 1.0:
            return None  # did not converge — return None instead of a misleading value

    return rate * 100


def calculate_rolling_returns(nav_df: pd.DataFrame, window_years: int = 1) -> pd.DataFrame:
    """
    Calculate rolling returns over a window.
    Returns DataFrame with columns: ['date', 'rolling_return']
    """
    df = nav_df.copy()
    window_days = int(window_years * 365)

    if len(df) < window_days:
        return pd.DataFrame(columns=["date", "rolling_return"])

    returns = []
    for i in range(window_days, len(df)):
        start_nav = df.iloc[i - window_days]["nav"]
        end_nav = df.iloc[i]["nav"]
        ret = calculate_cagr(start_nav, end_nav, window_years)
        returns.append({"date": df.iloc[i]["date"], "rolling_return": ret})

    return pd.DataFrame(returns)


def simulate_sip_growth(
    nav_df: pd.DataFrame,
    monthly_sip: float,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict:
    """
    Simulate SIP investment and compute growth curve.

    Returns:
    {
        "total_invested": float,
        "current_value": float,
        "absolute_return": float,
        "cagr": float,
        "units_accumulated": float,
        "growth_curve": [{"date": str, "invested": float, "value": float}, ...]
    }
    """
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])

    if start_date:
        df = df[df["date"] >= pd.to_datetime(start_date)]
    if end_date:
        df = df[df["date"] <= pd.to_datetime(end_date)]

    if df.empty:
        return {"total_invested": 0, "current_value": 0, "absolute_return": 0,
                "cagr": 0, "units_accumulated": 0, "growth_curve": []}

    # Resample to monthly (first trading day of each month)
    monthly = df.set_index("date").resample("MS").first().dropna().reset_index()

    units = 0.0
    total_invested = 0.0
    growth_curve = []

    for _, row in monthly.iterrows():
        # Buy units with SIP amount
        nav = row["nav"]
        new_units = monthly_sip / nav
        units += new_units
        total_invested += monthly_sip

        current_value = units * nav
        growth_curve.append({
            "date": row["date"].strftime("%Y-%m-%d"),
            "invested": round(total_invested, 2),
            "value": round(current_value, 2),
        })

    # Final value using last available NAV
    final_nav = df.iloc[-1]["nav"]
    current_value = units * final_nav
    years = (df.iloc[-1]["date"] - df.iloc[0]["date"]).days / 365.25

    # ── XIRR: correct return metric for SIP (accounts for timing of each instalment) ──
    # Each monthly instalment is a negative cashflow; current value is the positive terminal cashflow.
    xirr_cashflows = []
    cumulative_invested = 0.0
    for _, row in monthly.iterrows():
        cumulative_invested += monthly_sip
        xirr_cashflows.append({"date": row["date"].to_pydatetime(), "amount": -monthly_sip})
    # Terminal redemption at latest NAV
    xirr_cashflows.append({"date": pd.Timestamp(df.iloc[-1]["date"]).to_pydatetime(), "amount": current_value})
    xirr_pct = calculate_xirr(xirr_cashflows) if len(xirr_cashflows) > 1 else 0

    return {
        "total_invested": round(total_invested, 2),
        "current_value": round(current_value, 2),
        "absolute_return": round(calculate_absolute_return(total_invested, current_value), 2),
        # xirr_pct is the authoritative SIP return — accounts for timing of each instalment
        "xirr_pct": round(xirr_pct, 2),
        # cagr here is simple lumpsum-equivalent, kept for reference only
        "cagr": round(calculate_cagr(total_invested, current_value, max(years, 0.01)), 2) if years > 0 else 0,
        "units_accumulated": round(units, 4),
        "growth_curve": growth_curve,
    }


def simulate_with_transactions(nav_df: pd.DataFrame, transactions: List[Dict]) -> Dict:
    """
    Compute accurate portfolio value and XIRR from actual transaction history.

    Each transaction: {"date": "YYYY-MM-DD", "amount": float, "type": "buy"|"sip"|"sell"}
    Buy/SIP = units purchased at NAV on that date (negative cash flow).
    Sell = redemption at NAV on that date (positive cash flow); amount is ₹ redeemed.

    XIRR is computed from actual cash flows — no assumptions about regularity.
    """
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    txns = sorted(transactions, key=lambda x: x["date"])

    units = 0.0
    total_invested = 0.0
    total_redeemed = 0.0
    xirr_cashflows = []

    for txn in txns:
        txn_date = pd.to_datetime(txn["date"])
        amount = float(txn["amount"])
        txn_type = txn.get("type", "buy").lower()

        # NAV on or closest before transaction date
        nav_slice = df[df["date"] <= txn_date]
        if nav_slice.empty:
            nav_slice = df.head(1)
        nav = float(nav_slice.iloc[-1]["nav"])

        if txn_type in ("buy", "sip"):
            units += amount / nav
            total_invested += amount
            xirr_cashflows.append({"date": txn_date.to_pydatetime(), "amount": -amount})
        elif txn_type == "sell":
            # amount = ₹ value to redeem
            units_sold = min(amount / nav, units)
            units = max(0.0, units - units_sold)
            total_redeemed += amount
            xirr_cashflows.append({"date": txn_date.to_pydatetime(), "amount": amount})

    final_nav = float(df.iloc[-1]["nav"])
    current_value = round(units * final_nav, 2)

    # Terminal positive cash flow = current unredeemed value
    if current_value > 0:
        xirr_cashflows.append({
            "date": df.iloc[-1]["date"].to_pydatetime(),
            "amount": current_value,
        })

    xirr_pct = calculate_xirr(xirr_cashflows) if len(xirr_cashflows) > 1 else 0.0
    gross_invested = round(total_invested, 2)
    redeemed = round(total_redeemed, 2)
    # True P&L = (what we hold today + what we already pulled out) - what we put in
    gain = round(current_value + redeemed - gross_invested, 2)
    abs_return_pct = round((gain / gross_invested * 100) if gross_invested > 0 else 0.0, 2)

    return {
        "total_invested": gross_invested,        # gross sum of buys (always non-negative)
        "current_value": current_value,
        "total_redeemed": redeemed,              # cash already pulled out
        "gain": gain,                            # accurate P&L incl. realised gains
        "absolute_return": abs_return_pct,
        "xirr_pct": round(xirr_pct, 2),
        "units_accumulated": round(units, 4),
        "transaction_count": len(transactions),
        "data_source": "actual_transactions",
        "growth_curve": [],
    }


def simulate_lumpsum_growth(
    nav_df: pd.DataFrame,
    investment_amount: float,
    start_date: Optional[str] = None,
) -> Dict:
    """
    Simulate lumpsum investment growth.
    """
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])

    if start_date:
        df = df[df["date"] >= pd.to_datetime(start_date)]

    if df.empty:
        return {"total_invested": 0, "current_value": 0, "absolute_return": 0,
                "cagr": 0, "growth_curve": []}

    buy_nav = df.iloc[0]["nav"]
    units = investment_amount / buy_nav

    growth_curve = []
    # Sample weekly for chart efficiency
    weekly = df.set_index("date").resample("W").last().dropna().reset_index()
    for _, row in weekly.iterrows():
        value = units * row["nav"]
        growth_curve.append({
            "date": row["date"].strftime("%Y-%m-%d"),
            "invested": round(investment_amount, 2),
            "value": round(value, 2),
        })

    final_value = units * df.iloc[-1]["nav"]
    years = (df.iloc[-1]["date"] - df.iloc[0]["date"]).days / 365.25

    return {
        "total_invested": round(investment_amount, 2),
        "current_value": round(final_value, 2),
        "absolute_return": round(calculate_absolute_return(investment_amount, final_value), 2),
        "cagr": round(calculate_cagr(investment_amount, final_value, max(years, 0.01)), 2),
        "growth_curve": growth_curve,
    }


def compare_funds(nav_dict: Dict[str, pd.DataFrame], period_years: int = 5) -> List[Dict]:
    """
    Compare multiple funds over a common period.
    Returns list of fund performance summaries.
    """
    results = []
    for code, df in nav_dict.items():
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date")

        # Use last N years of data
        end_date = df["date"].max()
        start_date = end_date - pd.DateOffset(years=period_years)
        period_df = df[df["date"] >= start_date]

        if len(period_df) < 2:
            continue

        start_nav = period_df.iloc[0]["nav"]
        end_nav = period_df.iloc[-1]["nav"]
        actual_years = (period_df.iloc[-1]["date"] - period_df.iloc[0]["date"]).days / 365.25

        results.append({
            "scheme_code": code,
            "start_nav": round(start_nav, 2),
            "end_nav": round(end_nav, 2),
            "cagr": round(calculate_cagr(start_nav, end_nav, actual_years), 2),
            "absolute_return": round(calculate_absolute_return(start_nav, end_nav), 2),
            "period_years": round(actual_years, 1),
        })

    return sorted(results, key=lambda x: x["cagr"], reverse=True)
