# Portfolio Analytics — Handoff Notes

## Goal

Audit and fix the **PortfolioAI** full-stack Indian mutual fund analytics platform
(`/Users/apple/Desktop/portfolio-analytics`).

The overarching objective is to make the app **production-ready**:
- No data-loss scenarios
- Correct tax calculations (Budget 2024 Indian rules)
- Secure auth
- Clean, non-confusing UI
- All errors surfaced to the user (no silent failures)

The app is a React + Vite frontend talking to a FastAPI Python backend.
Data comes from MFAPI.in (free Indian MF NAV API, no yfinance).

---

## Tech Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 18, React Router v6, Recharts, custom CSS design system |
| Backend   | FastAPI, uvicorn, pandas, numpy, scipy, scikit-learn |
| Data      | MFAPI.in — free Indian mutual fund NAV |
| Storage   | `localStorage` key `portfolio_funds_v2` + server-side `data/users/<name>.json` |
| Ports     | Frontend → `localhost:5173`, Backend → `localhost:8000` |

---

## Current Status

### Completed (this session)

Seven critical bugs have been fixed and the frontend build is clean (`npx vite build` exits 0).

| # | Bug | Fix Applied | Files |
|---|-----|-------------|-------|
| 1 | **Data-loss** — Portfolio.jsx auto-synced empty localStorage to server on every mount, overwriting cloud data | `hasUserEdit` ref guard in Portfolio.jsx; `portfolio-hydrated` event system; AuthContext now calls `getMe()` on boot to hydrate localStorage from server | `frontend/src/contexts/AuthContext.jsx`, `frontend/src/pages/Portfolio.jsx` |
| 2 | **Tax category mismatch** — Portfolio dropdown writes `'Index'`, Tax.jsx `EQUITY_CATS` listed `'Index Funds'` → all index funds silently taxed at slab rate | Fixed `EQUITY_CATS` to match dropdown values; Hybrid removed from equity bucket (conservative) | `frontend/src/pages/Tax.jsx` |
| 3 | **Negative `total_invested`** — backend `simulate_with_transactions` returned `total_invested = buys - sells`, could go negative; Tax.jsx then computed wildly inflated gains | Backend now returns gross `total_invested`, separate `total_redeemed`, and accurate `gain = current + redeemed - invested`; Tax.jsx prefers backend `gain` when present | `backend/analytics/performance.py`, `frontend/src/pages/Tax.jsx` |
| 4 | **Weak password hashing** — plain SHA-256 with global salt (~10⁹ attempts/sec on GPU) | Upgraded to `hashlib.scrypt` with per-user 16-byte random salt. Format: `scrypt$<salt_b64>$<hash_b64>`. Legacy SHA-256 hashes are verified and lazily upgraded on next login | `backend/routers/user.py` |
| 5 | **Timing attack on token verify** — `sig != expected` short-circuits on first mismatched byte | Replaced with `hmac.compare_digest(sig, expected)` | `backend/routers/user.py` |
| 6 | **Silent errors in Simulation** — `handleScenario` and `handleMC` caught errors and only `console.error`'d; user saw nothing | Added `error` state + dismissible red banner; both handlers now extract `e.response.data.detail` | `frontend/src/pages/Simulation.jsx` |
| 7 | **Hardcoded "Charan"** — Dashboard showed "Charan's portfolio" and "Good morning, Charan" for every user | Now reads from `useAuth().user?.username`; graceful fallback when not logged in | `frontend/src/pages/Dashboard.jsx` |

---

### Not Yet Fixed (should-fix batch)

These are confirmed bugs / confusing UX items that have NOT been touched yet:

| # | Issue | Location | Notes |
|---|-------|----------|-------|
| A | **Stale portfolio across SPA navigations** | Tax, Analytics, Forecast, FundBrowser, Optimizer, TaxHarvesting, etc. | All snapshot `loadPortfolio()` once via `useState(() => loadPortfolio())`. User adds a fund in Portfolio Builder → navigates to Tax → sees stale data until full page reload. Fix: `usePortfolio()` hook with a `storage` event listener, or re-read in a `useEffect` on mount. |
| B | **`loadPortfolio()` in render bodies** | `BehavioralBias.jsx:347`, `FactorAttribution.jsx:246` (inside `.map`), `Agent.jsx:213` | Runs `JSON.parse(localStorage)` on every render. Move to `useState`. |
| C | **Dead API endpoints** | `services/api.js:45-46` | `analyzeBenchmark` → `/analytics/benchmark` (no backend route), `analyzeTax` → `/analytics/tax` (no backend route). Also `getLatestNav` is defined but unused anywhere. Remove or implement. |
| D | **Duplicate-add is silent no-op** | `Portfolio.jsx:41` | `if (portfolio.find(...)) return;` — no toast, no feedback. Show "Already in portfolio". |
| E | **`confirm()` for portfolio reset** | `Portfolio.jsx:87` | Native browser `confirm()` is jarring vs the design system. Replace with an inline confirmation (`Are you sure? [Confirm] [Cancel]` swap on the button). |
| F | **AMC concentration heuristic is broken** | `Portfolio.jsx:118-122` | Takes first 2 words as AMC name. "HDFC Top 100" → "HDFC Top"; "HDFC ELSS" → "HDFC ELSS" — treated as different AMCs. Take first 1 word, or maintain a known AMC list. |
| G | **Hardcoded port 8000 in error messages** | `Dashboard.jsx:249`, `Tax.jsx:269`, `Optimizer.jsx:128` | Frontend uses Vite proxy (`/api`), so port 8000 is irrelevant. Remove the port reference; say "ensure the backend is reachable" instead. |
| H | **Hybrid/ETF tax categorisation is ambiguous** | `Tax.jsx` | Hybrid is now conservatively non-equity. But UI gives no hint — user setting "Hybrid" gets slab taxation with no explanation. Add a tooltip or note in the Per-Fund table. |
| I | **Dashboard "Issue №…"** | `Dashboard.jsx:200` | The `issueNo` variable is computed but no longer used in JSX (removed with the Charan fix). Clean up the dead variable. |
| J | **No responsive / mobile layout** | `Layout.jsx:14` | `marginLeft: 236` is hardcoded; sidebar is `position: fixed`. Collapses on narrow windows. No mobile drawer. Lowest priority but worth noting. |
| K | **Forecast vs Simulation use different day-year conversion** | `Forecast.jsx:72` (365), `Simulation.jsx:120` (252) | Both label input "years". Forecast is correct for calendar NAV data; Simulation correct for trading-day MC. Add the equivalent day count next to the input ("≈ 252 trading days") so users aren't confused. |

