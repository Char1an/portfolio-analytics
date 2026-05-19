"""
SHAP Explainability — explains WHY the ML model predicts what it predicts.

For each prediction, SHAP values show exactly how much each feature
(momentum, SMA crossover, volatility, etc.) contributed to pushing
the prediction up or down from the baseline.

Uses TreeExplainer for Random Forest and Gradient Boosting (exact, fast),
and LinearExplainer for Linear Regression.
"""
import numpy as np
import shap
import joblib
import os
from typing import Dict, List, Optional

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache", "models")

# Human-readable labels for every feature the ML pipeline produces
FEATURE_LABELS = {
    # Lag features
    "nav_lag_1":  "Yesterday's NAV",
    "nav_lag_2":  "NAV 2 days ago",
    "nav_lag_3":  "NAV 3 days ago",
    "nav_lag_5":  "NAV 5 days ago",
    "nav_lag_10": "NAV 10 days ago",
    "nav_lag_20": "NAV 20 days ago",
    "nav_lag_60": "NAV 60 days ago",
    # Moving averages
    "sma_5":   "SMA-5 (1-week avg)",
    "sma_10":  "SMA-10 (2-week avg)",
    "sma_20":  "SMA-20 (1-month avg)",
    "sma_50":  "SMA-50 (10-week avg)",
    "sma_100": "SMA-100 (5-month avg)",
    "sma_200": "SMA-200 (10-month avg)",
    # Price vs moving average
    "nav_to_sma_20":  "Price vs 1-month avg",
    "nav_to_sma_50":  "Price vs 10-week avg",
    "nav_to_sma_200": "Price vs 10-month avg",
    # Returns
    "return_1d":  "1-day return",
    "return_5d":  "5-day return (1 week)",
    "return_10d": "10-day return (2 weeks)",
    "return_20d": "20-day return (1 month)",
    "return_60d": "60-day return (3 months)",
    # Volatility
    "volatility_10d": "10-day volatility",
    "volatility_20d": "20-day volatility (1 month)",
    "volatility_60d": "60-day volatility (3 months)",
    # Momentum
    "momentum_5d":  "5-day momentum",
    "momentum_10d": "10-day momentum",
    "momentum_20d": "20-day momentum",
    # Bollinger
    "bb_position": "Bollinger Band position",
    # Calendar
    "day_of_week": "Day of week",
    "month":       "Month",
    "quarter":     "Quarter",
}


def _label(feature_name: str) -> str:
    return FEATURE_LABELS.get(feature_name, feature_name.replace("_", " ").title())


def build_shap_explainer(model_bundle: Dict, X_background: np.ndarray, model_name: str):
    """
    Build a SHAP explainer for the given model.

    - TreeExplainer  → Random Forest, Gradient Boosting (exact Shapley values, fast)
    - LinearExplainer → Linear Regression (exact for linear models)
    """
    scaler = model_bundle["scaler"]
    model  = model_bundle["model"]
    X_bg_scaled = scaler.transform(X_background)

    if model_name in ("random_forest", "gradient_boosting"):
        # Sample background to keep it fast (max 100 rows)
        bg = X_bg_scaled[:100] if len(X_bg_scaled) > 100 else X_bg_scaled
        explainer = shap.TreeExplainer(model, data=bg, feature_perturbation="interventional")
    else:
        explainer = shap.LinearExplainer(model, X_bg_scaled)

    return explainer


def save_explainer(explainer, scheme_code: str, model_name: str):
    """Persist explainer to disk alongside the model."""
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = os.path.join(MODEL_DIR, f"{scheme_code}_{model_name}_explainer.joblib")
    joblib.dump(explainer, path)


def load_explainer(scheme_code: str, model_name: str):
    """Load a saved SHAP explainer from disk."""
    path = os.path.join(MODEL_DIR, f"{scheme_code}_{model_name}_explainer.joblib")
    if os.path.exists(path):
        return joblib.load(path)
    return None


