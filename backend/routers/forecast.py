"""
Forecast Router — ML model training, prediction, and evaluation endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.fetcher import fetch_nav_history
from data.preprocessor import clean_nav_data
from ml.features import build_features, get_feature_columns, prepare_train_test
from ml.trainer import train_all_models, save_models, load_models, get_feature_importance, is_model_stale
from ml.predictor import multi_step_forecast, forecast_all_models
from ml.evaluator import compare_models
from ml.explainer import load_explainer, explain_prediction, global_feature_importance

router = APIRouter(prefix="/api/forecast", tags=["Forecast"])


class ForecastRequest(BaseModel):
    scheme_code: str
    horizon_days: int = 30
    model: Optional[str] = None  # None = auto-select best


class TrainRequest(BaseModel):
    scheme_code: str
    force_retrain: bool = False


@router.post("/train")
def train_models(req: TrainRequest):
    """
    Train ML models for a specific fund.
    Pipeline: Fetch NAV → Feature Engineering → Train LR/RF/GBR → Evaluate → Save
    """
    # Fetch and prepare data first (needed for staleness check)
    df = fetch_nav_history(req.scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No NAV data found")

    df = clean_nav_data(df)
    current_nav = float(df["nav"].iloc[-1]) if len(df) > 0 else None

    # Check if models already exist AND aren't stale
    if not req.force_retrain:
        existing = load_models(req.scheme_code)
        if existing and not is_model_stale(existing, current_nav):
            return {"message": f"Models already trained for {req.scheme_code}. Use force_retrain=true to retrain.",
                    "models_available": list(existing.keys())}

    # Check BEFORE feature engineering — build_features drops up to 200 rows
    # for the SMA-200 window, so we need enough raw data to leave 300+ rows
    # after the rolling window drops, giving ~240 training samples at 80/20 split.
    if len(df) < 400:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient data for training: {len(df)} raw NAV points available, need 400+. "
                   f"This fund may not have enough history."
        )

    feature_df = build_features(df)

    if len(feature_df) < 200:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient usable samples after feature engineering: {len(feature_df)} rows. "
                   f"Need 200+ after rolling window drops."
        )

    # Split data — used ONLY for honest evaluation metrics
    feature_cols = get_feature_columns(feature_df)
    X_train, X_test, y_train, y_test, test_dates = prepare_train_test(feature_df)

    # First train on the 80/20 split to get fair test-set evaluation
    eval_models = train_all_models(X_train, y_train)
    evaluation = compare_models(eval_models, X_test, y_test)

    # Then refit production models on the FULL dataset so the trees can
    # handle today's NAV range. (Without this, RF/GBM cannot extrapolate
    # above the training-set max — predictions collapse to a stale level
    # whenever the fund has grown beyond the last 20% of its history.)
    X_full = feature_df[feature_cols].values
    y_full = feature_df["target"].values
    models = train_all_models(X_full, y_full)

    # Save models + build SHAP explainers from full training data
    # Embed training metadata so future requests can detect staleness
    from datetime import datetime
    last_train_nav = float(feature_df["nav"].iloc[-1])
    save_models(
        models, req.scheme_code, X_background=X_full,
        training_meta={
            "training_date": datetime.now().isoformat(),
            "last_train_nav": last_train_nav,
            "training_samples": int(len(X_full)),
        },
    )

    # Feature importance
    importance = get_feature_importance(models, feature_cols)

    return {
        "scheme_code": req.scheme_code,
        "training_samples": len(X_full),
        "test_samples": len(X_test),
        "evaluation": evaluation,
        "feature_importance": importance,
        "features_used": len(feature_cols),
    }


@router.post("/predict")
def predict(req: ForecastRequest):
    """
    Generate NAV forecast using trained models.
    Returns predictions with confidence intervals.
    """
    # Prepare feature data (also used for staleness check)
    df = fetch_nav_history(req.scheme_code)
    if df is None:
        raise HTTPException(status_code=404, detail="No NAV data found")

    df = clean_nav_data(df)
    current_nav = float(df["nav"].iloc[-1]) if len(df) > 0 else None

    # Load trained models — auto-retrain if missing or stale (out-of-distribution)
    models = load_models(req.scheme_code)
    if not models or is_model_stale(models, current_nav):
        train_req = TrainRequest(scheme_code=req.scheme_code, force_retrain=True)
        train_models(train_req)
        models = load_models(req.scheme_code)

    if not models:
        raise HTTPException(status_code=500, detail="Failed to train models")

    feature_df = build_features(df)
    feature_cols = get_feature_columns(feature_df)

    # Select model
    if req.model and req.model in models:
        selected = req.model
    else:
        # Auto-select: use Random Forest by default (best general performance)
        selected = "random_forest" if "random_forest" in models else list(models.keys())[0]

    # Generate forecast
    result = multi_step_forecast(
        models, feature_df, feature_cols,
        horizon_days=req.horizon_days,
        selected_model=selected,
    )

    return result


@router.post("/compare-models")
def compare_all_models(req: ForecastRequest):
    """
    Run forecasts from all trained models and compare results.
    """
    models = load_models(req.scheme_code)
    if not models:
        train_req = TrainRequest(scheme_code=req.scheme_code)
        train_models(train_req)
        models = load_models(req.scheme_code)

    if not models:
        raise HTTPException(status_code=500, detail="No models available")

    df = fetch_nav_history(req.scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No NAV data found for this scheme")
    df = clean_nav_data(df)
    feature_df = build_features(df)
    feature_cols = get_feature_columns(feature_df)

    results = forecast_all_models(models, feature_df, feature_cols, req.horizon_days)

    return {"scheme_code": req.scheme_code, "model_forecasts": results}


@router.get("/models/{scheme_code}")
def get_model_info(scheme_code: str):
    """Get info about trained models for a scheme."""
    models = load_models(scheme_code)
    if not models:
        return {"scheme_code": scheme_code, "models_available": False, "models": []}

    return {
        "scheme_code": scheme_code,
        "models_available": True,
        "models": list(models.keys()),
    }


@router.post("/explain")
def explain_forecast(req: ForecastRequest):
    """
    SHAP explanation for the latest model prediction.

    Returns:
    - Waterfall data: per-feature SHAP contributions for the most recent prediction
    - Global importance: which features matter most across all historical predictions
    - Human-readable narrative: plain-English summary of the top drivers
    """
    models = load_models(req.scheme_code)
    if not models:
        train_req = TrainRequest(scheme_code=req.scheme_code)
        train_models(train_req)
        models = load_models(req.scheme_code)

    if not models:
        raise HTTPException(status_code=500, detail="Could not load or train models")

    df = fetch_nav_history(req.scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No NAV data found")

    df = clean_nav_data(df)
    feature_df = build_features(df)
    feature_cols = get_feature_columns(feature_df)

    # Select model
    selected = req.model if req.model and req.model in models else (
        "random_forest" if "random_forest" in models else list(models.keys())[0]
    )
    model_bundle = models[selected]

    # Load SHAP explainer — if missing, build it on-the-fly from recent data
    explainer = load_explainer(req.scheme_code, selected)
    if explainer is None:
        from ml.explainer import build_shap_explainer, save_explainer
        from ml.features import prepare_train_test
        X_train, _, _, _, _ = prepare_train_test(feature_df)
        try:
            explainer = build_shap_explainer(model_bundle, X_train, selected)
            save_explainer(explainer, req.scheme_code, selected)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not build SHAP explainer: {e}")

    # Most recent data point → explain the next-day prediction
    X = feature_df[feature_cols].values
    X_latest = X[-1:].copy()
    baseline_nav = float(feature_df["nav"].iloc[-1])

    # Per-prediction SHAP (waterfall)
    waterfall = explain_prediction(
        model_bundle, explainer, X_latest, feature_cols, selected, baseline_nav
    )

    # Global importance across last 100 data points
    X_sample = X[-100:] if len(X) >= 100 else X
    global_imp = global_feature_importance(
        model_bundle, explainer, X_sample, feature_cols, selected
    )

    # Build plain-English narrative from top drivers
    narrative = _build_shap_narrative(waterfall, baseline_nav, selected)

    return {
        "scheme_code":        req.scheme_code,
        "model":              selected,
        "baseline_nav":       round(baseline_nav, 2),
        "waterfall":          waterfall,
        "global_importance":  global_imp,
        "narrative":          narrative,
        "feature_count":      len(feature_cols),
    }


def _build_shap_narrative(waterfall: Dict, baseline_nav: float, model_name: str) -> str:
    """Convert SHAP values into a plain-English explanation."""
    if "error" in waterfall:
        return "Could not generate explanation for this prediction."

    predicted  = waterfall.get("predicted", baseline_nav)
    direction  = "higher" if predicted > baseline_nav else "lower"
    change_pct = abs((predicted - baseline_nav) / baseline_nav * 100) if baseline_nav else 0

    top_pos = waterfall.get("top_positive", [])
    top_neg = waterfall.get("top_negative", [])

    model_names = {
        "random_forest":    "Random Forest",
        "gradient_boosting":"Gradient Boosting",
        "linear_regression":"Linear Regression",
    }
    model_label = model_names.get(model_name, model_name)

    parts = [
        f"The {model_label} model predicts tomorrow's NAV will be "
        f"₹{predicted:.2f} — {direction} than today's ₹{baseline_nav:.2f} "
        f"({change_pct:.2f}% {'gain' if direction == 'higher' else 'decline'})."
    ]

    if top_pos:
        drivers = ", ".join(f"{c['label']} (+₹{abs(c['shap_value']):.2f})" for c in top_pos[:3])
        parts.append(f"Bullish signals: {drivers}.")

    if top_neg:
        drags = ", ".join(f"{c['label']} (−₹{abs(c['shap_value']):.2f})" for c in top_neg[:3])
        parts.append(f"Bearish signals: {drags}.")

    r2_note = "The model explains historical price movements well." if len(top_pos) + len(top_neg) >= 3 else ""
    if r2_note:
        parts.append(r2_note)

    return " ".join(parts)


@router.get("/train-status/{scheme_code}")
def get_train_status(scheme_code: str):
    """
    Check whether trained models exist for a scheme and return basic metadata.
    Called by the frontend to decide whether to show Train vs Predict buttons.
    """
    models = load_models(scheme_code)
    if not models:
        return {
            "scheme_code": scheme_code,
            "trained": False,
            "models": [],
            "message": "No trained models found. Call /train first.",
        }

    # Check how fresh the data is vs the cached models
    df = fetch_nav_history(scheme_code)
    data_points = len(df) if df is not None else 0

    return {
        "scheme_code": scheme_code,
        "trained": True,
        "models": list(models.keys()),
        "data_points_available": data_points,
        "message": f"{len(models)} model(s) ready: {', '.join(models.keys())}",
    }
