"""
Portfolio Optimizer — Modern Portfolio Theory (MPT) implementation.

Uses scipy.optimize to find the Maximum Sharpe Ratio portfolio
on the efficient frontier. Compares current allocation vs optimal.
"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Dict, List, Tuple

import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import RISK_FREE_RATE, TRADING_DAYS_PER_YEAR


def _portfolio_stats(weights: np.ndarray, mean_returns: np.ndarray, cov_matrix: np.ndarray) -> Tuple[float, float, float]:
    """
    Calculate annualized return, volatility, and Sharpe ratio for given weights.
    """
    port_return = np.dot(weights, mean_returns) * TRADING_DAYS_PER_YEAR
    port_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix * TRADING_DAYS_PER_YEAR, weights)))
    sharpe = (port_return - RISK_FREE_RATE) / port_vol if port_vol > 0 else 0
    return port_return, port_vol, sharpe


def _neg_sharpe(weights, mean_returns, cov_matrix):
    """Objective function: negative Sharpe ratio (we minimize this)."""
    _, _, sharpe = _portfolio_stats(weights, mean_returns, cov_matrix)
    return -sharpe


def _portfolio_volatility(weights, mean_returns, cov_matrix):
    """Objective for minimum variance portfolio."""
    _, vol, _ = _portfolio_stats(weights, mean_returns, cov_matrix)
    return vol


def optimize_portfolio(
    nav_dict: Dict[str, pd.DataFrame],
    current_weights: Dict[str, float] = None,
    target: str = "max_sharpe",
) -> Dict:
    """
    Find optimal portfolio weights using Modern Portfolio Theory.

    Args:
        nav_dict: {scheme_code: nav_dataframe}
        current_weights: {scheme_code: weight} (for comparison)
        target: "max_sharpe" or "min_volatility"

    Returns:
        Optimal weights, expected return/risk, comparison with current allocation.
    """
    from data.preprocessor import align_multiple_navs

    # Align all NAV series to common dates
    aligned = align_multiple_navs(nav_dict)
    returns = aligned.pct_change().dropna()

    codes = list(returns.columns)
    n = len(codes)

    if n < 2:
        return {"error": "Need at least 2 funds for optimization"}

    mean_returns = returns.mean().values
    cov_matrix = returns.cov().values

    # ── Constraints ──
    # All weights sum to 1
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    # Each weight between 0 and 1 (no short selling)
    bounds = tuple((0.0, 1.0) for _ in range(n))
    # Initial guess: equal weight
    init_weights = np.array([1.0 / n] * n)

    # ── Optimize ──
    if target == "min_volatility":
        result = minimize(
            _portfolio_volatility, init_weights,
            args=(mean_returns, cov_matrix),
            method="SLSQP", bounds=bounds, constraints=constraints,
            options={"maxiter": 1000}
        )
    else:  # max_sharpe (default)
        result = minimize(
            _neg_sharpe, init_weights,
            args=(mean_returns, cov_matrix),
            method="SLSQP", bounds=bounds, constraints=constraints,
            options={"maxiter": 1000}
        )

    optimal_weights = result.x
    opt_return, opt_vol, opt_sharpe = _portfolio_stats(optimal_weights, mean_returns, cov_matrix)

    # ── Current portfolio stats (for comparison) ──
    current_stats = None
    if current_weights:
        cur_w = np.array([current_weights.get(c, 0) for c in codes])
        if cur_w.sum() > 0:
            cur_w = cur_w / cur_w.sum()
            cur_ret, cur_vol, cur_sharpe = _portfolio_stats(cur_w, mean_returns, cov_matrix)
            current_stats = {
                "weights": {code: round(float(w), 4) for code, w in zip(codes, cur_w)},
                "expected_return_pct": round(float(cur_ret) * 100, 2),
                "expected_volatility_pct": round(float(cur_vol) * 100, 2),
                "sharpe_ratio": round(float(cur_sharpe), 2),
            }

    return {
        "optimization_target": target,
        "optimal_weights": {code: round(float(w), 4) for code, w in zip(codes, optimal_weights)},
        "expected_return_pct": round(float(opt_return) * 100, 2),
        "expected_volatility_pct": round(float(opt_vol) * 100, 2),
        "sharpe_ratio": round(float(opt_sharpe), 2),
        "current_portfolio": current_stats,
        "success": bool(result.success),
    }


def generate_efficient_frontier(
    nav_dict: Dict[str, pd.DataFrame],
    n_points: int = 50,
) -> Dict:
    """
    Generate the efficient frontier — a set of optimal portfolios
    ranging from minimum volatility to maximum return.

    Returns a list of {return, volatility, sharpe, weights} points.
    """
    from data.preprocessor import align_multiple_navs

    aligned = align_multiple_navs(nav_dict)
    returns = aligned.pct_change().dropna()

    codes = list(returns.columns)
    n = len(codes)
    mean_returns = returns.mean().values
    cov_matrix = returns.cov().values

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = tuple((0.0, 1.0) for _ in range(n))
    init = np.array([1.0 / n] * n)

    # Find min and max possible returns
    # Min volatility portfolio
    min_vol_result = minimize(
        _portfolio_volatility, init,
        args=(mean_returns, cov_matrix),
        method="SLSQP", bounds=bounds, constraints=constraints
    )
    min_ret = np.dot(min_vol_result.x, mean_returns) * TRADING_DAYS_PER_YEAR

    # Max return (100% in highest-return asset)
    max_ret = max(mean_returns) * TRADING_DAYS_PER_YEAR

    # Generate frontier points at different target returns
    target_returns = np.linspace(min_ret, max_ret, n_points)
    frontier = []

    for target_ret in target_returns:
        cons = [
            {"type": "eq", "fun": lambda w: np.sum(w) - 1},
            {"type": "eq", "fun": lambda w, tr=target_ret: np.dot(w, mean_returns) * TRADING_DAYS_PER_YEAR - tr},
        ]
        try:
            result = minimize(
                _portfolio_volatility, init,
                args=(mean_returns, cov_matrix),
                method="SLSQP", bounds=bounds, constraints=cons,
                options={"maxiter": 500}
            )
            if result.success:
                ret, vol, sharpe = _portfolio_stats(result.x, mean_returns, cov_matrix)
                frontier.append({
                    "return_pct": round(float(ret) * 100, 2),
                    "volatility_pct": round(float(vol) * 100, 2),
                    "sharpe_ratio": round(float(sharpe), 2),
                    "weights": {code: round(float(w), 4) for code, w in zip(codes, result.x)},
                })
        except Exception:
            continue

    return {
        "frontier_points": frontier,
        "fund_codes": codes,
        "individual_stats": [
            {
                "code": code,
                "annual_return_pct": round(float(mean_returns[i] * TRADING_DAYS_PER_YEAR * 100), 2),
                "annual_volatility_pct": round(float(np.sqrt(cov_matrix[i][i] * TRADING_DAYS_PER_YEAR) * 100), 2),
            }
            for i, code in enumerate(codes)
        ],
    }
