# 🤝 Folio Klarity — Session Handoff

> **Purpose of this file:** everything a fresh chat/assistant needs to continue work on this project without re-discovering context. If you're picking this up in a new chat, paste this file's contents as your first message.

**Last updated:** 2026-06-25
**Owner:** Sricharan DA · GitHub `Char1an` · sricharan.8035@gmail.com
**Working directory (local machine):** `/Users/apple/Desktop/portfolio-analytics/`

---

## 🎯 TL;DR — Current State

Folio Klarity is a full-stack Indian mutual fund analytics platform (React + FastAPI). It's **shipped, live, and public**:

- 🌐 **Frontend:** <https://folio-klarity.vercel.app>
- ⚙️ **Backend API:** <https://folio-klarity-api.onrender.com>
- 📖 **API docs:** <https://folio-klarity-api.onrender.com/docs>
- 📦 **Source:** <https://github.com/Char1an/portfolio-analytics>

**Deploy pipeline:**
- Backend: **Render** — auto-deploys on every `git push` (Blueprint via `render.yaml`) ✅ WORKING
- Frontend: **Vercel** — **auto-deploy is NOT yet wired**. `vercel deploy --prod` must be run manually from `frontend/` after each push. See "Open Action Items" below.

**Latest commit:** `3c6b13a — Add SWP Calculator + Fund Comparison pages` (Vercel is at this commit via manual CLI deploy; further pushes will be Render-only until Git integration is completed).

---

## 🧭 Project Overview

