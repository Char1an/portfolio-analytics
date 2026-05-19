"""
Configuration constants for the Portfolio Analytics Platform.
"""
import os

# ── API Data Source ──────────────────────────────────────────────
MFAPI_BASE_URL = "https://api.mfapi.in"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "data", "cache")
CACHE_TTL_HOURS = 24  # Re-fetch NAV data after this many hours

# ── Financial Constants ──────────────────────────────────────────
RISK_FREE_RATE = 0.065  # 6.5% — Indian 10-year G-Sec yield (approx)
TRADING_DAYS_PER_YEAR = 252

# ── ML Pipeline ──────────────────────────────────────────────────
TRAIN_TEST_SPLIT = 0.80  # 80% train, 20% test (time-ordered)
FORECAST_HORIZONS = [30, 60, 90]  # days
SEQUENCE_LENGTH = 60  # lookback for LSTM

# ── Monte Carlo ──────────────────────────────────────────────────
MC_SIMULATIONS = 1000
MC_DEFAULT_HORIZON_DAYS = 252  # 1 year

# ── Risk Score Weights ───────────────────────────────────────────
RISK_WEIGHT_VOLATILITY = 0.35
RISK_WEIGHT_DRAWDOWN = 0.35
RISK_WEIGHT_SHARPE = 0.30

# ── CORS ─────────────────────────────────────────────────────────
# Always allow local dev origins. In production, set the
# EXTRA_CORS_ORIGINS env var to a comma-separated list of deployed
# frontend origins, e.g.:
#   EXTRA_CORS_ORIGINS=https://folio-klarity.vercel.app,https://folioklarity.com
import os as _os
_DEFAULT_CORS = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
_extra = [o.strip() for o in _os.environ.get("EXTRA_CORS_ORIGINS", "").split(",") if o.strip()]
CORS_ORIGINS = _DEFAULT_CORS + _extra
