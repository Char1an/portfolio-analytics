"""
Model Evaluator — Compares ML models using standard regression metrics.

Provides RMSE, MAE, MAPE, and R² for each model, enabling
dynamic selection of the best-performing model per fund.
"""
import numpy as np
from typing import Dict, List
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score


def evaluate_model(y_true: np.ndarray, y_pred: np.ndarray) -> Dict:
    """
    Compute regression metrics for a single model.
    """
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)

    # MAPE: Mean Absolute Percentage Error
    # Avoid division by zero
    mask = y_true != 0
    if mask.sum() > 0:
        mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100
    else:
        mape = 0.0

    return {
        "rmse": round(float(rmse), 4),
        "mae": round(float(mae), 4),
        "mape": round(float(mape), 2),
        "r2_score": round(float(r2), 4),
    }


def compare_models(
    models: Dict,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> Dict:
    """
    Evaluate all models on the test set and identify the best one.

    Returns:
    {
        "model_metrics": {model_name: {rmse, mae, mape, r2}},
        "best_model": model_name (lowest RMSE),
        "leaderboard": sorted list by RMSE
    }
    """
    metrics = {}
    for name, bundle in models.items():
        scaler = bundle["scaler"]
        model = bundle["model"]

        X_scaled = scaler.transform(X_test)
        y_pred = model.predict(X_scaled)

        metrics[name] = evaluate_model(y_test, y_pred)
        metrics[name]["predictions_sample"] = y_pred[:10].tolist()

    # Build leaderboard sorted by RMSE (lower = better)
    leaderboard = sorted(metrics.items(), key=lambda x: x[1]["rmse"])

    return {
        "model_metrics": metrics,
        "best_model": leaderboard[0][0] if leaderboard else None,
        "leaderboard": [
            {"rank": i + 1, "model": name, **m}
            for i, (name, m) in enumerate(leaderboard)
        ],
    }
