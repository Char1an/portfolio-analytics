"""
Model Trainer — Trains and serializes ML models for NAV prediction.

Three-tier architecture:
1. Linear Regression (baseline) — simple, fast, interpretable
2. Random Forest Regressor (primary) — handles non-linearity, feature importance
3. Gradient Boosting (advanced) — best tabular performance, alternative to LSTM
"""
import os
import numpy as np
import pandas as pd
import joblib
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from typing import Dict, Optional, Tuple
from ml.explainer import build_shap_explainer, save_explainer

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache", "models")


def _ensure_model_dir():
    os.makedirs(MODEL_DIR, exist_ok=True)


def train_linear_regression(X_train: np.ndarray, y_train: np.ndarray) -> Tuple:
    """
    Baseline model: Linear Regression.
    Fast to train, provides a performance floor.
    """
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    model = LinearRegression()
    model.fit(X_scaled, y_train)

    return model, scaler


def train_random_forest(X_train: np.ndarray, y_train: np.ndarray) -> Tuple:
    """
    Primary model: Random Forest Regressor.
    Captures non-linear patterns, resistant to overfitting.

    Hyperparameters chosen for a good balance of accuracy and speed:
    - n_estimators=200: enough trees for stable predictions
    - max_depth=15: prevents overfitting to noise
    - min_samples_leaf=5: smooths predictions
    """
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=15,
        min_samples_leaf=5,
        min_samples_split=10,
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_scaled, y_train)

    return model, scaler


def train_gradient_boosting(X_train: np.ndarray, y_train: np.ndarray) -> Tuple:
    """
    Advanced model: Gradient Boosting Regressor.
    Sequential ensemble that corrects previous errors.
    Often outperforms RF on structured/tabular data.
    """
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    model = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        min_samples_leaf=5,
        random_state=42,
    )
    model.fit(X_scaled, y_train)

    return model, scaler


def train_all_models(X_train: np.ndarray, y_train: np.ndarray) -> Dict:
    """
    Train all three models and return them in a dict.
    """
    models = {}

    # 1. Linear Regression
    lr_model, lr_scaler = train_linear_regression(X_train, y_train)
    models["linear_regression"] = {"model": lr_model, "scaler": lr_scaler}

    # 2. Random Forest
    rf_model, rf_scaler = train_random_forest(X_train, y_train)
    models["random_forest"] = {"model": rf_model, "scaler": rf_scaler}

    # 3. Gradient Boosting
    gb_model, gb_scaler = train_gradient_boosting(X_train, y_train)
    models["gradient_boosting"] = {"model": gb_model, "scaler": gb_scaler}

    return models


def save_models(models: Dict, scheme_code: str, X_background: np.ndarray = None,
                training_meta: Optional[Dict] = None):
    """Serialize trained models and their SHAP explainers to disk.

    training_meta: optional dict with {'training_date', 'last_train_nav'} to track staleness.
    """
    _ensure_model_dir()
    from datetime import datetime
    meta = training_meta or {}
    meta.setdefault("training_date", datetime.now().isoformat())

    for name, bundle in models.items():
        # Embed training metadata into the saved bundle
        bundle["_meta"] = meta
        path = os.path.join(MODEL_DIR, f"{scheme_code}_{name}.joblib")
        joblib.dump(bundle, path)

        # Build and save SHAP explainer if background data provided
        if X_background is not None:
            try:
                explainer = build_shap_explainer(bundle, X_background, name)
                save_explainer(explainer, scheme_code, name)
            except Exception as e:
                print(f"[SHAP] Could not build explainer for {name}: {e}")


def load_models(scheme_code: str) -> Optional[Dict]:
    """Load previously trained models from disk."""
    _ensure_model_dir()
    models = {}
    for name in ["linear_regression", "random_forest", "gradient_boosting"]:
        path = os.path.join(MODEL_DIR, f"{scheme_code}_{name}.joblib")
        if os.path.exists(path):
            models[name] = joblib.load(path)
    return models if models else None


def is_model_stale(models: Dict, current_nav: float, max_age_days: int = 30) -> bool:
    """
    Check if cached models should be retrained.
    Stale if EITHER:
    - Training is >max_age_days old, OR
    - Current NAV is >15% outside the trained NAV range (out-of-distribution)
    """
    from datetime import datetime
    if not models:
        return True

    # Check any one model's metadata (all are saved together)
    sample = next(iter(models.values()))
    meta = sample.get("_meta", {})

    # 1. Age check
    train_date_str = meta.get("training_date")
    if train_date_str:
        try:
            train_date = datetime.fromisoformat(train_date_str)
            age_days = (datetime.now() - train_date).days
            if age_days > max_age_days:
                return True
        except Exception:
            return True
    else:
        # No metadata = old-format model = stale by definition
        return True

    # 2. NAV range check — if current NAV is way outside training range, retrain
    last_train_nav = meta.get("last_train_nav")
    if last_train_nav and current_nav:
        drift = abs(current_nav - last_train_nav) / last_train_nav
        if drift > 0.15:   # 15% drift triggers retrain
            return True

    return False


def get_feature_importance(models: Dict, feature_names: list) -> Dict:
    """
    Extract feature importance from tree-based models.
    Helps explain what drives predictions.
    """
    importance = {}
    for name in ["random_forest", "gradient_boosting"]:
        if name in models:
            model = models[name]["model"]
            imp = model.feature_importances_
            # Top 15 features
            top_idx = np.argsort(imp)[-15:][::-1]
            importance[name] = [
                {"feature": feature_names[i], "importance": round(float(imp[i]), 4)}
                for i in top_idx
            ]
    return importance
