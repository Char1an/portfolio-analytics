import { useState, useEffect } from 'react';
import { Brain, Play, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronUp, HelpCircle, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { trainModels, predict, explainForecast } from '../services/api';
import { usePortfolio } from '../hooks/usePortfolio';

const ALGO_INFO = {
  linear_regression: {
    label: 'Linear Regression',
    emoji: '📐',
    complexity: 'Simple',
    desc: 'Fits a straight-line trend to historical NAV data. Fast to train, interpretable, but assumes a constant linear trend — misses non-linear patterns and volatility regimes.',
    best_for: 'Stable, trending markets with predictable growth',
    limitation: 'Cannot capture sudden rallies, crashes, or regime changes',
    color: '#60a5fa',
  },
  random_forest: {
    label: 'Random Forest',
    emoji: '🌲',
    complexity: 'Ensemble',
    desc: 'Builds hundreds of decision trees on different subsets of features (rolling averages, RSI, momentum) and averages their predictions. Robust to noise and overfitting.',
    best_for: 'General use — best balance of accuracy and robustness',
    limitation: 'Treats each prediction independently, less aware of sequential patterns',
    color: '#34d399',
  },
  gradient_boosting: {
    label: 'Gradient Boosting',
    emoji: '🚀',
    complexity: 'Ensemble',
    desc: 'Sequentially builds trees where each corrects errors of the previous. Usually achieves the highest accuracy but is slower to train and prone to overfitting on small datasets.',
    best_for: 'High-quality data with sufficient history (3+ years)',
    limitation: 'Slower training, needs careful tuning on short histories',
    color: '#a78bfa',
  },
};

const MODEL_LABELS = {
  linear_regression: 'Linear Regression',
  random_forest: 'Random Forest (Ensemble)',
  gradient_boosting: 'Gradient Boosting (Ensemble)',
};

const HORIZON_UNITS = ['days', 'months', 'years'];

export default function Forecast() {
  const portfolio                        = usePortfolio();
  const [activeFund, setActiveFund]     = useState(null);
  const [horizonVal, setHorizonVal]     = useState(30);
  const [horizonUnit, setHorizonUnit]   = useState('days');
  const [selectedModel, setSelectedModel] = useState('random_forest');
  const [loading, setLoading]           = useState(false);
  const [training, setTraining]         = useState(false);
  const [trainResult, setTrainResult]   = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [error, setError]               = useState(null);
  const [showAlgoInfo, setShowAlgoInfo] = useState(false);
  const [shapData, setShapData]         = useState(null);
  const [shapLoading, setShapLoading]   = useState(false);

  useEffect(() => {
    if (portfolio.length > 0 && !activeFund) {
      setActiveFund(portfolio[0]);
      autoLoad(portfolio[0]);
    }
  }, [portfolio, activeFund]);

  function horizonToDays() {
    if (horizonUnit === 'days')   return Math.max(1, horizonVal);
    if (horizonUnit === 'months') return Math.round(horizonVal * 30);
    if (horizonUnit === 'years')  return Math.round(horizonVal * 365);
    return 30;
  }

  async function autoLoad(fund) {
    setTraining(true);
    setError(null);
    try {
      const r = await trainModels({ scheme_code: fund.scheme_code, force_retrain: false });
      setTrainResult(r.data);
      const p = await predict({ scheme_code: fund.scheme_code, horizon_days: 30, model: 'random_forest' });
      setForecastData(p.data);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    setTraining(false);
  }

  async function handleTrain() {
    if (!activeFund) return;
    setTraining(true);
    setError(null);
    setForecastData(null);
    try {
      const r = await trainModels({ scheme_code: activeFund.scheme_code, force_retrain: true });
      setTrainResult(r.data);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    setTraining(false);
  }

  async function handlePredict() {
    if (!activeFund) return;
    setLoading(true);
    setError(null);
    setShapData(null);
    try {
      const r = await predict({ scheme_code: activeFund.scheme_code, horizon_days: horizonToDays(), model: selectedModel });
      setForecastData(r.data);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    setLoading(false);
  }

  async function handleExplain() {
    if (!activeFund) return;
    setShapLoading(true);
    setShapData(null);
    setError(null);
    try {
      const r = await explainForecast({ scheme_code: activeFund.scheme_code, model: selectedModel });
      setShapData(r.data);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    setShapLoading(false);
  }

  const chartData = forecastData?.forecast
    ? forecastData.forecast.dates.map((d, i) => ({
        date: d,
        prediction: forecastData.forecast.predictions[i],
        lower: forecastData.forecast.lower_bound[i],
        upper: forecastData.forecast.upper_bound[i],
      }))
    : [];

  const leaderboard = trainResult?.evaluation?.leaderboard || [];
  const predictedChange = chartData.length > 0 && forecastData?.last_actual_nav
    ? ((chartData[chartData.length - 1].prediction - forecastData.last_actual_nav) / forecastData.last_actual_nav * 100).toFixed(2)
    : null;

  const horizonLabel = horizonUnit === 'days'
    ? `${horizonVal}d`
    : horizonUnit === 'months'
    ? `${horizonVal}mo`
    : `${horizonVal}yr`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>ML NAV Forecasting</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Supervised machine learning trained on historical NAV time-series features
        </p>
      </div>

      {/* ── Disclaimer ── */}
      <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', gap: 10 }}>
        <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--red)' }}>SEBI Regulatory Notice — Not Investment Advice:</strong>{' '}
          ML NAV forecasts are experimental research tools only. They are <strong>not</strong> SEBI-registered research reports
          and must not be used to make investment or redemption decisions. NAV time-series data is highly autocorrelated —
          high R² scores are expected and do not imply true predictive power. Black swan events (regulatory changes,
          geopolitical shocks, liquidity crises) are unforeseeable by any model. Past performance is not indicative of future returns.
          Consult a SEBI Registered Investment Advisor (RIA) before investing.
        </div>
      </div>

      {/* ── Configuration ── */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={14} style={{ color: 'var(--indigo)' }} /> Configuration
        </h3>

        {/* Fund Selector — multi-select */}
        <div style={{ marginBottom: 20 }}>
          <p className="label-upper" style={{ marginBottom: 10 }}>Select Fund to Forecast</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {portfolio.map(f => {
              const isActive = activeFund?.scheme_code === f.scheme_code;
              const name = (f.name || '').replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim();
              return (
                <button key={f.scheme_code}
                  onClick={() => { setActiveFund(f); setForecastData(null); setTrainResult(null); setShapData(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    transition: 'all 0.16s',
                    background: isActive ? 'var(--grad)' : 'rgba(99,102,241,0.07)',
                    color: isActive ? '#fff' : 'var(--text-3)',
                    boxShadow: isActive ? '0 2px 10px rgba(99,102,241,0.35)' : 'none',
                  }}>
                  {name.split(' ').slice(0, 3).join(' ')}
                </button>
              );
            })}
          </div>
          {activeFund && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
              Selected: <strong style={{ color: 'var(--indigo)' }}>{activeFund.name}</strong> · Code: {activeFund.scheme_code}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'end' }}>
          {/* Horizon input */}
          <div>
            <p className="label-upper" style={{ marginBottom: 8 }}>Forecast Horizon</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="number" min={1} max={3650} className="input-field"
                value={horizonVal} onChange={e => setHorizonVal(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ flex: 1 }} />
              <select className="select-field" value={horizonUnit} onChange={e => setHorizonUnit(e.target.value)} style={{ width: 90 }}>
                {HORIZON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>= {horizonToDays()} calendar days (NAV data)</p>
          </div>

          {/* Horizon quick presets */}
          <div>
            <p className="label-upper" style={{ marginBottom: 8 }}>Quick Presets</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { l: '15d', v: 15, u: 'days' }, { l: '1mo', v: 1, u: 'months' },
                { l: '3mo', v: 3, u: 'months' }, { l: '6mo', v: 6, u: 'months' },
                { l: '1yr', v: 1, u: 'years' }, { l: '2yr', v: 2, u: 'years' },
              ].map(p => (
                <button key={p.l} onClick={() => { setHorizonVal(p.v); setHorizonUnit(p.u); }}
                  className="period-btn" style={{ fontSize: 10, padding: '4px 10px' }}>{p.l}</button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <p className="label-upper" style={{ marginBottom: 8 }}>Algorithm</p>
            <select className="select-field" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
              <option value="linear_regression">📐 Linear Regression</option>
              <option value="random_forest">🌲 Random Forest ⭐</option>
              <option value="gradient_boosting">🚀 Gradient Boosting</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleTrain} disabled={training || !activeFund} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
              {training ? <div style={{ width: 12, height: 12, border: '2px solid var(--indigo)', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} /> : <Brain size={12} />}
              {training ? 'Training…' : 'Re-train'}
            </button>
            <button onClick={handlePredict} disabled={loading || training || !activeFund} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
              {loading ? <div style={{ width: 12, height: 12, border: '2px solid white', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} /> : <Play size={12} />}
              Predict
            </button>
            <button onClick={handleExplain} disabled={shapLoading || loading || training || !activeFund} className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap', borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b' }}>
              {shapLoading ? <div style={{ width: 12, height: 12, border: '2px solid #f59e0b', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} /> : <Zap size={12} />}
              {shapLoading ? 'Explaining…' : 'Explain (SHAP)'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Algorithm Explainer ── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => setShowAlgoInfo(v => !v)}
          style={{
            width: '100%', padding: '14px 22px', background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpCircle size={14} style={{ color: 'var(--indigo)' }} /> What do these algorithms do?
          </span>
          {showAlgoInfo ? <ChevronUp size={14} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />}
        </button>
        {showAlgoInfo && (
          <div style={{ padding: '0 22px 22px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 16 }}>
            {Object.entries(ALGO_INFO).map(([key, a]) => (
              <div key={key} style={{ padding: '16px', borderRadius: 12, background: `${a.color}0d`, border: `1px solid ${a.color}25` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>{a.emoji}</span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</p>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                      background: `${a.color}18`, color: a.color, border: `1px solid ${a.color}28`,
                    }}>{a.complexity}</span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 10 }}>{a.desc}</p>
                <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.55 }}>
                  <p><strong style={{ color: 'var(--green)' }}>✓ Best for:</strong> {a.best_for}</p>
                  <p style={{ marginTop: 4 }}><strong style={{ color: 'var(--red)' }}>✗ Limitation:</strong> {a.limitation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {training && !trainResult && (
        <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--blue-bg)', border: '1px solid var(--blue-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 16, height: 16, border: '2px solid var(--blue)', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: 'var(--blue)' }}>Training models for <strong>{activeFund?.name}</strong>…</p>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid var(--red-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>
        </div>
      )}

      {/* ── Model Leaderboard ── */}
      {trainResult && (
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={14} style={{ color: 'var(--green)' }} /> Model Leaderboard — {activeFund?.name?.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Training Samples', val: trainResult.training_samples?.toLocaleString() },
              { label: 'Test Samples',     val: trainResult.test_samples?.toLocaleString() },
              { label: 'Features Used',    val: trainResult.features_used },
            ].map((k, i) => (
              <div key={i} style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <p className="label-upper" style={{ marginBottom: 6 }}>{k.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{k.val}</p>
              </div>
            ))}
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Rank</th><th>Algorithm</th><th>RMSE ↓</th><th>MAE ↓</th><th>MAPE ↓</th><th>R² ↑</th></tr>
            </thead>
            <tbody>
              {leaderboard.map((m, i) => {
                const a = ALGO_INFO[m.model];
                return (
                  <tr key={i} style={{ background: i === 0 ? 'rgba(99,102,241,0.04)' : undefined }}>
                    <td style={{ textAlign: 'left', fontSize: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</td>
                    <td style={{ textAlign: 'left' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{MODEL_LABELS[m.model] || m.model}</span>
                      {a && <span style={{ fontSize: 10, marginLeft: 6, color: a.color }}>{a.emoji}</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{m.rmse?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.mae?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.mape?.toFixed(2)}%</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>{m.r2_score?.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.6 }}>
            RMSE/MAE = error in ₹ · MAPE = % error · R² = variance explained (closer to 1 = better fit on test set){' '}
            <span style={{ color: '#f59e0b' }}>
              ⚠ NAV data is autocorrelated — R² near 1.0 is typical and does not mean the model can predict future price direction.
            </span>
          </p>
        </div>
      )}

      {/* ── Forecast Chart ── */}
      {chartData.length > 0 && (
        <div className="glass-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700 }}>
                {activeFund?.name?.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()} — {horizonLabel} Forecast
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                {ALGO_INFO[selectedModel]?.emoji} {MODEL_LABELS[selectedModel]} · Band: ±1.5σ of test residuals (~87% coverage, not 90%)
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-3)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 14, height: 2, background: 'var(--indigo)', display: 'inline-block', borderRadius: 1 }} /> Prediction
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 14, height: 10, background: 'rgba(99,102,241,0.18)', display: 'inline-block', borderRadius: 2 }} /> Confidence Band
              </span>
            </div>
          </div>
          <div style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={d => d?.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => `₹${v}`} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                  formatter={v => `₹${Number(v).toFixed(2)}`}
                />
                <Area type="monotone" dataKey="upper" stroke="none" fill="url(#ciGrad)" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="rgba(6,9,26,0)" />
                <Line type="monotone" dataKey="prediction" stroke="#6366f1" strokeWidth={2.5} dot={false} name="ML Forecast" />
                <Line type="monotone" dataKey="upper" stroke="rgba(99,102,241,0.3)" strokeDasharray="4 4" strokeWidth={1} dot={false} name="Upper Bound" />
                <Line type="monotone" dataKey="lower" stroke="rgba(99,102,241,0.3)" strokeDasharray="4 4" strokeWidth={1} dot={false} name="Lower Bound" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Forecast stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 18 }}>
            {[
              { label: 'Last Actual NAV', val: `₹${forecastData.last_actual_nav}`, color: 'var(--text-1)' },
              { label: `Predicted (${horizonLabel})`, val: `₹${chartData[chartData.length - 1]?.prediction?.toFixed(2)}`, color: 'var(--indigo)' },
              { label: 'Expected Change', val: `${predictedChange >= 0 ? '+' : ''}${predictedChange}%`, color: parseFloat(predictedChange) >= 0 ? 'var(--green)' : 'var(--red)' },
              { label: '±1.5σ Band (~87%)', val: `₹${chartData[chartData.length - 1]?.lower?.toFixed(0)} – ₹${chartData[chartData.length - 1]?.upper?.toFixed(0)}`, color: 'var(--text-2)' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <p className="label-upper" style={{ marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* CTA to Explain */}
          {!shapData && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleExplain} disabled={shapLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
                  color: '#f59e0b', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                }}>
                {shapLoading
                  ? <div style={{ width: 12, height: 12, border: '2px solid #f59e0b', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} />
                  : <Zap size={13} />
                }
                {shapLoading ? 'Generating SHAP explanation…' : 'Explain this Prediction with SHAP →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SHAP Explainability Panel ── */}
      {shapLoading && !shapData && (
        <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #f59e0b', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#f59e0b' }}>Computing SHAP values for <strong>{activeFund?.name}</strong>…</p>
        </div>
      )}

      {shapData && (
        <div className="glass-card" style={{ padding: 22 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={14} style={{ color: '#f59e0b' }} /> SHAP Explainability — Why did the model make this prediction?
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                {ALGO_INFO[shapData.model]?.emoji} {MODEL_LABELS[shapData.model] || shapData.model} ·{' '}
                SHAP baseline: ₹{shapData.waterfall?.baseline?.toFixed(2)} → predicted: ₹{shapData.waterfall?.predicted?.toFixed(2)}
              </p>
            </div>
            <button onClick={() => setShapData(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: '2px 6px', flexShrink: 0 }}>×</button>
          </div>

          {/* Narrative */}
          {shapData.narrative && (
            <div style={{
              padding: '14px 18px', borderRadius: 10, marginBottom: 22,
              background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(99,102,241,0.06) 100%)',
              border: '1px solid rgba(245,158,11,0.2)',
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.75, fontStyle: 'italic' }}>
                💬 {shapData.narrative}
              </p>
            </div>
          )}

          {/* Waterfall: Top Positive + Negative side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Bullish Signals */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#34d399', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={13} /> Bullish Signals — pushing NAV up
              </p>
              {(() => {
                const items = shapData.waterfall?.top_positive || [];
                const maxVal = Math.max(...items.map(x => Math.abs(x.shap_value)), 0.001);
                return items.length ? items.map((c, i) => {
                  const pct = Math.min(100, (Math.abs(c.shap_value) / maxVal) * 100);
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, paddingRight: 8 }}>{c.label}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#34d399', fontWeight: 700, flexShrink: 0 }}>
                          +₹{Math.abs(c.shap_value).toFixed(3)}
                        </span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'rgba(52,211,153,0.1)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, borderRadius: 4,
                          background: 'linear-gradient(90deg, #34d399 0%, #10b981 100%)',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  );
                }) : (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>No significant bullish signals found.</p>
                );
              })()}
            </div>

            {/* Bearish Signals */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingDown size={13} /> Bearish Signals — pushing NAV down
              </p>
              {(() => {
                const items = shapData.waterfall?.top_negative || [];
                const maxVal = Math.max(...items.map(x => Math.abs(x.shap_value)), 0.001);
                return items.length ? items.map((c, i) => {
                  const pct = Math.min(100, (Math.abs(c.shap_value) / maxVal) * 100);
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, paddingRight: 8 }}>{c.label}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#f87171', fontWeight: 700, flexShrink: 0 }}>
                          −₹{Math.abs(c.shap_value).toFixed(3)}
                        </span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'rgba(248,113,113,0.1)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, borderRadius: 4,
                          background: 'linear-gradient(90deg, #f87171 0%, #ef4444 100%)',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  );
                }) : (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>No significant bearish signals found.</p>
                );
              })()}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 22 }} />

          {/* Global Feature Importance */}
          {shapData.global_importance?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Info size={13} style={{ color: 'var(--indigo)' }} />
                Global Feature Importance — average SHAP impact across last 50 data points
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
                {shapData.global_importance.slice(0, 10).map((f, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, paddingRight: 8 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', marginRight: 5, fontFamily: 'monospace' }}>#{i + 1}</span>
                        {f.label}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--indigo)', fontWeight: 700, flexShrink: 0 }}>
                        {f.importance_pct}%
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(99,102,241,0.08)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.min(100, f.importance_pct * (100 / Math.max(...shapData.global_importance.slice(0, 10).map(x => x.importance_pct), 1)))}%`,
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${i < 3 ? '#818cf8' : i < 6 ? '#6366f1' : '#4f46e5'} 0%, #a5b4fc 100%)`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.65 }}>
                Mean |SHAP| measures how much each feature moves the prediction on average, regardless of direction.
                Features with higher % explain more of the model's decisions. Total features: {shapData.feature_count}.
              </p>
            </div>
          )}

          {/* Net SHAP sum sanity check */}
          {shapData.waterfall?.total_shap_sum !== undefined && (
            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 10, color: 'var(--text-3)' }}>
                Net SHAP Σ: <span style={{ fontFamily: 'monospace', color: 'var(--text-2)' }}>
                  {shapData.waterfall.total_shap_sum >= 0 ? '+' : ''}₹{shapData.waterfall.total_shap_sum?.toFixed(3)}
                </span>
                {' '}(sum of all feature contributions from baseline ₹{shapData.waterfall?.baseline?.toFixed(2)} → predicted ₹{shapData.waterfall?.predicted?.toFixed(2)})
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
