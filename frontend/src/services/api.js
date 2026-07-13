import axios from 'axios';

// In dev, Vite proxies /api → http://localhost:8000 (see vite.config.js).
// In prod, set VITE_API_URL to your deployed backend, e.g. https://folio-klarity-api.onrender.com/api
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth token to every request when available
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Pending-request tracker (powers the "server waking up" banner) ──
// Render's free tier sleeps after 15 min idle; first request after that
// takes 30-50s. We surface that instead of leaving the user staring at
// a blank spinner wondering if the site is broken.
let pendingCount = 0;
const listeners = new Set();
function notify() { listeners.forEach(fn => fn(pendingCount)); }

export function subscribePendingRequests(fn) {
  listeners.add(fn);
  fn(pendingCount);
  return () => listeners.delete(fn);
}

api.interceptors.request.use(config => {
  pendingCount++; notify();
  return config;
});
api.interceptors.response.use(
  res => { pendingCount = Math.max(0, pendingCount - 1); notify(); return res; },
  err => { pendingCount = Math.max(0, pendingCount - 1); notify(); return Promise.reject(err); }
);

// ── Auth / User ──
export const registerUser          = (data)      => api.post('/user/register',   data);
export const loginUser             = (data)      => api.post('/user/login',      data);
export const getMe                 = ()          => api.get('/user/me');
export const savePortfolioServer   = (portfolio) => api.put('/user/portfolio',   { portfolio });

// ── Data ──
export const searchFunds     = (query)          => api.get(`/data/search?q=${encodeURIComponent(query)}`);
export const getSchemes      = (category)       => api.get(`/data/schemes${category ? `?category=${encodeURIComponent(category)}` : ''}`);
export const getNavHistory = (code, period, startDate, endDate) => {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const qs = params.toString();
  return api.get(`/data/nav/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`);
};
export const getNavStats     = (code)           => api.get(`/data/nav/${encodeURIComponent(code)}/stats`);
export const getFundReturns  = (code)           => api.get(`/data/nav/${encodeURIComponent(code)}/returns`);
export const getIndexHistory = (ticker, period) => api.get(`/data/index/${encodeURIComponent(ticker)}${period ? `?period=${period}` : ''}`);

// ── Analytics ──
export const analyzePerformance  = (data) => api.post('/analytics/performance',       data);
export const analyzeRisk         = (data) => api.post('/analytics/risk',              data);
export const getPortfolioMetrics = (data) => api.post('/analytics/portfolio-metrics', data);
export const optimizePortfolio   = (data) => api.post('/analytics/optimize',          data);
export const getEfficientFrontier= (data) => api.post('/analytics/efficient-frontier',data);
export const compareFunds        = (data) => api.post('/analytics/compare',           data);
export const getHealthScore      = (data) => api.post('/analytics/health-score',      data);
export const getHistoricalSnapshot = (data) => api.post('/analytics/historical-snapshot', data);

// ── Forecast ──
export const trainModels   = (data) => api.post('/forecast/train',         data);
export const predict       = (data) => api.post('/forecast/predict',       data);
export const compareModels = (data) => api.post('/forecast/compare-models',data);
export const getModelInfo  = (code) => api.get(`/forecast/models/${encodeURIComponent(code)}`);
export const getTrainStatus   = (code) => api.get(`/forecast/train-status/${encodeURIComponent(code)}`);
export const explainForecast  = (data) => api.post('/forecast/explain',           data);

// ── Simulation ──
export const getScenarios   = ()     => api.get('/simulation/scenarios');
export const runScenario    = (data) => api.post('/simulation/scenario',            data);
export const runMonteCarlo  = (data) => api.post('/simulation/montecarlo',          data);
export const runPortfolioMC = (data) => api.post('/simulation/portfolio-montecarlo',data);

// ── Advanced Analytics ──
export const taxHarvest       = (data) => api.post('/analytics/tax-harvest', data);
export const regimeAnalysis   = (data) => api.post('/analytics/regime',      data);
export const portfolioOverlap = (data) => api.post('/analytics/overlap',     data);

// ── Behavioral & Factor Analytics ──
export const factorAttribution   = (data) => api.post('/analytics/factor-attribution', data);

// ── Insights ──
export const generateInsights = (data) => api.post('/insights/generate', data);

// ── AI Agent ──
export const agentChat   = (data) => api.post('/agent/chat',   data, { timeout: 120000 });
export const agentStatus = ()     => api.get('/agent/status');

export default api;
