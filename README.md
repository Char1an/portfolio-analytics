# 📊 Folio Klarity

> A production-grade, full-stack fintech dashboard for **Indian Mutual Fund Analysis** — combining real-time NAV data, ML-based forecasting, Monte Carlo simulation, and Modern Portfolio Theory optimization.

**🌐 Live demo:** _coming soon_ · **📖 Deploy guide:** [DEPLOY.md](./DEPLOY.md)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Char1an/portfolio-analytics&root-directory=frontend&env=VITE_API_URL&envDescription=URL%20of%20the%20deployed%20backend%20API%20(must%20end%20with%20/api))
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Char1an/portfolio-analytics)

---

## 🚀 Quick Deploy

1. Fork or clone this repo to your own GitHub
2. Backend → Render (one click via [render.yaml](./render.yaml))
3. Frontend → Vercel (one click via [frontend/vercel.json](./frontend/vercel.json))
4. Wire them together — full step-by-step in **[DEPLOY.md](./DEPLOY.md)**

Total time: ~15 minutes. Total cost: ₹0/month on free tiers.

---

## ✨ Features

| Category | Capabilities |
|----------|-------------|
| **Real-time Data** | Live NAV via [MFAPI.in](https://www.mfapi.in/) · 24-hour JSON cache · Search across 1000+ schemes |
| **Performance Analytics** | CAGR · Absolute Returns · SIP Simulation · Rolling Returns (1Y/3Y/5Y) · Fund Comparison |
| **Risk Analysis** | Volatility · Sharpe Ratio · Sortino Ratio · Max Drawdown · Composite Risk Score (0–10) |
| **ML Forecasting** | Linear Regression · Random Forest · Gradient Boosting · 90% Confidence Intervals · Auto Model Selection |
| **Scenario Simulation** | 6 Preset Scenarios (crash/bull/flat) · Monte Carlo (1000 paths / GBM) · Outcome Histograms |
| **Portfolio Optimization** | Modern Portfolio Theory (MPT) · Efficient Frontier · Max Sharpe Ratio Allocation |
| **Smart Insights** | Concentration risk alerts · Category overlap detection · Risk-return mismatch warnings |

---

## 🏗️ Architecture

```
portfolio-analytics/
├── backend/                    # Python FastAPI
│   ├── main.py                 # App entry point + CORS
│   ├── config.py               # Configuration constants
│   ├── requirements.txt
│   ├── data/
│   │   ├── fetcher.py          # MFAPI.in integration + 24h cache
│   │   ├── preprocessor.py     # Cleaning, returns, normalization
│   │   └── schemes.py          # 20 curated popular Indian MF schemes
│   ├── analytics/
│   │   ├── performance.py      # CAGR, SIP simulation, portfolio growth
│   │   ├── risk.py             # Volatility, drawdown, risk score (0-10)
│   │   └── optimizer.py        # MPT with scipy SLSQP
│   ├── ml/
│   │   ├── features.py         # 30+ features: lags, SMA, Bollinger bands
│   │   ├── trainer.py          # LR, RF, GBR model training
│   │   ├── predictor.py        # Multi-step forecast + confidence intervals
│   │   └── evaluator.py        # RMSE, MAE, MAPE, R² leaderboard
│   ├── simulation/
│   │   ├── scenarios.py        # 6 predefined scenarios
│   │   └── monte_carlo.py      # GBM engine, Cholesky for portfolio MC
│   ├── insights/
│   │   └── generator.py        # Rule-based insight + severity scoring
│   └── routers/
│       ├── data.py             # /api/data/*
│       ├── analytics.py        # /api/analytics/*
│       ├── forecast.py         # /api/forecast/*
│       ├── simulation.py       # /api/simulation/*
│       └── insights.py         # /api/insights/*
└── frontend/                   # React + Vite + Tailwind CSS
    └── src/
        ├── pages/              # Dashboard, Portfolio, Analytics, Forecast,
        │                       # Simulation, Optimizer (6 pages)
        ├── components/         # Reusable UI components per page
        ├── hooks/              # usePortfolio, useApi
        ├── services/api.js     # Axios client
        └── utils/              # Formatters, constants
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.9+** (system Python on macOS works)
- **Node.js 18+** (`brew install node`)

### 1. Start the Backend

```bash
cd portfolio-analytics/backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Run the API server
uvicorn main:app --port 8000 --reload
```

Backend runs at **http://localhost:8000**  
Swagger UI (interactive docs) at **http://localhost:8000/docs**

### 2. Start the Frontend

```bash
cd portfolio-analytics/frontend

# Install Node dependencies (first time only)
npm install

# Start dev server
npm run dev
```

Frontend runs at **http://localhost:5173**

> ⚠️ Both servers must be running simultaneously. The frontend proxies all `/api/*` requests to the backend via Vite's dev proxy.

---

## 🔌 API Reference

### Data Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/data/search?q={name}` | Search mutual fund schemes |
| `GET` | `/api/data/nav/{scheme_code}` | Get historical NAV data |
| `GET` | `/api/data/schemes` | Get 20 curated popular schemes |

### Analytics Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analytics/performance` | Compute CAGR, SIP growth, returns |
| `POST` | `/api/analytics/risk` | Risk scoring (volatility, drawdown) |
| `POST` | `/api/analytics/optimize` | MPT-based portfolio optimization |

### Forecasting Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/forecast/train` | Train ML models on historical NAV |
| `POST` | `/api/forecast/predict` | Generate NAV forecast with CI bands |

### Simulation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/simulation/scenario` | Run a predefined market scenario |
| `POST` | `/api/simulation/montecarlo` | Run 1000-path Monte Carlo (GBM) |

### Insights Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/insights/generate` | Generate AI-style portfolio insights |

---

## 📈 Frontend Pages

### 🏠 Dashboard
- **4 KPI Cards**: Total Invested · Current Value · Absolute Return · CAGR
- **NAV Growth Chart**: Multi-fund line chart (Recharts)
- **Allocation Donut**: Fund-wise weight visualization
- **Performance Table**: Per-fund summary
- **Insights Panel**: Auto-generated risk/diversification alerts
- **Risk Gauges**: Per-fund risk score bars

### 💼 Portfolio Input
- **Simple Mode**: Pick funds from curated list, set investment amounts
- **Advanced Mode**: SIP configuration, investment date range
- **Live Fund Search**: Debounced search against MFAPI.in (1000+ schemes)

### 📊 Analytics
- **Multi-fund Comparison**: Normalized NAV chart (base 100)
- **SIP Performance Table**: XIRR-equivalent returns per fund
- **Risk Metrics**: Full risk scorecard per fund
- **Risk Score Chart**: Side-by-side bar comparison

### 🔮 Forecast
- **Model Selector**: Choose from LR / Random Forest / Gradient Boosting
- **Prediction Chart**: 30/60/90-day forecast with 90% confidence bands
- **Model Leaderboard**: RMSE, MAE, R² comparison table
- **Auto-training**: One-click model training per fund

### 🌪️ Simulation
- **Scenario Presets**: Mild Crash · Severe Crash · Bull Run · High Volatility · Flat Market · Recovery
- **Monte Carlo Fan Chart**: 1000 simulation paths with percentile bands
- **Probability Bars**: Chance of gain/loss/target
- **Outcome Histogram**: Distribution of terminal values

### ⚖️ Optimizer
- **Efficient Frontier**: Scatter plot of risk vs. return tradeoff
- **Optimal vs. Current Weights**: Grouped bar chart
- **Improvement Metrics**: Expected Sharpe ratio gain from rebalancing

---

## 🧠 ML Forecasting Pipeline

```
Historical NAV
     │
     ▼
Feature Engineering (30+ features)
  ├── Lag features: NAV(t-1), NAV(t-5), NAV(t-10), NAV(t-20)
  ├── Moving averages: SMA-5, SMA-20, SMA-50
  ├── Bollinger Bands (upper/lower)
  ├── Rolling volatility: 20-day, 60-day
  ├── Momentum: RSI-like indicators
  └── Calendar: day-of-week, month
     │
     ▼
Model Training (80/20 time-split)
  ├── Linear Regression (baseline)
  ├── Random Forest (primary)
  └── Gradient Boosting Regressor (ensemble)
     │
     ▼
Multi-step Prediction (iterative)
  └── With 90% confidence intervals via ensemble variance
```

---

## 📉 Monte Carlo Simulation

Uses **Geometric Brownian Motion (GBM)**:

```
S(t+1) = S(t) × exp((μ - σ²/2)Δt + σ√Δt × Z)

where:
  μ = mean daily return (from historical data)
  σ = daily volatility (from historical data)
  Z ~ N(0,1) — random shock
```

- Runs **1000 independent paths** per simulation
- Cholesky decomposition for **correlated multi-fund** portfolio MC
- Outputs: 5th, 25th, 50th, 75th, 95th percentile bands

---

## ⚙️ Configuration

Key settings in `backend/config.py`:

| Setting | Default | Description |
|---------|---------|-------------|
| `CACHE_TTL_HOURS` | `24` | How long NAV cache is valid |
| `RISK_FREE_RATE` | `0.065` | 6.5% (India 10Y G-Sec approximate) |
| `MC_SIMULATIONS` | `1000` | Number of Monte Carlo paths |
| `FORECAST_HORIZON_DAYS` | `90` | Default prediction horizon |
| `TRAIN_TEST_SPLIT` | `0.8` | 80% train / 20% test split |

---

## 🛠️ Tech Stack

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| FastAPI | 0.111.0 | REST API framework |
| Uvicorn | 0.30.1 | ASGI server |
| Pandas | 2.0.3 | Data manipulation |
| NumPy | 1.24.4 | Numerical computing |
| SciPy | 1.11.4 | MPT optimization (SLSQP) |
| scikit-learn | 1.3.2 | ML models (LR, RF, GBR) |
| Requests | 2.31.0 | HTTP client for MFAPI.in |

### Frontend
| Library | Purpose |
|---------|---------|
| React 18 | UI framework |
| Vite | Build tool + dev server |
| Tailwind CSS v4 | Utility-first styling |
| Recharts | Charts (line, scatter, bar, pie) |
| Framer Motion | Page transitions + animations |
| Axios | API calls |
| React Router | Client-side routing |

---

## 📋 Sample Request Bodies

### Portfolio Performance
```json
POST /api/analytics/performance
{
  "funds": [
    {"scheme_code": "118989", "invested_amount": 500000, "investment_date": "2020-01-01"},
    {"scheme_code": "120716", "invested_amount": 300000, "investment_date": "2019-06-15"}
  ],
  "investment_type": "lumpsum"
}
```

### Monte Carlo Simulation
```json
POST /api/simulation/montecarlo
{
  "scheme_codes": ["118989"],
  "weights": [1.0],
  "horizon_days": 365,
  "initial_investment": 100000
}
```

### ML Forecast
```json
POST /api/forecast/predict
{
  "scheme_code": "118989",
  "model": "random_forest",
  "horizon_days": 90
}
```

---

## 🗂️ Popular Scheme Codes

| Fund | Scheme Code | Category |
|------|-------------|----------|
| Nippon India Small Cap | 118989 | Small Cap |
| PPFAS Flexi Cap | 122639 | Flexi Cap |
| Motilal Oswal Midcap | 120716 | Mid Cap |
| SBI Nifty 50 Index | 119598 | Index |
| Mirae Asset Large Cap | 118825 | Large Cap |
| HDFC Balanced Advantage | 118701 | Hybrid |

> Full curated list of 20 schemes available at `GET /api/data/schemes`

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Ensure venv is activated
source backend/venv/bin/activate
# Check Python version
python --version  # should be 3.9+
# Reinstall dependencies
pip install -r backend/requirements.txt
```

### Frontend shows "Network Error"
- Make sure the backend is running on port 8000
- Check `frontend/vite.config.js` proxy target matches backend port

### MFAPI returns empty data
- MFAPI.in is a free community API — may occasionally be slow
- Cached data in `backend/data/cache/` serves as fallback
- Try a different scheme code from the curated list

### ML training fails
```bash
# Training requires at least 60 days of NAV history
# Use a scheme with longer history (e.g., 118989 - Nippon Small Cap)
```

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## 🙏 Acknowledgements

- [MFAPI.in](https://www.mfapi.in/) — Free Indian mutual fund NAV API
- [AMFI India](https://www.amfiindia.com/) — Scheme codes and fund data
- [Recharts](https://recharts.org/) — React charting library
- [FastAPI](https://fastapi.tiangolo.com/) — Modern Python API framework
