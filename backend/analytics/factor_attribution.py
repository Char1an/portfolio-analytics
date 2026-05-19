"""
Fama-French Factor Attribution for Indian Mutual Funds.

Uses Indian market index funds as factor proxies (all from MFAPI):
  - Market factor (Mkt-RF): Nifty 50 excess return over the risk-free rate
  - Size factor (SMB — Small Minus Big): Nifty Smallcap 250 minus Nifty 50
  - Midcap factor (MMB — Mid Minus Big): Nifty Midcap 150 minus Nifty 50

Regression:  R_fund - RF  =  α  +  β_mkt·Mkt_RF  +  β_smb·SMB  +  β_mmb·MMB  +  ε

Alpha = manager skill beyond factor tilts. If the fund's expense ratio > alpha, the manager
is not adding enough value to justify active fees — a passive index fund would do better.
"""
import numpy as np
import pandas as pd
from typing import Dict, Optional

RISK_FREE_ANNUAL = 0.065          # 6.5% p.a. — approx Indian 10-year G-sec yield
RISK_FREE_MONTHLY = (1 + RISK_FREE_ANNUAL) ** (1 / 12) - 1

# MFAPI codes for factor proxies
FACTOR_CODES = {
    "market":   "118741",   # Nippon India Nifty 50 Index Fund
    "smallcap": "150677",   # SBI Nifty Smallcap 250 Index Fund
    "midcap":   "150673",   # SBI Nifty Midcap 150 Index Fund
}


def _monthly_returns(nav_df: pd.DataFrame) -> pd.Series:
    """Convert daily NAV DataFrame to monthly return Series (month-start resampling)."""
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")
    monthly = df["nav"].resample("MS").last().dropna()
    return monthly.pct_change().dropna()


