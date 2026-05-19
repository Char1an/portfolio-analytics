"""
Market Regime Detection — Gaussian Mixture Model on rolling returns.

Classifies every trading day into Bull / Bear / Sideways based on
a 60-day rolling return on the benchmark (Nifty 50 proxy).

Uses sklearn GaussianMixture (n_components=3) so no extra dependencies
beyond what's already in requirements.txt.
"""
import numpy as np
import pandas as pd
from typing import Dict, List
from sklearn.mixture import GaussianMixture


REGIME_COLORS = {"Bull": "#34d399", "Bear": "#f87171", "Sideways": "#fbbf24"}


def detect_regimes(benchmark_df: pd.DataFrame, n_regimes: int = 3) -> Dict:
    """
    Fit a GMM on 60-day rolling returns of the benchmark NAV.

    Returns regime labels per date + summary stats.
    """
    df = benchmark_df.copy().sort_values("date").reset_index(drop=True)
    df["date"] = pd.to_datetime(df["date"])
    df["nav"]  = pd.to_numeric(df["nav"], errors="coerce")
    df = df.dropna(subset=["nav"])

    # 60-day rolling return (annualised %)
    window = 60
    df["rolling_ret"] = (
        df["nav"].pct_change(periods=window) * (252 / window) * 100
    )
    df = df.dropna(subset=["rolling_ret"]).reset_index(drop=True)

    if len(df) < window * 2:
        return {"error": "Insufficient data for regime detection (need 120+ data points)"}

    X = df["rolling_ret"].values.reshape(-1, 1)

    # Fit GMM
    gmm = GaussianMixture(n_components=n_regimes, random_state=42, max_iter=200)
    gmm.fit(X)
    labels = gmm.predict(X)

    # Map component index → regime name by mean return
    comp_means = gmm.means_.flatten()
    sorted_idx = np.argsort(comp_means)  # ascending
    label_map  = {}
    if n_regimes == 3:
        label_map[sorted_idx[0]] = "Bear"
        label_map[sorted_idx[1]] = "Sideways"
        label_map[sorted_idx[2]] = "Bull"
    else:
        label_map[sorted_idx[0]] = "Bear"
        label_map[sorted_idx[-1]] = "Bull"
        for i in sorted_idx[1:-1]:
            label_map[i] = "Sideways"

    df["regime"] = [label_map[l] for l in labels]

    # ── Regime history (downsample to ~200 pts for frontend) ──────────────
    step = max(1, len(df) // 200)
    history = []
    for i in range(0, len(df), step):
        row = df.iloc[i]
        history.append({
            "date":           row["date"].strftime("%Y-%m-%d"),
            "regime":         row["regime"],
            "rolling_return": round(float(row["rolling_ret"]), 2),
            "nav":            round(float(row["nav"]), 2),
        })
    # Always include last point
    last = df.iloc[-1]
    if not history or history[-1]["date"] != last["date"].strftime("%Y-%m-%d"):
        history.append({
            "date":           last["date"].strftime("%Y-%m-%d"),
            "regime":         last["regime"],
            "rolling_return": round(float(last["rolling_ret"]), 2),
            "nav":            round(float(last["nav"]), 2),
        })

    # ── Regime stats ──────────────────────────────────────────────────────
    total = len(df)
    stats = {}
    for regime in ["Bull", "Bear", "Sideways"]:
        subset = df[df["regime"] == regime]["rolling_ret"]
        stats[regime] = {
            "count":       int(len(subset)),
            "pct_time":    round(len(subset) / total * 100, 1),
            "avg_return":  round(float(subset.mean()), 2) if len(subset) > 0 else 0.0,
            "color":       REGIME_COLORS[regime],
        }

    current_regime = df.iloc[-1]["regime"]

    return {
        "regime_history":  history,
        "regime_stats":    stats,
        "current_regime":  current_regime,
        "regime_dates":    df[["date", "regime"]].copy(),  # internal — stripped before API response
    }


def compute_fund_regime_performance(
    fund_nav_dict: Dict[str, pd.DataFrame],
    fund_names: Dict[str, str],
    regime_result: Dict,
) -> Dict:
    """
    For each portfolio fund, compute average return during each regime period.

    fund_nav_dict: {scheme_code: DataFrame(date, nav)}
    fund_names:    {scheme_code: display_name}
    regime_result: output of detect_regimes()
    """
    if "error" in regime_result:
        return {}

    regime_dates_df = regime_result.get("regime_dates")
    if regime_dates_df is None or len(regime_dates_df) == 0:
        return {}

    regime_dates_df = regime_dates_df.copy()
    regime_dates_df["date"] = pd.to_datetime(regime_dates_df["date"])

    fund_perf = {}
    best_bull = {"fund": None, "val": -999}
    best_bear = {"fund": None, "val": -999}
    most_consistent = {"fund": None, "val": 999}

    for code, nav_df in fund_nav_dict.items():
        name = fund_names.get(code, code)
        # Shorten name
        short = name.replace(" - Direct Growth", "").replace(" - Direct Plan", "").strip()

        df = nav_df.copy().sort_values("date")
        df["date"] = pd.to_datetime(df["date"])
        df["nav"]  = pd.to_numeric(df["nav"], errors="coerce")
        df = df.dropna(subset=["nav"])

        # Merge on date
        merged = pd.merge(df, regime_dates_df, on="date", how="inner")
        if len(merged) < 10:
            continue

        merged["daily_ret"] = merged["nav"].pct_change() * 100
        merged = merged.dropna(subset=["daily_ret"])

        perf = {}
        for regime in ["Bull", "Bear", "Sideways"]:
            subset = merged[merged["regime"] == regime]["daily_ret"]
            if len(subset) > 0:
                ann = float(subset.mean()) * 252   # annualised from daily avg
                perf[regime] = round(ann, 2)
            else:
                perf[regime] = None

        # Overall CAGR
        if len(df) > 1:
            first_nav = float(df["nav"].iloc[0])
            last_nav  = float(df["nav"].iloc[-1])
            years = (df["date"].iloc[-1] - df["date"].iloc[0]).days / 365.25
            if years > 0 and first_nav > 0:
                overall = round((((last_nav / first_nav) ** (1 / years)) - 1) * 100, 2)
            else:
                overall = 0.0
        else:
            overall = 0.0

        perf["overall"] = overall
        fund_perf[code] = {"name": short, **perf}

        # Leaderboard tracking
        bull_val = perf.get("Bull")
        bear_val = perf.get("Bear")
        if bull_val is not None and bull_val > best_bull["val"]:
            best_bull = {"fund": short, "val": bull_val}
        if bear_val is not None and bear_val > best_bear["val"]:
            best_bear = {"fund": short, "val": bear_val}
        # Consistency = low std of returns across regimes
        vals = [v for v in [perf.get("Bull"), perf.get("Bear"), perf.get("Sideways")] if v is not None]
        if len(vals) == 3:
            std = float(np.std(vals))
            if std < most_consistent["val"]:
                most_consistent = {"fund": short, "val": std}

    return {
        "fund_performance": fund_perf,
        "highlights": {
            "best_in_bull":    best_bull,
            "best_in_bear":    best_bear,
            "most_consistent": most_consistent,
        },
    }
