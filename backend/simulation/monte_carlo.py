"""
Monte Carlo Simulation Engine — Probabilistic portfolio outcome modeling.

Uses Geometric Brownian Motion (GBM) to generate thousands of possible
future NAV paths based on historical return distribution.

GBM Formula: S(t+1) = S(t) × exp((μ - σ²/2)Δt + σ√Δt × Z)
where:
  μ = mean daily return (drift)
  σ = daily return volatility
  Z = standard normal random variable
  Δt = time step (1/252 for daily)
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional

import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import MC_SIMULATIONS, MC_DEFAULT_HORIZON_DAYS, TRADING_DAYS_PER_YEAR


def run_monte_carlo(
    nav_df: pd.DataFrame,
    n_simulations: int = None,
    horizon_days: int = None,
    monthly_sip: float = 0,
    initial_investment: float = 0,
) -> Dict:
    """
    Run Monte Carlo simulation for a single fund.

    Args:
        nav_df: Historical NAV DataFrame
        n_simulations: Number of random paths to generate
        horizon_days: Forecast horizon in trading days
        monthly_sip: Monthly SIP amount (0 for lumpsum only)
        initial_investment: Lumpsum amount at start

    Returns:
        Simulation results with percentile bands and outcome distribution.
    """
    if n_simulations is None:
        n_simulations = MC_SIMULATIONS
    if horizon_days is None:
        horizon_days = MC_DEFAULT_HORIZON_DAYS

    # ── Calculate historical statistics ──
    nav_df = nav_df.copy().sort_values("date")
    navs = nav_df["nav"].values
    returns = np.diff(np.log(navs))  # Log returns for GBM

    mu = np.mean(returns)       # Daily drift
    sigma = np.std(returns)     # Daily volatility
    last_nav = navs[-1]

    # ── Generate simulation paths (truly vectorized GBM) ──
    # Draw all random shocks at once: shape (n_simulations, horizon_days)
    np.random.seed(None)  # Different results each run
    Z = np.random.standard_normal((n_simulations, horizon_days))

    # Daily log-return for each step: (μ - σ²/2)·dt + σ·√dt·Z
    # dt = 1 day; μ and σ are already in daily units
    daily_log_returns = (mu - 0.5 * sigma ** 2) + sigma * Z  # shape (n_sims, horizon)

    # Cumulative sum of log-returns → price paths via exp
    # path[:, 0] = last_nav (starting point)
    # path[:, t] = last_nav * exp(sum of log-returns up to step t)
    all_paths = np.empty((n_simulations, horizon_days + 1))
    all_paths[:, 0] = last_nav
    all_paths[:, 1:] = last_nav * np.exp(np.cumsum(daily_log_returns, axis=1))

    # ── Calculate portfolio values with SIP ──
    if monthly_sip > 0 or initial_investment > 0:
        portfolio_paths = _simulate_sip_on_paths(
            all_paths, monthly_sip, initial_investment, horizon_days
        )
    else:
        # Default: 1 unit tracking NAV
        portfolio_paths = all_paths.copy()

    # ── Compute statistics at each time step ──
    percentiles = [5, 10, 25, 50, 75, 90, 95]
    percentile_paths = {}
    for p in percentiles:
        percentile_paths[f"p{p}"] = np.percentile(portfolio_paths, p, axis=0).tolist()

    mean_path = np.mean(portfolio_paths, axis=0).tolist()

    # ── Terminal value distribution ──
    terminal_values = portfolio_paths[:, -1]
    total_invested = initial_investment + monthly_sip * (horizon_days // 21)  # approx months

    # ── Outcome analysis ──
    outcomes = {
        "best_case": round(float(np.percentile(terminal_values, 95)), 2),
        "optimistic": round(float(np.percentile(terminal_values, 75)), 2),
        "median": round(float(np.median(terminal_values)), 2),
        "conservative": round(float(np.percentile(terminal_values, 25)), 2),
        "worst_case": round(float(np.percentile(terminal_values, 5)), 2),
        "mean": round(float(np.mean(terminal_values)), 2),
        "std": round(float(np.std(terminal_values)), 2),
    }

    # ── Probability analysis ──
    if total_invested > 0:
        prob_profit = float(np.mean(terminal_values > total_invested) * 100)
        prob_double = float(np.mean(terminal_values > total_invested * 2) * 100)
        prob_loss_10 = float(np.mean(terminal_values < total_invested * 0.9) * 100)
    else:
        prob_profit = float(np.mean(terminal_values > last_nav) * 100)
        prob_double = float(np.mean(terminal_values > last_nav * 2) * 100)
        prob_loss_10 = float(np.mean(terminal_values < last_nav * 0.9) * 100)

    # ── Distribution histogram ──
    hist_counts, hist_edges = np.histogram(terminal_values, bins=30)
    distribution = {
        "counts": hist_counts.tolist(),
        "bin_edges": [round(float(e), 2) for e in hist_edges],
    }

    # ── Return dates (approximate trading day labels) ──
    last_date = pd.to_datetime(nav_df["date"].iloc[-1])
    date_labels = []
    for i in range(0, horizon_days + 1, max(1, horizon_days // 50)):
        date_labels.append({
            "day": i,
            "date": (last_date + pd.Timedelta(days=int(i * 365 / 252))).strftime("%Y-%m-%d"),
        })

    return {
        "parameters": {
            "n_simulations": n_simulations,
            "horizon_days": horizon_days,
            "initial_investment": initial_investment,
            "monthly_sip": monthly_sip,
            "total_invested": round(total_invested, 2),
            "historical_daily_return": round(float(mu * 100), 4),
            "historical_daily_volatility": round(float(sigma * 100), 4),
            "annualized_return_pct": round(float(mu * TRADING_DAYS_PER_YEAR * 100), 2),
            "annualized_volatility_pct": round(float(sigma * np.sqrt(TRADING_DAYS_PER_YEAR) * 100), 2),
        },
        "percentile_paths": percentile_paths,
        "mean_path": mean_path,
        "date_labels": date_labels,
        "outcomes": outcomes,
        "probabilities": {
            "profit_pct": round(prob_profit, 1),
            "double_pct": round(prob_double, 1),
            "loss_10_pct": round(prob_loss_10, 1),
        },
        "distribution": distribution,
    }


def _simulate_sip_on_paths(
    nav_paths: np.ndarray,
    monthly_sip: float,
    initial_investment: float,
    horizon_days: int,
) -> np.ndarray:
    """
    Overlay SIP investments onto NAV simulation paths.
    SIP is added approximately every 21 trading days (monthly).
    """
    n_sims = nav_paths.shape[0]
    portfolio_values = np.zeros_like(nav_paths)

    for sim in range(n_sims):
        units = 0
        total_invested = 0

        # Initial lumpsum
        if initial_investment > 0:
            units = initial_investment / nav_paths[sim, 0]
            total_invested = initial_investment

        for day in range(horizon_days + 1):
            nav = nav_paths[sim, day]

            # SIP every ~21 trading days
            if monthly_sip > 0 and day > 0 and day % 21 == 0:
                units += monthly_sip / nav
                total_invested += monthly_sip

            portfolio_values[sim, day] = units * nav

    return portfolio_values


def run_portfolio_monte_carlo(
    nav_dict: Dict[str, pd.DataFrame],
    weights: Dict[str, float],
    total_investment: float,
    horizon_days: int = 252,
    n_simulations: int = 500,
) -> Dict:
    """
    Run Monte Carlo for a portfolio of multiple funds.
    Uses correlated returns via Cholesky decomposition.
    """
    from data.preprocessor import align_multiple_navs

    aligned = align_multiple_navs(nav_dict)
    returns = aligned.pct_change().dropna()

    codes = list(weights.keys())
    common = [c for c in codes if c in returns.columns]
    if not common:
        return {"error": "No matching funds found"}

    w = np.array([weights[c] for c in common])
    w = w / w.sum()

    # Use log returns for GBM — prevents negative portfolio values that
    # occur when simple returns + unconstrained normal draws go below -1.
    log_ret_matrix = np.log(1 + returns[common].values)
    mean_log_returns = log_ret_matrix.mean(axis=0)
    cov_matrix = np.cov(log_ret_matrix.T)

    # Cholesky decomposition for correlated random draws
    try:
        L = np.linalg.cholesky(cov_matrix)
    except np.linalg.LinAlgError:
        # If cov matrix is not positive-definite, add small diagonal regularization
        cov_matrix += np.eye(len(common)) * 1e-8
        L = np.linalg.cholesky(cov_matrix)

    # GBM drift correction: μ_gbm = μ_log - σ²/2 per asset
    gbm_drift = mean_log_returns - 0.5 * np.diag(cov_matrix)

    # Fully vectorized simulation:
    # Z shape: (n_simulations, horizon_days, n_assets)
    Z = np.random.standard_normal((n_simulations, horizon_days, len(common)))
    # Correlated shocks: (n_sims, horizon, n_assets)
    correlated_shocks = Z @ L.T
    # Daily log-returns per asset per step
    daily_log_rets = gbm_drift[np.newaxis, np.newaxis, :] + correlated_shocks
    # Portfolio log-return per step (weighted sum of asset log-returns)
    portfolio_log_rets = daily_log_rets @ w        # shape (n_sims, horizon)
    # Cumulative portfolio value — always positive via exp
    portfolio_values = np.empty((n_simulations, horizon_days + 1))
    portfolio_values[:, 0] = total_investment
    portfolio_values[:, 1:] = total_investment * np.exp(
        np.cumsum(portfolio_log_rets, axis=1)
    )

    # Stats
    terminal = portfolio_values[:, -1]
    percentile_paths = {}
    for p in [5, 25, 50, 75, 95]:
        percentile_paths[f"p{p}"] = np.percentile(portfolio_values, p, axis=0).tolist()

    return {
        "parameters": {"n_simulations": n_simulations, "horizon_days": horizon_days},
        "percentile_paths": percentile_paths,
        "mean_path": np.mean(portfolio_values, axis=0).tolist(),
        "outcomes": {
            "best_case": round(float(np.percentile(terminal, 95)), 2),
            "median": round(float(np.median(terminal)), 2),
            "worst_case": round(float(np.percentile(terminal, 5)), 2),
        },
        "probabilities": {
            "profit_pct": round(float(np.mean(terminal > total_investment) * 100), 1),
        },
    }
