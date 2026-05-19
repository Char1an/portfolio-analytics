"""
Portfolio Overlap Analysis — NAV-correlation-based concentration risk.

Computes pairwise Pearson correlations between portfolio fund NAVs
(on aligned daily returns) and derives a diversification score.

Interpretation:
  correlation > 0.90  → Nearly identical movement — very high overlap
  0.75–0.90           → High overlap — limited diversification benefit
  0.50–0.75           → Moderate overlap — some diversification
  < 0.50              → Low overlap — good diversification
"""
import numpy as np
import pandas as pd
from typing import Dict


def compute_overlap(
    nav_dict: Dict[str, pd.DataFrame],
    fund_names: Dict[str, str],
) -> Dict:
    """
    nav_dict  : {scheme_code: DataFrame with 'date' and 'nav' columns}
    fund_names: {scheme_code: display_name}
    """
    codes = list(nav_dict.keys())
    if len(codes) < 2:
        return {"error": "Need at least 2 funds to compute overlap"}

    # ── Align all NAVs on common dates ────────────────────────────────────
    aligned_frames = {}
    for code, df in nav_dict.items():
        tmp = df.copy()
        tmp["date"] = pd.to_datetime(tmp["date"])
        tmp["nav"]  = pd.to_numeric(tmp["nav"], errors="coerce")
        tmp = tmp.dropna(subset=["nav"]).sort_values("date").set_index("date")["nav"]
        aligned_frames[code] = tmp

    aligned = pd.DataFrame(aligned_frames).dropna()

    if len(aligned) < 30:
        return {"error": "Not enough overlapping date range across funds (need 30+ common days)"}

    # Daily returns
    returns = aligned.pct_change().dropna()

    # ── Correlation matrix ────────────────────────────────────────────────
    corr = returns.corr()

    # Build display labels (shorten names)
    def shorten(name: str) -> str:
        n = name.replace(" - Direct Growth", "").replace(" - Direct Plan", "").strip()
        words = n.split()
        return " ".join(words[:3])   # first 3 words

    labels = [shorten(fund_names.get(c, c)) for c in codes]

    # Matrix as list-of-lists (rounded)
    matrix = []
    for c1 in codes:
        row = []
        for c2 in codes:
            if c1 in corr.columns and c2 in corr.columns:
                row.append(round(float(corr.loc[c1, c2]), 3))
            else:
                row.append(None)
        matrix.append(row)

    # ── High-correlation pairs ────────────────────────────────────────────
    HIGH_THRESH = 0.85
    pairs = []
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            c1, c2 = codes[i], codes[j]
            if c1 not in corr.columns or c2 not in corr.columns:
                continue
            val = float(corr.loc[c1, c2])
            if val >= HIGH_THRESH:   # only positive correlation is "overlap"
                severity = "Very High" if val >= 0.92 else "High"
                pairs.append({
                    "fund_a":       labels[i],
                    "fund_b":       labels[j],
                    "code_a":       c1,
                    "code_b":       c2,
                    "correlation":  round(val, 3),
                    "severity":     severity,
                    "warning":      (
                        f"{labels[i]} and {labels[j]} have {severity.lower()} overlap "
                        f"({round(val*100,1)}% correlated). They move almost identically — "
                        f"holding both gives little diversification benefit. "
                        f"Consider replacing one with a fund from a different category."
                    ),
                })

    pairs.sort(key=lambda x: -x["correlation"])

    # ── Diversification score (0-100) ─────────────────────────────────────
    # Extract upper triangle of correlation matrix (excluding diagonal)
    n = len(codes)
    off_diag_vals = []
    for i in range(n):
        for j in range(i + 1, n):
            c1, c2 = codes[i], codes[j]
            if c1 in corr.columns and c2 in corr.columns:
                off_diag_vals.append(float(corr.loc[c1, c2]))

    if off_diag_vals:
        avg_corr = float(np.mean(off_diag_vals))
        # Clamp to [0, 100]: negative avg_corr (hedged portfolio) is capped at 100
        diversification_score = round(min((1 - avg_corr) * 100, 100.0), 1)
    else:
        avg_corr = 0.0
        diversification_score = 100.0

    if diversification_score >= 70:
        concentration_risk = "Low"
    elif diversification_score >= 45:
        concentration_risk = "Medium"
    else:
        concentration_risk = "High"

    # ── Plain English interpretation ──────────────────────────────────────
    if len(pairs) == 0:
        interpretation = (
            f"Your portfolio shows good diversification — no fund pair has correlation above "
            f"{int(HIGH_THRESH*100)}%. Average pairwise correlation is "
            f"{round(avg_corr*100,1)}%."
        )
    else:
        interpretation = (
            f"{len(pairs)} fund pair{'s' if len(pairs)>1 else ''} "
            f"{'have' if len(pairs)>1 else 'has'} high overlap (>{int(HIGH_THRESH*100)}% correlated). "
            f"Your diversification score is {diversification_score}/100 — "
            f"{'excellent' if diversification_score>=70 else 'moderate' if diversification_score>=45 else 'poor'}. "
            f"Consider replacing {pairs[0]['fund_b']} with a fund from a different category "
            f"to reduce concentration."
        )

    return {
        "correlation_matrix":    matrix,
        "fund_labels":           labels,
        "fund_codes":            codes,
        "high_correlation_pairs": pairs,
        "diversification_score": diversification_score,
        "average_correlation":   round(avg_corr * 100, 1),
        "concentration_risk":    concentration_risk,
        "interpretation":        interpretation,
        "data_points":           len(returns),
    }
