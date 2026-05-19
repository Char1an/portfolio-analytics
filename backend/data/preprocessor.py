"""
Data Preprocessor — Cleans raw NAV data and computes derived features.

Handles:
- Missing date gaps (weekends/holidays → forward-fill)
- Daily/weekly/monthly return computation
- Normalization for ML input
- Resampling to different frequencies
"""
import pandas as pd
import numpy as np
from typing import Optional


def clean_nav_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean raw NAV DataFrame:
    1. Ensure sorted by date
    2. Remove duplicates
    3. Forward-fill missing dates (weekends, holidays)
    4. Drop any remaining NaN NAVs
    """
    df = df.copy()
    df = df.sort_values("date").drop_duplicates(subset="date").reset_index(drop=True)

    # Create continuous date range and forward-fill
    date_range = pd.date_range(start=df["date"].min(), end=df["date"].max(), freq="D")
    df = df.set_index("date").reindex(date_range).rename_axis("date")
    df["nav"] = df["nav"].ffill()
    df = df.dropna(subset=["nav"]).reset_index()

    return df


def compute_returns(df: pd.DataFrame, periods: list = [1, 5, 20]) -> pd.DataFrame:
    """
    Compute percentage returns over various periods.
    Adds columns: return_1d, return_5d, return_20d, etc.
    """
    df = df.copy()
    for p in periods:
        col_name = f"return_{p}d"
        df[col_name] = df["nav"].pct_change(periods=p) * 100
    return df


def compute_rolling_stats(df: pd.DataFrame, windows: list = [5, 20, 50, 200]) -> pd.DataFrame:
    """
    Compute rolling moving averages and rolling volatility.
    Adds columns: sma_5, sma_20, ..., vol_20, vol_60
    """
    df = df.copy()
    for w in windows:
        df[f"sma_{w}"] = df["nav"].rolling(window=w).mean()

    # Rolling volatility (annualized std of daily returns)
    # Data is forward-filled to 365 days/year, so use 365 for annualization
    daily_returns = df["nav"].pct_change()
    for w in [20, 60]:
        df[f"vol_{w}"] = daily_returns.rolling(window=w).std() * np.sqrt(365) * 100

    return df


def normalize_series(series: pd.Series) -> tuple:
    """
    Min-Max normalize a series to [0, 1] range.
    Returns (normalized_series, min_val, max_val) for inverse transform.
    """
    min_val = series.min()
    max_val = series.max()
    if max_val == min_val:
        return pd.Series(np.zeros(len(series)), index=series.index), min_val, max_val
    normalized = (series - min_val) / (max_val - min_val)
    return normalized, min_val, max_val


def inverse_normalize(values: np.ndarray, min_val: float, max_val: float) -> np.ndarray:
    """Inverse of Min-Max normalization."""
    return values * (max_val - min_val) + min_val


def resample_nav(df: pd.DataFrame, freq: str = "W") -> pd.DataFrame:
    """
    Resample NAV data to a different frequency.
    freq: 'W' (weekly), 'M' (monthly), 'Q' (quarterly)
    Uses last available NAV in each period.
    """
    df = df.copy().set_index("date")
    resampled = df["nav"].resample(freq).last().dropna().reset_index()
    return resampled


def prepare_ml_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """
    Full preprocessing pipeline for ML input:
    1. Clean data
    2. Compute returns
    3. Compute rolling stats
    4. Drop NaN rows (from rolling windows)
    """
    df = clean_nav_data(df)
    df = compute_returns(df, periods=[1, 5, 20])
    df = compute_rolling_stats(df, windows=[5, 20, 50, 200])
    df = df.dropna().reset_index(drop=True)
    return df


def align_multiple_navs(nav_dict: dict) -> pd.DataFrame:
    """
    Align NAV data from multiple funds to common dates.
    Returns DataFrame with date index and columns = scheme codes.
    """
    frames = {}
    for code, nav_df in nav_dict.items():
        cleaned = clean_nav_data(nav_df)
        series = cleaned.set_index("date")["nav"]
        frames[code] = series

    aligned = pd.DataFrame(frames)
    aligned = aligned.ffill().dropna()
    return aligned
