"""
ML Feature Engineering — Transforms raw NAV time-series into ML-ready feature matrices.

Features include:
- Lag features (NAV at t-1, t-5, t-10, t-20, t-60)
- Rolling moving averages (SMA-5, 20, 50, 200)
- Rolling volatility (20-day, 60-day)
- Returns over multiple horizons
- Momentum indicators (rate of change)
- Calendar features (day of week, month)
"""
import pandas as pd
import numpy as np
from typing import Tuple


def build_features(nav_df: pd.DataFrame) -> pd.DataFrame:
    """
    Build complete feature matrix from raw NAV data.
    Input: DataFrame with columns ['date', 'nav']
    Output: DataFrame with all features + target column
    """
    df = nav_df.copy()
    df = df.sort_values("date").reset_index(drop=True)
    df["date"] = pd.to_datetime(df["date"])

    # ── Lag Features ──
    # These capture recent price history for the model to learn from
    for lag in [1, 2, 3, 5, 10, 20, 60]:
        df[f"nav_lag_{lag}"] = df["nav"].shift(lag)

    # ── Rolling Moving Averages ──
    # Smooth out noise to reveal underlying trends
    for window in [5, 10, 20, 50, 100, 200]:
        df[f"sma_{window}"] = df["nav"].rolling(window=window).mean()

    # ── Price relative to moving averages ──
    # How far current price is from its trend (mean-reversion signal)
    for window in [20, 50, 200]:
        df[f"nav_to_sma_{window}"] = df["nav"] / df[f"sma_{window}"]

    # ── Returns over different horizons ──
    for period in [1, 5, 10, 20, 60]:
        df[f"return_{period}d"] = df["nav"].pct_change(periods=period)

    # ── Rolling Volatility ──
    # Captures recent risk/uncertainty level
    daily_returns = df["nav"].pct_change()
    for window in [10, 20, 60]:
        df[f"volatility_{window}d"] = daily_returns.rolling(window=window).std()

    # ── Momentum / Rate of Change ──
    for period in [5, 10, 20]:
        df[f"momentum_{period}d"] = (df["nav"] - df["nav"].shift(period)) / df["nav"].shift(period)

    # ── Bollinger Band position ──
    # Where current NAV sits within its 20-day Bollinger Band
    sma20 = df["sma_20"]
    std20 = df["nav"].rolling(20).std()
    df["bb_upper"] = sma20 + 2 * std20
    df["bb_lower"] = sma20 - 2 * std20
    bb_range = df["bb_upper"] - df["bb_lower"]
    # Guard: when band width is 0 (zero variance period), default to midpoint (0.5)
    # Without this, division produces inf which dropna() won't catch, corrupting model inputs
    df["bb_position"] = np.where(
        bb_range > 0,
        (df["nav"] - df["bb_lower"]) / bb_range,
        0.5,
    )

    # ── Calendar Features ──
    df["day_of_week"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["quarter"] = df["date"].dt.quarter

    # ── Target: next day's NAV ──
    df["target"] = df["nav"].shift(-1)

    # Drop rows with NaN (from rolling windows)
    df = df.dropna().reset_index(drop=True)

    return df


def get_feature_columns(df: pd.DataFrame) -> list:
    """Return list of feature column names (excluding date, nav, target)."""
    exclude = {"date", "nav", "target", "bb_upper", "bb_lower"}
    return [c for c in df.columns if c not in exclude]


def prepare_train_test(
    df: pd.DataFrame,
    train_ratio: float = 0.8
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, pd.Index]:
    """
    Split feature matrix into train/test sets.
    Time-ordered split (no shuffle) to prevent data leakage.

    Returns: X_train, X_test, y_train, y_test, test_dates
    """
    feature_cols = get_feature_columns(df)

    X = df[feature_cols].values
    y = df["target"].values
    dates = df["date"]

    split_idx = int(len(X) * train_ratio)

    X_train = X[:split_idx]
    X_test = X[split_idx:]
    y_train = y[:split_idx]
    y_test = y[split_idx:]
    test_dates = dates.iloc[split_idx:].reset_index(drop=True)

    return X_train, X_test, y_train, y_test, test_dates


def prepare_lstm_sequences(
    nav_series: np.ndarray,
    sequence_length: int = 60,
    train_ratio: float = 0.8
) -> Tuple:
    """
    Prepare sliding-window sequences for LSTM input.

    Input shape for LSTM: (samples, sequence_length, 1)
    Target: next value after the sequence
    """
    from sklearn.preprocessing import MinMaxScaler

    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled = scaler.fit_transform(nav_series.reshape(-1, 1))

    X, y = [], []
    for i in range(sequence_length, len(scaled)):
        X.append(scaled[i - sequence_length:i, 0])
        y.append(scaled[i, 0])

    X = np.array(X)
    y = np.array(y)

    # Reshape for LSTM: (samples, timesteps, features)
    X = X.reshape((X.shape[0], X.shape[1], 1))

    split_idx = int(len(X) * train_ratio)
    X_train = X[:split_idx]
    X_test = X[split_idx:]
    y_train = y[:split_idx]
    y_test = y[split_idx:]

    return X_train, X_test, y_train, y_test, scaler