---

## Files Actively Modified This Session

```
frontend/src/contexts/AuthContext.jsx     ← data-loss fix (hydration + getMe)
frontend/src/pages/Portfolio.jsx          ← data-loss fix (hasUserEdit guard)
frontend/src/pages/Dashboard.jsx          ← dynamic username, import useAuth
frontend/src/pages/Tax.jsx                ← EQUITY_CATS fix, gain field, banner copy
frontend/src/pages/Simulation.jsx         ← error state + banner
backend/analytics/performance.py          ← simulate_with_transactions return values
backend/routers/user.py                   ← scrypt hashing, hmac.compare_digest
```

---

## Everything Tried That Failed

None of the fixes required rollbacks — all landed first-attempt. However, some design decisions were considered and rejected:

- **Rejected: fetch server portfolio inside Portfolio.jsx on mount** — would create a race condition with the `useEffect` sync and require auth-awareness in every page. Instead centralised it in AuthContext via `portfolio-hydrated` event.
- **Rejected: change `total_invested` semantics to net (buys - sells)** — too many downstream consumers depend on it as a positive number (Dashboard KPIs, portfolio_summary total, etc.). Added a separate `gain` field instead.
- **Rejected: bcrypt for password hashing** — requires `pip install bcrypt` (extra dependency). Used `hashlib.scrypt` from stdlib instead — equally memory-hard, zero new deps.
- **Rejected: breaking password hash change** — would have locked out existing users. Used `scrypt$...` prefix to detect format and lazy-upgrade on login; old SHA-256 hashes still verify until the user next logs in.

---

## Next Steps (in recommended order)

### Step 1 — Stale portfolio across pages (Issue A)

Create `frontend/src/hooks/usePortfolio.js`:

```js
import { useState, useEffect } from 'react';
import { loadPortfolio } from '../utils/portfolioStore';

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState(loadPortfolio);

  useEffect(() => {
    function sync() { setPortfolio(loadPortfolio()); }
    // Picks up changes from other tabs AND the portfolio-hydrated event
    window.addEventListener('storage', sync);
    window.addEventListener('portfolio-hydrated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('portfolio-hydrated', sync);
    };
  }, []);

  return portfolio;
}
```

Then replace `useState(() => loadPortfolio())` with `usePortfolio()` in:
`Tax.jsx`, `Analytics.jsx`, `Forecast.jsx`, `FundBrowser.jsx`, `Optimizer.jsx`,
`TaxHarvesting.jsx`, `RegimeAnalysis.jsx`, `Overlap.jsx`, `BehavioralBias.jsx`,
`FactorAttribution.jsx`, `Agent.jsx`

Also add `Portfolio.jsx` to dispatch a `storage`-like event when it saves, so same-tab navigation picks up changes:
```js
// in portfolioStore.js savePortfolio()
window.dispatchEvent(new Event('portfolio-updated'));
```

### Step 2 — Remove dead endpoints (Issue C)

In `services/api.js`, delete lines 45-46 (`analyzeBenchmark`, `analyzeTax`).
Also delete `getLatestNav` (line 35) since nothing calls it.

### Step 3 — Duplicate-add feedback (Issue D)

In `Portfolio.jsx addFund()`, before the early return:
```js
if (portfolio.find(p => p.scheme_code === String(fund.schemeCode))) {
  // toast / inline flash
  return;
}
```
The app has no toast system yet — simplest is a state variable `addedMsg` that auto-clears after 2s.

### Step 4 — Fix port-8000 error strings (Issue G)

Replace the three instances of `"make sure backend is running on port 8000"` with
`"make sure the backend server is running"`.

### Step 5 — Hybrid tooltip in Tax (Issue H)

In the Per-Fund table `Regime` column, add a `ℹ` tooltip next to `Slab` when `cat === 'Hybrid'`
explaining it is treated conservatively and the user can reclassify it.

### Step 6 — Dead variable cleanup (Issue I)

In `Dashboard.jsx`, delete line ~200: `const issueNo = Math.floor(...)`.

---

## How to Run the App

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Frontend proxies all `/api/*` to `localhost:8000` via Vite config — no CORS issues in dev.