def build_factor_matrix(factor_navs: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Construct the three factor return series from index fund NAVs, aligned
    to the intersection of all available dates.

    Returns DataFrame with columns: [Mkt_RF, SMB, MMB].
    """
    market_ret = _monthly_returns(factor_navs["market"])
    small_ret  = _monthly_returns(factor_navs["smallcap"])
    mid_ret    = _monthly_returns(factor_navs["midcap"])

    combined = pd.DataFrame({
        "market": market_ret,
        "small":  small_ret,
        "mid":    mid_ret,
    }).dropna()

    combined["Mkt_RF"] = combined["market"] - RISK_FREE_MONTHLY
    combined["SMB"]    = combined["small"]  - combined["market"]
    combined["MMB"]    = combined["mid"]    - combined["market"]

    return combined[["Mkt_RF", "SMB", "MMB"]]


def run_ols(Y: np.ndarray, X: np.ndarray) -> Dict:
    """
    Ordinary Least Squares: β = (X'X)⁻¹ X'Y
    Returns coefficients, standard errors, t-statistics, and R².
    """
    try:
        XtX_inv = np.linalg.inv(X.T @ X)
    except np.linalg.LinAlgError:
        return {"error": "Singular matrix — insufficient factor variation in the data"}

    coeffs = XtX_inv @ X.T @ Y
    Y_hat = X @ coeffs
    residuals = Y - Y_hat

    n, k = X.shape
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((Y - Y.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

    sigma2 = ss_res / max(n - k, 1)
    se = np.sqrt(np.diag(sigma2 * XtX_inv))
    t_stats = coeffs / se

    return {
        "coeffs": coeffs,
        "se": se,
        "t_stats": t_stats,
        "r_squared": r_squared,
        "n": n,
    }


def run_factor_regression(fund_returns: pd.Series, factor_matrix: pd.DataFrame) -> Dict:
    """
    Regress fund excess returns against the three factors.
    Returns all regression statistics plus annualised contribution breakdown.
    """
    aligned = pd.concat([fund_returns.rename("fund"), factor_matrix], axis=1).dropna()

    if len(aligned) < 12:
        return {"error": "Need at least 12 months of overlapping data for factor regression"}

    Y = (aligned["fund"] - RISK_FREE_MONTHLY).values
    X_df = aligned[["Mkt_RF", "SMB", "MMB"]].copy()
    X_df.insert(0, "const", 1.0)
    X = X_df.values

    ols = run_ols(Y, X)
    if "error" in ols:
        return ols

    coeffs  = ols["coeffs"]
    t_stats = ols["t_stats"]
    r2      = ols["r_squared"]
    n       = ols["n"]

    alpha_m, beta_mkt, beta_smb, beta_mmb = coeffs

    # Annualise alpha: (1 + α_monthly)^12 - 1
    alpha_annual = ((1 + alpha_m) ** 12 - 1) * 100

    # Factor contributions to annualised return (simple ×12 matches the linear model)
    avg = factor_matrix.mean()
    mkt_contrib  = beta_mkt  * float(avg["Mkt_RF"]) * 12 * 100
    smb_contrib  = beta_smb  * float(avg["SMB"])    * 12 * 100
    mmb_contrib  = beta_mmb  * float(avg["MMB"])    * 12 * 100

    # Use compound annualisation to match alpha_annual — avoids decomposition mismatch
    fund_ann_return = (((1 + aligned["fund"].mean()) ** 12) - 1) * 100

    return {
        "n_months": int(n),
        "alpha_monthly_pct": round(float(alpha_m) * 100, 4),
        "alpha_annual_pct": round(alpha_annual, 2),
        "beta_market": round(float(beta_mkt), 3),
        "beta_smb": round(float(beta_smb), 3),
        "beta_mmb": round(float(beta_mmb), 3),
        "r_squared": round(r2, 4),
        "t_stat_alpha": round(float(t_stats[0]), 2),
        "t_stat_market": round(float(t_stats[1]), 2),
        "t_stat_smb": round(float(t_stats[2]), 2),
        "t_stat_mmb": round(float(t_stats[3]), 2),
        "alpha_significant": abs(float(t_stats[0])) >= 2.0,
        "factor_contributions": {
            "market_pct":  round(mkt_contrib, 2),
            "smb_pct":     round(smb_contrib, 2),
            "mmb_pct":     round(mmb_contrib, 2),
            "alpha_pct":   round(alpha_annual, 2),
            "rf_pct":      round(RISK_FREE_ANNUAL * 100, 2),
        },
        "fund_avg_annual_return_pct": round(fund_ann_return, 2),
    }


def _interpret(fund_name: str, reg: Dict, expense_ratio: Optional[float]) -> str:
    """Build a human-readable, ₹-focused interpretation of the regression results."""
    short = fund_name.split(" - ")[0]
    alpha  = reg["alpha_annual_pct"]
    beta   = reg["beta_market"]
    smb    = reg["beta_smb"]
    mmb    = reg["beta_mmb"]
    r2     = reg["r_squared"]
    fc     = reg["factor_contributions"]
    total  = reg["fund_avg_annual_return_pct"]
    t_a    = reg["t_stat_alpha"]
    sig    = reg["alpha_significant"]

    # Build return decomposition sentence
    components = [f"{fc['market_pct']:.1f}% from market beta (β={beta:.2f})"]
    if abs(fc["smb_pct"]) >= 0.3:
        label = "small-cap tilt" if smb > 0 else "large-cap bias"
        components.append(f"{fc['smb_pct']:+.1f}% from {label}")
    if abs(fc["mmb_pct"]) >= 0.3:
        label = "mid-cap tilt" if mmb > 0 else "large-cap bias"
        components.append(f"{fc['mmb_pct']:+.1f}% from {label}")
    components.append(f"{alpha:+.1f}% alpha")

    line1 = f"{short}'s {total:.1f}% avg annual return = {' + '.join(components)}."

    # Alpha significance
    if sig:
        if alpha > 0:
            line2 = (
                f"The {alpha:.1f}% alpha is statistically significant (t={t_a:.1f}) — "
                f"this manager genuinely adds value beyond passive factor exposure."
            )
        else:
            line2 = (
                f"Negative alpha of {alpha:.1f}% is statistically significant (t={t_a:.1f}) — "
                f"the manager destroys {abs(alpha):.1f}% per year vs a comparable passive portfolio."
            )
    else:
        line2 = (
            f"Alpha of {alpha:.1f}% is not statistically significant (t={t_a:.1f}) — "
            f"returns are explained by factor tilts, not manager skill."
        )

    # Expense ratio verdict
    if expense_ratio is not None:
        er = expense_ratio
        net_skill = alpha - er
        if net_skill > 0.5:
            line3 = (
                f"You pay {er:.2f}% expense ratio and get {alpha:.1f}% alpha — "
                f"net manager value-add: {net_skill:.1f}%. Worth the active fee."
            )
        else:
            line3 = (
                f"You pay {er:.2f}% expense ratio for {alpha:.1f}% alpha — "
                f"a Nifty 50 index fund (0.10% cost) + a small-cap index fund would replicate "
                f"most of this performance at a fraction of the cost."
            )
    else:
        line3 = None

    line4 = (
        f"Model R² = {r2:.2f}: the three factors explain "
        f"{r2 * 100:.0f}% of this fund's monthly return variance."
    )

    return " ".join(filter(None, [line1, line2, line3, line4]))


def run_factor_attribution(
    fund_nav_df: pd.DataFrame,
    factor_navs: Dict[str, pd.DataFrame],
    fund_name: str,
    expense_ratio: Optional[float] = None,
) -> Dict:
    """
    Main entry point.

    Parameters
    ----------
    fund_nav_df  : Daily NAV history of the fund being analysed.
    factor_navs  : Dict with keys "market", "smallcap", "midcap" → daily NAV DataFrames.
    fund_name    : Human-readable fund name.
    expense_ratio: Fund's TER in % (e.g. 1.5 means 1.5%). Optional.
    """
    fund_returns = _monthly_returns(fund_nav_df)

    try:
        factor_matrix = build_factor_matrix(factor_navs)
    except Exception as exc:
        return {"fund_name": fund_name, "error": f"Factor matrix error: {exc}"}

    reg = run_factor_regression(fund_returns, factor_matrix)
    if "error" in reg:
        return {"fund_name": fund_name, **reg}

    interpretation = _interpret(fund_name, reg, expense_ratio)

    return {
        "fund_name": fund_name,
        "expense_ratio": expense_ratio,
        "factor_codes": FACTOR_CODES,
        "risk_free_rate_pct": round(RISK_FREE_ANNUAL * 100, 2),
        **reg,
        "interpretation": interpretation,
    }