**Folio Klarity** is a fintech dashboard for Indian mutual fund investors. Free NAV data via [MFAPI.in](https://www.mfapi.in/), no user data monetization.

### Feature surface (16 pages)

| Group | Pages |
|---|---|
| **Overview** | Dashboard, Portfolio Builder, Fund Browser, **Compare Funds (new)** |
| **Analytics** | Analytics (perf/risk/rolling), ML Forecast, Simulation |
| **Tools** | Optimizer (MPT), Goal Planner, **SWP Calculator (new)**, Tax Planning |
| **Advanced** | Regime Analysis (GMM), Portfolio Overlap (correlation), Factor Attribution (Fama-French 3-factor) |
| **AI** | Agent (Groq + Llama 3.3 with tool calling — currently disabled, needs `GROQ_API_KEY`) |

### Tech stack

**Frontend:** React 18 · Vite · React Router · Recharts · Tailwind CSS · lucide-react
**Backend:** FastAPI · pandas · NumPy · scipy · scikit-learn · SHAP · groq · pydantic v2
**Data:** MFAPI.in (JSON, 24-hour on-disk cache with atomic writes)
**Auth:** HMAC-SHA256 token-based, `PORTFOLIO_SECRET` env var
**Deploy:** Vercel (frontend) + Render (backend), both free tier

---

## 📁 Repo Layout

```
portfolio-analytics/
├── HANDOFF.md                 ← THIS FILE
├── DEPLOY.md                  ← Detailed deploy walkthrough
├── README.md                  ← Public-facing project intro
├── render.yaml                ← Render Blueprint config
├── .gitignore
│
├── backend/
│   ├── main.py                ← FastAPI entry
│   ├── config.py              ← Constants + env-driven CORS
│   ├── requirements.txt       ← includes shap + groq
│   ├── .env.example
│   ├── analytics/             ← performance, risk, optimizer, tax_harvesting,
│   │                             regime, overlap, behavioral_bias, factor_attribution,
│   │                             portfolio_metrics
│   ├── data/
│   │   ├── fetcher.py         ← MFAPI + atomic cache writes
│   │   ├── preprocessor.py    ← clean_nav_data (forward-fill), rolling stats
│   │   └── schemes.py         ← 198 curated schemes (was 249 with 51 duplicates — fixed)
│   ├── ml/                    ← trainer, features, predictor, evaluator, explainer (SHAP)
│   ├── simulation/            ← scenarios, monte_carlo (GBM)
│   ├── insights/              ← rule-based generator
│   └── routers/               ← data, analytics, forecast, simulation, insights, user, agent
│
└── frontend/
    ├── vercel.json
    ├── .env.example
    ├── vite.config.js         ← Dev proxy /api → localhost:8000
    ├── package.json
    ├── index.html
    └── src/
        ├── App.jsx            ← Router
        ├── main.jsx
        ├── contexts/
        │   ├── AuthContext.jsx
        │   └── auth.js
        ├── hooks/
        │   └── usePortfolio.js  ← Reactive portfolio via localStorage + custom events
        ├── components/layout/
        │   ├── Layout.jsx
        │   └── Sidebar.jsx
        ├── services/
        │   └── api.js         ← All API calls; baseURL from VITE_API_URL env var
        ├── utils/
        │   ├── portfolioStore.js  ← localStorage + server sync
        │   ├── formatters.js       ← formatCurrency, formatPercent, formatDate (NaN-safe)
        │   └── exportUtils.js
        └── pages/             ← 15 .jsx pages (see feature list above)
```

---

## 🚀 Deployment Details

### Backend on Render

- **Service ID:** `srv-d86cgfl7vvec73dl6hi0`
- **Service name:** `folio-klarity-api`
- **Region:** default
- **Plan:** Free (sleeps after 15 min idle → ~30s cold-start)
- **Deploy trigger:** Auto on `git push` to `main` (Blueprint reads `render.yaml`)
- **Blueprint ID:** `exs-d86cg1ojo89c73dtr4dg` (name: "Folio Klarity")
- **Dashboard:** <https://dashboard.render.com/web/srv-d86cgfl7vvec73dl6hi0>

**Env vars set on Render:**
| Key | Value | Notes |
|---|---|---|
| `ENV` | `production` | Enforces `PORTFOLIO_SECRET` requirement in `routers/user.py` |
| `PORTFOLIO_SECRET` | *(auto-generated)* | HMAC-SHA256 signing key |
| `EXTRA_CORS_ORIGINS` | `https://folio-klarity.vercel.app` | Comma-separated allowlist |
| `PYTHON_VERSION` | `3.11` | |
| `GROQ_API_KEY` | **NOT SET** | Would enable AI Agent page — free key at <https://console.groq.com/keys> |

**Caveat — ephemeral disk:** `backend/data/cache/` and `backend/data/users.json` reset on every redeploy. Fine for a demo. To fix: add a paid persistent disk (~$1/mo) or migrate users to a managed DB.

### Frontend on Vercel

- **Project name:** `folio-klarity`
- **Team/Scope:** `char1ans-projects`
- **Project ID:** `prj_INTILDyXUAACGvNxjGVvQBdGpiO4`
- **Root Directory:** `frontend/`
- **Framework:** Vite (auto-detected)
- **Dashboard:** <https://vercel.com/char1ans-projects/folio-klarity>

**Env vars set on Vercel (production):**
| Key | Value |
|---|---|
| `VITE_API_URL` | `https://folio-klarity-api.onrender.com/api` |

**IMPORTANT — Git integration NOT connected.** Deploys currently require manual `vercel deploy --prod --yes` from `frontend/`. This is the main open action item — see below.

---

## 🚨 Open Action Items (in priority order)

### 1. Revoke old Render API key (security)
- Earlier in the session, a Render API key `rnd_R0LdXzaBrpTHiZoodmJTtKuT3u8p` was shared in chat and used to update `EXTRA_CORS_ORIGINS` + trigger a redeploy.
- **This key should be deleted immediately** if not already: <https://dashboard.render.com/u/settings#api-keys>
- Chat transcripts can leak — treat any token that appeared in one as compromised.

### 2. Complete Vercel ↔ GitHub connection (fixes auto-deploy gap)
- Go to <https://vercel.com/char1ans-projects/folio-klarity/settings/git>
- Click the black **"Install"** button
- In the GitHub popup: pick `Char1an` → "Only select repositories" → tick `portfolio-analytics` → **Install**
- Back on Vercel: pick `Char1an` namespace → pick `portfolio-analytics` → **Connect/Save**
- After this, every `git push` auto-deploys frontend + backend

### 3. (Optional) Enable AI Agent page
- Get a free Groq API key at <https://console.groq.com/keys>
- Add `GROQ_API_KEY=gsk_...` to Render env vars → auto-redeploys → Agent page becomes functional

### 4. (Optional) Persistent users.json
- Currently ephemeral on Render free tier
- Cheapest fix: attach a paid persistent disk (~$1/mo) on Render → mount at `/opt/render/project/src/data/` → survives redeploys
- Better fix: migrate `routers/user.py` from JSON file to Postgres (Render free Postgres tier available)

---

## 🛠️ Local Development

### First-time setup

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Run locally

```bash
# Terminal 1 — backend (port 8000)
cd backend && source venv/bin/activate && uvicorn main:app --reload

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Vite proxies `/api` → `http://localhost:8000` (see `vite.config.js`), so no env var needed locally.

### Test build before pushing

```bash
cd frontend && npm run build
```

Builds in <1s. Bundle warning about 500KB+ chunks is expected (Recharts + jsPDF + html2canvas).

### Manual deploy (until Vercel Git integration is set up)

```bash
cd frontend && vercel deploy --prod --yes
```

Requires `vercel login` first (`char1an` is the current user, token stored locally).

---

## 📜 Session History — What we did in this chat

Chronological summary of the work completed:

### Phase 1 — Code quality passes
1. **12 critical fixes** — data corruption bugs, HMAC-SHA256 auth (was bare SHA-256), 51 duplicate scheme codes in `schemes.py`, atomic cache writes, stale portfolio in Simulation/Optimizer/RegimeAnalysis pages via `usePortfolio` hook, `avg_buy_nav` corruption after partial sells, etc.
2. **24 bug-level fixes** — index-based portfolio lookups replaced with scheme_code matching, agent `_t_risk` dict-key mismatches, tax harvest per-fund savings inflation, XIRR convergence check, Sortino downside threshold, forward-fill vs 252-trading-day annualization mismatch, Render rate-limiter memory leak, etc.
3. **22 UX improvements** — auto-run on Overlap/Regime/Factor Attribution pages, tooltips on Volatility/Sharpe/Max DD headers, Portfolio numeric input min=0 clamps, Simulation button loading states, Caps Lock warning on Login, Tax "What-If" toggle wording, FundBrowser search clear button + remove-from-portfolio, etc.
4. **13 nitpicks** — `formatPercent(NaN)` → "—", `formatDate('garbage')` → "—", pluralization ("1 funds" → "1 fund"), removed stale "M1 FIX" / "M2 FIX" comments, bare `except:` → `except (ValueError, TypeError):`, Agent messages use stable ids not array indices, `encodeURIComponent` on API scheme codes, ARIA labels on icon-only buttons.

### Phase 2 — Rebrand
Everything called "PortfolioAI" or "Portfolio Analytics Platform" was renamed to **"Folio Klarity"** — Sidebar, Login logo (`Folio Klarity` with `Klarity` in gradient), Analytics PDF report title, FastAPI app title, Agent system prompt, HTML `<title>`.

### Phase 3 — Deploy infra
Created `.gitignore`, `render.yaml`, `frontend/vercel.json`, `frontend/.env.example`, `backend/.env.example`, `DEPLOY.md` (step-by-step guide). Updated `README.md` with deploy buttons.

Updated `frontend/src/services/api.js` to read `VITE_API_URL` env var. Updated `backend/config.py` CORS to read `EXTRA_CORS_ORIGINS` env var while keeping localhost defaults.

### Phase 4 — Live deploy
- Set git identity, created public GitHub repo via `gh` CLI, pushed
- Deployed backend to Render via Blueprint UI (with `shap` + `groq` added to `requirements.txt` after first build failed on missing imports)
- Deployed frontend to Vercel via CLI (`vercel link` + `vercel env add VITE_API_URL production` + `vercel deploy --prod`)
- Updated Render's `EXTRA_CORS_ORIGINS` via their REST API using a temporary API key
- Verified end-to-end: CORS preflight passes, real POST requests succeed, all pages 200

### Phase 5 — Two new pages (SWP + Compare)
Inspired by Groww's sparse versions, built substantially deeper equivalents:

**`SWP.jsx` (`/swp`) — Systematic Withdrawal Plan Calculator**
- 4-slider live calculator (corpus, monthly withdraw, expected return, years)
- Sustainability badge ("Your corpus lasts X years")
- Inflation adjustment toggle (real vs nominal)
- LTCG tax impact (12.5% + 4% cess after ₹1.25L exemption, Budget 2024)
- Year-by-year depletion table + chart
- FD @ 7% comparison card
- **Backtest mode:** replay SWP against a real fund's historical NAV (units-based simulation)

**`FundCompare.jsx` (`/compare`) — Fund Comparison**
- Up to 4 funds side-by-side (Groww allows 3)
- All return windows filled with real numbers (1m/3m/6m/1y/3y/5y/inception)
- Risk metrics Groww doesn't show: Volatility, Sharpe, Sortino, Max DD, Recovery Days
- **Pairwise correlation matrix with color heatmap** (unique to us)
- Risk-vs-Return scatter plot
- Auto-generated verdict per fund
- Best/worst calendar year

**Backend change:** enhanced `POST /api/analytics/compare` in `backend/routers/analytics.py` to return per-fund `returns`, `risk`, `best_year`, `worst_year`, `verdict`, plus a `correlation` matrix.

**Sidebar:** added "Compare Funds" to Overview group, "SWP Calculator" to Tools group.

---

## 🔍 Where we left off

Last confirmed action: user visited Vercel Git Settings page and saw the "Install GitHub app" prompt. Was about to click **Install** to connect the GitHub app, but didn't finish. Consequently:
- The **live site** already shows SWP + Compare pages (via my manual CLI deploy)
- Future `git push`es will update Render but **not Vercel** until step 2 in "Open Action Items" is completed

---

## 📚 Resume Bullets (for reference)

Bullets drafted earlier for the user's resume — kept here in case needed again:

> **Folio Klarity** — Intelligent Portfolio Analytics Platform
> *Personal project · React, FastAPI, scikit-learn · [folio-klarity.vercel.app](https://folio-klarity.vercel.app) · [github.com/Char1an/portfolio-analytics](https://github.com/Char1an/portfolio-analytics)*
>
> - Built a full-stack analytics platform for Indian mutual fund investors integrating **real-time NAV data** from MFAPI across 198+ curated schemes, with a 24-hour atomic-write JSON cache reducing API calls by ~95%.
> - Implemented **Modern Portfolio Theory optimization** (scipy SLSQP quadratic programming), Monte Carlo simulation (GBM, 1000 paths), Fama-French 3-factor attribution (OLS regression), and Gaussian Mixture Model-based market-regime detection.
> - Designed an **ML forecasting pipeline** comparing Linear Regression, Random Forest, and Gradient Boosting models with 90% confidence intervals and **SHAP explainability** for per-feature attribution.
> - Engineered a **Budget 2024-compliant tax engine** handling STCG/LTCG regimes, ₹1.25L exemption tracking, and tax-loss harvesting with wash-sale detection.
> - Built an **SWP calculator with real-fund backtest** (units-based simulation on historical NAV) and a **4-fund comparison** with pairwise correlation heatmap — features Groww doesn't offer.
> - Built a **conversational AI agent** using Groq + Llama 3.3 70B with custom tool-calling (8 tools: NAV lookup, risk scoring, optimization, forecasting), rate-limited via in-memory token bucket.
> - Hardened production deploy with **HMAC-SHA256 token auth**, env-driven CORS, and CI/CD on Vercel (frontend) + Render (backend).

---

## 💬 Instructions for the assistant picking this up

1. **Read this whole file first.** Do NOT re-audit or re-explore the codebase — most of it has already been audited (see Phase 1–5 history).
2. **Verify current state** with these three commands before doing anything else:
   ```bash
   cd /Users/apple/Desktop/portfolio-analytics
   git log -1 --oneline
   curl -s -o /dev/null -w "backend HTTP %{http_code}\n" https://folio-klarity-api.onrender.com/health
   curl -s https://folio-klarity.vercel.app/ | grep -oE 'assets/index-[a-zA-Z0-9_-]*\.js' | head -1
   ```
3. **Ask the user** where they want to pick up — the open items in this doc, a new feature, or something else.
4. **CLIs already installed and authenticated:** `gh` (as `Char1an`), `vercel` (as `char1an`). Git identity set to Sricharan DA / sricharan.8035@gmail.com.
5. **Never commit** without explicit user request. When you do commit, use a HEREDOC for the message and end with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
6. **Do not** re-use the old Render API key even if visible in chat history — assume it's revoked. If a new one is needed, ask the user to generate + share a fresh one.

---

**End of handoff.** Files newly added in the most recent session: `SWP.jsx`, `FundCompare.jsx`, this `HANDOFF.md`, plus enhanced compare endpoint in `backend/routers/analytics.py`. All changes on branch `main`.
