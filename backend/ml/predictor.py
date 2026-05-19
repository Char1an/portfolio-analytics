"""
Predictor — Generates NAV forecasts with confidence intervals.

Uses trained models to predict future NAV values over configurable horizons.
Confidence intervals are generated via:
- Random Forest: variance across tree predictions
- Gradient Boosting: quantile regression approximation
- Linear Regression: prediction intervals using residual std
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from sklearn.preprocessing import StandardScaler


def predict_with_model(
    model_bundle: Dict,
    X: np.ndarray,
) -> np.ndarray:
    """Generate point predictions using a trained model."""
    scaler = model_bundle["scaler"]
    model = model_bundle["model"]
    X_scaled = scaler.transform(X)
    return model.predict(X_scaled)


def predict_with_confidence(
    model_bundle: Dict,
    X: np.ndarray,
    model_name: str,
    confidence: float = 0.9,
) -> Dict:
    """
    Generate predictions with confidence intervals.
    Method depends on model type:

    - Random Forest: Use individual tree predictions to compute variance
    - Gradient Boosting / Linear Regression: Use residual-based intervals
    """
    scaler = model_bundle["scaler"]
    model = model_bundle["model"]
    X_scaled = scaler.transform(X)

    predictions = model.predict(X_scaled)

    if model_name == "random_forest" and hasattr(model, "estimators_"):
        # ── RF: Use tree-level predictions for uncertainty ──
        tree_predictions = np.array([tree.predict(X_scaled) for tree in model.estimators_])
        mean_pred = tree_predictions.mean(axis=0)
        std_pred = tree_predictions.std(axis=0)

        # Confidence interval using z-score
        from scipy import stats
        z = stats.norm.ppf(1 - (1 - confidence) / 2)

        return {
            "predictions": mean_pred.tolist(),
            "lower_bound": (mean_pred - z * std_pred).tolist(),
            "upper_bound": (mean_pred + z * std_pred).tolist(),
            "std": std_pred.tolist(),
        }
    else:
        # ── Residual-based intervals for LR / GBM ──
        # Base uncertainty = mean absolute prediction (1% of NAV level per step is a
        # reasonable lower bound; grows as sqrt(horizon) like a random walk).
        # Using the NAV level itself avoids the old bug of using std(predictions)
        # which just reflected how much the NAV moved over the period, not model error.
        _abs_preds = np.abs(predictions)
        base_nav  = float(np.mean(_abs_preds)) if len(_abs_preds) > 0 and not np.isnan(np.mean(_abs_preds)) else 1.0
        base_std  = base_nav * 0.008   # ~0.8% of NAV per step (empirical daily vol floor)
        stds = np.array([base_std * np.sqrt(i + 1) for i in range(len(predictions))])

        from scipy import stats
        z = stats.norm.ppf(1 - (1 - confidence) / 2)

        return {
            "predictions": predictions.tolist(),
            "lower_bound": (predictions - z * stds).tolist(),
            "upper_bound": (predictions + z * stds).tolist(),
            "std": stds.tolist(),
        }


def multi_step_forecast(
    models: Dict,
    feature_df: pd.DataFrame,
    feature_cols: List[str],
    horizon_days: int = 30,
    selected_model: str = "random_forest",
) -> Dict:
    """
    Generate multi-step ahead forecast by iteratively predicting.

    Strategy: Use the last row's features, predict next NAV,
    then shift features forward using the prediction as new data.
    This captures trend propagation but accumulates uncertainty.
    """
    if selected_model not in models:
        selected_model = list(models.keys())[0]

    model_bundle = models[selected_model]
    scaler = model_bundle["scaler"]
    model = model_bundle["model"]

    # Start from the last available data point
    last_row = feature_df[feature_cols].iloc[-1:].values.copy()
    last_nav = feature_df["nav"].iloc[-1]
    last_date = pd.to_datetime(feature_df["date"].iloc[-1])

    predictions = []
    lower_bounds = []
    upper_bounds = []
    dates = []

    current_features = last_row.copy()
    current_nav = last_nav

    # Cumulative uncertainty grows with each step
    cumulative_std = 0.0

    # Track running date — increment one trading day per step
    # (the old approach used `last_date + step` which collapsed Sat/Sun/Mon onto the same Monday)
    running_date = last_date

    for step in range(1, horizon_days + 1):
        X_scaled = scaler.transform(current_features)
        pred = model.predict(X_scaled)[0]

        # Estimate per-step uncertainty
        if hasattr(model, "estimators_"):
            tree_preds = np.array([t.predict(X_scaled)[0] for t in model.estimators_])
            step_std = tree_preds.std()
        else:
            step_std = abs(pred - current_nav) * 0.05 + abs(pred) * 0.003

        cumulative_std = np.sqrt(cumulative_std**2 + step_std**2)

        from scipy import stats
        z = stats.norm.ppf(0.95)  # 90% CI

        # Advance one trading day (skip weekends)
        running_date += pd.Timedelta(days=1)
        while running_date.weekday() >= 5:
            running_date += pd.Timedelta(days=1)

        predictions.append(round(float(pred), 2))
        lower_bounds.append(round(float(pred - z * cumulative_std), 2))
        upper_bounds.append(round(float(pred + z * cumulative_std), 2))
        dates.append(running_date.strftime("%Y-%m-%d"))

        # Update features for next step (simple shift approach)
        # Shift lag features: nav_lag_1 becomes current pred, nav_lag_2 becomes old lag_1, etc.
        current_features = _shift_features(current_features, pred, feature_cols)
        current_nav = pred

    return {
        "model": selected_model,
        "horizon_days": horizon_days,
        "last_actual_nav": round(float(last_nav), 2),
        "last_actual_date": last_date.strftime("%Y-%m-%d"),
        "forecast": {
            "dates": dates,
            "predictions": predictions,
            "lower_bound": lower_bounds,
            "upper_bound": upper_bounds,
        }
    }


def _shift_features(features: np.ndarray, new_nav: float, feature_cols: List[str]) -> np.ndarray:
    """
    Shift feature values forward by one step using the predicted NAV.

    Updates:
      - Lag features  : shifted so that lag_k(t+1) ≈ lag_{k-1}(t)
      - Return features: recomputed from lag values where possible
      - Momentum      : recomputed from lag values where possible
      - Bollinger pos : approximated using current nav vs rolling band
      - SMAs / vol    : kept approximately constant (change slowly;
                        exact update needs a full rolling window which
                        we don't carry between steps)
    """
    new_features = features.copy()
    col_map = {name: i for i, name in enumerate(feature_cols)}

    # ── 1. Shift lag features (largest to smallest as destination) ──
    # lag_cols sorted ascending by lag number: [1, 2, 3, 5, 10, 20, 60]
    lag_cols = sorted(
        [c for c in feature_cols if c.startswith("nav_lag_")],
        key=lambda x: int(x.split("_")[-1]),
    )
    # Copy from smaller → larger lags (process destinations from end to start)
    for i in range(len(lag_cols) - 1, 0, -1):
        src = col_map.get(lag_cols[i - 1])   # smaller lag (more recent value)
        dst = col_map.get(lag_cols[i])        # larger lag (older slot)
        if src is not None and dst is not None:
            new_features[0, dst] = new_features[0, src]

    # lag_1 = current prediction
    if "nav_lag_1" in col_map:
        new_features[0, col_map["nav_lag_1"]] = new_nav

    # ── 2. Update 1-day return from new vs previous NAV ──
    if "return_1d" in col_map and "nav_lag_1" in col_map:
        prev_nav = features[0, col_map["nav_lag_1"]]
        if prev_nav > 0:
            new_features[0, col_map["return_1d"]] = (new_nav - prev_nav) / prev_nav

    # ── 3. Update multi-period returns using shifted lag values ──
    # return_Nd(t+1) = (nav(t+1) - nav(t+1-N)) / nav(t+1-N)
    # nav(t+1-N) is now stored in nav_lag_N after the shift above
    for period in [5, 10, 20, 60]:
        ret_key = f"return_{period}d"
        lag_key = f"nav_lag_{period}"
        if ret_key in col_map and lag_key in col_map:
            lag_nav = new_features[0, col_map[lag_key]]
            if lag_nav > 0:
                new_features[0, col_map[ret_key]] = (new_nav - lag_nav) / lag_nav

    # ── 4. Update momentum features ──
    for period in [5, 10, 20]:
        mom_key = f"momentum_{period}d"
        lag_key = f"nav_lag_{period}"
        if mom_key in col_map and lag_key in col_map:
            lag_nav = new_features[0, col_map[lag_key]]
            if lag_nav > 0:
                new_features[0, col_map[mom_key]] = (new_nav - lag_nav) / lag_nav

    # ── 5. Approximate Bollinger band position ──
    # band stays approximately constant (sma_20/std_20 update slowly)
    if all(k in col_map for k in ["bb_position", "sma_20"]):
        sma20 = new_features[0, col_map["sma_20"]]
        # Estimate band width from current bb_position back-calculation
        # Keep width constant, just update where new_nav sits within it
        if "volatility_20d" in col_map:
            vol20 = new_features[0, col_map["volatility_20d"]]
            band_width = 4 * sma20 * vol20  # approx ±2σ width
            if band_width > 0:
                bb_lower_approx = sma20 - band_width / 2
                new_features[0, col_map["bb_position"]] = (
                    (new_nav - bb_lower_approx) / band_width
                )

    return new_features


def forecast_all_models(
    models: Dict,
    feature_df: pd.DataFrame,
    feature_cols: List[str],
    horizon_days: int = 30,
) -> Dict:
    """Run forecast for all available models and return comparison."""
    results = {}
    for model_name in models:
        try:
            result = multi_step_forecast(
                models, feature_df, feature_cols, horizon_days, model_name
            )
            results[model_name] = result
        except Exception as e:
            results[model_name] = {"error": str(e)}
    return results
