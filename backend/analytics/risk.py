"""
Risk Analysis Engine — Volatility, drawdown, Sharpe ratio, and composite risk scoring.

Risk Score (0-10) combines volatility, max drawdown, and Sharpe ratio
into a single composite metric with thresholds for Low/Medium/High.
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional

import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import RISK_FREE_RATE, TRADING_DAYS_PER_YEAR, RISK_WEIGHT_VOLATILITY, RISK_WEIGHT_DRAWDOWN, RISK_WEIGHT_SHARPE


def _trading_day_returns(nav_df: pd.DataFrame) -> pd.Series:
    """
    Compute daily returns, filtering out synthetic zero-return rows
    from forward-fill (weekends/holidays). This ensures annualization
    with TRADING_DAYS_PER_YEAR (252) is correct.
    """
    returns = nav_df["nav"].pct_change().dropna()
    # Remove zero-return rows created by forward-fill on non-trading days
    return returns[returns != 0.0] if len(returns[returns != 0.0]) > 10 else returns


def calculate_volatility(nav_df: pd.DataFrame, annualize: bool = True) -> float:
    """
    Annualized volatility = std(daily_returns) × √252.
    Measures the dispersion of returns — higher = more risky.
    """
    returns = _trading_day_returns(nav_df)
    if returns.empty:
        return 0.0
    vol = returns.std()
    if annualize:
        vol *= np.sqrt(TRADING_DAYS_PER_YEAR)
    return round(vol * 100, 2)  # as percentage


def calculate_max_drawdown(nav_df: pd.DataFrame) -> Dict:
    """
    Maximum Drawdown = largest peak-to-trough decline.
    Returns dict with drawdown percentage, peak date, trough date, and recovery date.
    """
    navs = nav_df["nav"].values
    dates = nav_df["date"].values

    peak = navs[0]
    peak_idx = 0
    max_dd = 0.0
    max_dd_peak_idx = 0
    max_dd_trough_idx = 0

    for i in range(1, len(navs)):
        if navs[i] > peak:
            peak = navs[i]
            peak_idx = i
        else:
            dd = (peak - navs[i]) / peak
            if dd > max_dd:
                max_dd = dd
                max_dd_peak_idx = peak_idx
                max_dd_trough_idx = i

    # Find recovery date (when NAV crosses back above peak)
    recovery_idx = None
    peak_nav_at_dd = navs[max_dd_peak_idx]
    for i in range(max_dd_trough_idx, len(navs)):
        if navs[i] >= peak_nav_at_dd:
            recovery_idx = i
            break

    recovery_days = None
    if recovery_idx is not None:
        recovery_days = int((pd.Timestamp(dates[recovery_idx]) - pd.Timestamp(dates[max_dd_trough_idx])).days)

    return {
        "max_drawdown_pct": round(max_dd * 100, 2),
        "peak_date": str(pd.Timestamp(dates[max_dd_peak_idx]).date()) if max_dd > 0 else None,
        "trough_date": str(pd.Timestamp(dates[max_dd_trough_idx]).date()) if max_dd > 0 else None,
        "recovery_date": str(pd.Timestamp(dates[recovery_idx]).date()) if recovery_idx else None,
        "recovery_days": recovery_days,
    }


def calculate_sharpe_ratio(nav_df: pd.DataFrame, risk_free_rate: float = None) -> float:
    """
    Sharpe Ratio = (annualized_return - risk_free_rate) / annualized_volatility.
    Higher = better risk-adjusted returns.
    """
    if risk_free_rate is None:
        risk_free_rate = RISK_FREE_RATE

    returns = _trading_day_returns(nav_df)
    if returns.empty or returns.std() == 0:
        return 0.0

    ann_return = returns.mean() * TRADING_DAYS_PER_YEAR
    ann_vol = returns.std() * np.sqrt(TRADING_DAYS_PER_YEAR)

    sharpe = (ann_return - risk_free_rate) / ann_vol
    return round(sharpe, 2)


def calculate_sortino_ratio(nav_df: pd.DataFrame, risk_free_rate: float = None) -> float:
    """
    Sortino Ratio = (annualized_return - risk_free_rate) / downside_deviation.
    Only penalizes downside volatility, not upside.
    """
    if risk_free_rate is None:
        risk_free_rate = RISK_FREE_RATE

    returns = _trading_day_returns(nav_df)
    if returns.empty:
        return 0.0

    ann_return = returns.mean() * TRADING_DAYS_PER_YEAR
    daily_rf = (1 + risk_free_rate) ** (1 / TRADING_DAYS_PER_YEAR) - 1
    downside = returns[returns < daily_rf]
    if downside.empty or downside.std() == 0:
        return 0.0

    downside_dev = downside.std() * np.sqrt(TRADING_DAYS_PER_YEAR)
    sortino = (ann_return - risk_free_rate) / downside_dev
    return round(sortino, 2)


def calculate_risk_score(nav_df: pd.DataFrame) -> Dict:
    """
    Composite Risk Score (0-10) combining multiple risk metrics.

    Scoring logic:
    - Volatility score (0-10): scaled from 0% (score=0) to 40%+ (score=10)
    - Drawdown score (0-10): scaled from 0% (score=0) to 60%+ (score=10)
    - Sharpe penalty (0-10): Sharpe < 0 = 10, Sharpe > 2 = 0

    Final = weighted average → categorized as Low/Medium/High
    """
    volatility = calculate_volatility(nav_df)
    drawdown_info = calculate_max_drawdown(nav_df)
    sharpe = calculate_sharpe_ratio(nav_df)
    sortino = calculate_sortino_ratio(nav_df)

    # Scale volatility to 0-10 (0% → 0, 40% → 10)
    vol_score = min(10, (volatility / 40) * 10)

    # Scale drawdown to 0-10 (0% → 0, 60% → 10)
    dd_score = min(10, (drawdown_info["max_drawdown_pct"] / 60) * 10)

    # Scale Sharpe inversely (higher Sharpe = lower risk score)
    if sharpe >= 2:
        sharpe_score = 0
    elif sharpe <= 0:
        sharpe_score = 10
    else:
        sharpe_score = (1 - sharpe / 2) * 10

    # Weighted composite
    composite = (
        RISK_WEIGHT_VOLATILITY * vol_score +
        RISK_WEIGHT_DRAWDOWN * dd_score +
        RISK_WEIGHT_SHARPE * sharpe_score
    )
    composite = round(min(10, max(0, composite)), 1)

    # Categorize
    if composite <= 3.5:
        category = "Low"
    elif composite <= 6.5:
        category = "Medium"
    else:
        category = "High"

    return {
        "risk_score": composite,
        "risk_category": category,
        "volatility_pct": volatility,
        "max_drawdown": drawdown_info,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "component_scores": {
            "volatility_score": round(vol_score, 1),
            "drawdown_score": round(dd_score, 1),
            "sharpe_score": round(sharpe_score, 1),
        }
    }


def analyze_portfolio_risk(nav_dict: Dict[str, pd.DataFrame], weights: Dict[str, float]) -> Dict:
    """
    Portfolio-level risk using covariance of constituent fund returns.
    Weights should sum to 1.0.
    """
    from data.preprocessor import align_multiple_navs

    aligned = align_multiple_navs(nav_dict)
    returns = aligned.pct_change().dropna()

    codes = list(weights.keys())
    w = np.array([weights.get(c, 0) for c in codes])

    # Filter to matching codes
    common_codes = [c for c in codes if c in returns.columns]
    if not common_codes:
        return {"portfolio_volatility": 0, "portfolio_return": 0}

    w = np.array([weights[c] for c in common_codes])
    w = w / w.sum()  # re-normalize

    ret_matrix = returns[common_codes]
    cov_matrix = ret_matrix.cov() * TRADING_DAYS_PER_YEAR
    mean_returns = ret_matrix.mean() * TRADING_DAYS_PER_YEAR

    port_return = float(np.dot(w, mean_returns)) * 100
    port_vol = float(np.sqrt(np.dot(w.T, np.dot(cov_matrix, w)))) * 100

    return {
        "portfolio_return_pct": round(port_return, 2),
        "portfolio_volatility_pct": round(port_vol, 2),
        "portfolio_sharpe": round((port_return / 100 - RISK_FREE_RATE) / (port_vol / 100), 2) if port_vol > 0 else 0,
    }