def explain_prediction(
    model_bundle: Dict,
    explainer,
    X_instance: np.ndarray,
    feature_names: List[str],
    model_name: str,
    baseline_nav: float,
) -> Dict:
    """
    Compute SHAP values for a single prediction (the most recent data point).

    Returns a waterfall-ready payload:
    {
        "baseline": float,          # average prediction (what the model expects without any features)
        "predicted": float,         # actual model output
        "contributions": [          # per-feature SHAP contributions, sorted by |impact|
            {"feature": str, "label": str, "shap_value": float, "feature_value": float, "direction": "up"|"down"},
            ...
        ],
        "top_positive": [...],      # top 5 features pushing prediction UP
        "top_negative": [...],      # top 5 features pushing prediction DOWN
    }
    """
    scaler = model_bundle["scaler"]
    model  = model_bundle["model"]

    X_scaled = scaler.transform(X_instance)

    # Compute SHAP values
    try:
        shap_values = explainer.shap_values(X_scaled)
    except Exception:
        # Fallback: use feature_importances_ as proxy (tree models)
        if hasattr(model, "feature_importances_"):
            imp = model.feature_importances_
            pred = model.predict(X_scaled)[0]
            shap_values = np.array([(pred - baseline_nav) * i for i in imp]).reshape(1, -1)
        else:
            return {"error": "Could not compute SHAP values"}

    if isinstance(shap_values, list):
        shap_values = shap_values[0]

    sv = shap_values[0]  # shape: (n_features,)
    fv = X_instance[0]   # raw (unscaled) feature values

    # Expected value (baseline)
    try:
        expected = float(explainer.expected_value)
        if isinstance(explainer.expected_value, np.ndarray):
            expected = float(explainer.expected_value[0])
    except Exception:
        expected = float(baseline_nav)

    predicted = float(model.predict(X_scaled)[0])

    contributions = []
    for i, (name, sv_i) in enumerate(zip(feature_names, sv)):
        contributions.append({
            "feature":       name,
            "label":         _label(name),
            "shap_value":    round(float(sv_i), 4),
            "shap_value_pct": round(float(sv_i) / max(abs(predicted), 1) * 100, 3),
            "feature_value": round(float(fv[i]), 4),
            "direction":     "up" if sv_i > 0 else "down",
        })

    # Sort by absolute SHAP value (most impactful first)
    contributions.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    top_positive = [c for c in contributions if c["direction"] == "up"][:5]
    top_negative = [c for c in contributions if c["direction"] == "down"][:5]

    return {
        "baseline":      round(expected, 2),
        "predicted":     round(predicted, 2),
        "contributions": contributions[:20],   # top 20 features
        "top_positive":  top_positive,
        "top_negative":  top_negative,
        "total_shap_sum": round(float(np.sum(sv)), 4),
    }


def global_feature_importance(
    model_bundle: Dict,
    explainer,
    X_sample: np.ndarray,
    feature_names: List[str],
    model_name: str,
    n_samples: int = 50,
) -> List[Dict]:
    """
    Compute mean |SHAP| across a sample of training data points.
    This gives the GLOBAL importance of each feature — which features
    matter most across ALL predictions, not just one.
    """
    scaler = model_bundle["scaler"]
    X_scaled = scaler.transform(X_sample[:n_samples])

    try:
        shap_matrix = explainer.shap_values(X_scaled)
    except Exception:
        # Fallback to built-in feature importances
        model = model_bundle["model"]
        if hasattr(model, "feature_importances_"):
            imp = model.feature_importances_
            total = imp.sum() if imp.sum() > 0 else 1
            return [
                {
                    "feature": name,
                    "label": _label(name),
                    "mean_abs_shap": round(float(v), 4),
                    "importance_pct": round(float(v / total) * 100, 1),
                }
                for name, v in sorted(zip(feature_names, imp), key=lambda x: -x[1])
            ][:15]
        return []

    if isinstance(shap_matrix, list):
        shap_matrix = shap_matrix[0]

    mean_abs = np.mean(np.abs(shap_matrix), axis=0)
    total = mean_abs.sum() if mean_abs.sum() > 0 else 1

    importance = []
    for name, val in zip(feature_names, mean_abs):
        importance.append({
            "feature":        name,
            "label":          _label(name),
            "mean_abs_shap":  round(float(val), 4),
            "importance_pct": round(float(val / total) * 100, 1),
        })

    importance.sort(key=lambda x: -x["mean_abs_shap"])
    return importance[:15]
