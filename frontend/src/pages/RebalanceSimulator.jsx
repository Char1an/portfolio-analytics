/**
 * RebalanceSimulator.jsx — Drag weight sliders, see the portfolio metrics update live.
 * Uses existing /analytics/optimize + /analytics/health-score + /analytics/risk endpoints.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sliders, RotateCcw, ArrowRight, TrendingUp, Percent, Shield, Award, Info } from 'lucide-react';
import { analyzeRisk, getHealthScore } from '../services/api';
import { usePortfolio } from '../hooks/usePortfolio';
import { formatCurrency, formatPercent } from '../utils/formatters';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#22d3ee', '#a78bfa', '#f472b6', '#facc15'];

// Debounce helper
function useDebounced(value, ms = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function RebalanceSimulator() {
  const portfolio = usePortfolio();

  // Initial weights from portfolio's current invested amounts
  const initialWeights = useMemo(() => {
    const total = portfolio.reduce((s, f) => s + ((f.investment_amount || 0) + (f.monthly_sip || 0) * 12), 0) || 1;
    const m = {};
    portfolio.forEach(f => {
      m[f.scheme_code] = ((f.investment_amount || 0) + (f.monthly_sip || 0) * 12) / total * 100;
    });
    return m;
  }, [portfolio]);

  const [weights, setWeights] = useState(initialWeights);
  const [locked, setLocked]   = useState({});   // scheme_code -> bool
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const debouncedWeights = useDebounced(weights, 500);
  const lastKeyRef = useRef('');

  // Reset weights ONLY when the portfolio's COMPOSITION changes
  // (funds added/removed), not on every portfolio-updated event —
  // which fires from hydration, other tabs, etc. and would silently
  // wipe the user's in-progress slider edits and lock toggles.
  const compositionKey = useMemo(
    () => portfolio.map(f => f.scheme_code).sort().join(','),
    [portfolio]
  );
  const lastCompositionRef = useRef(compositionKey);
  useEffect(() => {
    if (compositionKey !== lastCompositionRef.current) {
      lastCompositionRef.current = compositionKey;
      setWeights(initialWeights);
      setLocked({});
    }
  }, [compositionKey, initialWeights]);

  // Compute total portfolio value (invested + annualised SIP)
  const totalValue = useMemo(() => {
    return portfolio.reduce((s, f) => s + ((f.investment_amount || 0) + (f.monthly_sip || 0) * 12), 0);
  }, [portfolio]);

  // Handle slider change — redistribute the delta to unlocked funds
  function updateWeight(code, newVal) {
    setWeights(prev => {
      const clamped = Math.max(0, Math.min(100, newVal));
      const delta = clamped - (prev[code] || 0);
      if (Math.abs(delta) < 0.01) return prev;

      // Redistribute -delta across unlocked, non-target funds proportionally
      const others = portfolio.filter(f => f.scheme_code !== code && !locked[f.scheme_code]);
      const othersTotal = others.reduce((s, f) => s + (prev[f.scheme_code] || 0), 0);

      const next = { ...prev, [code]: clamped };
      if (othersTotal > 0 && others.length > 0) {
        others.forEach(f => {
          const share = (prev[f.scheme_code] || 0) / othersTotal;
          next[f.scheme_code] = Math.max(0, (prev[f.scheme_code] || 0) - delta * share);
        });
      }
      return next;
    });
  }

  function resetToCurrent() {
    setWeights(initialWeights);
    setLocked({});
  }

  function equalWeight() {
    const w = 100 / portfolio.length;
    const m = {};
    portfolio.forEach(f => { m[f.scheme_code] = w; });
    setWeights(m);
  }

  // Re-fetch metrics whenever debounced weights change
  useEffect(() => {
    if (portfolio.length < 2) return;
    const key = JSON.stringify(debouncedWeights);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    // Build a synthetic portfolio using target weights × totalValue
    const funds = portfolio.map(f => ({
      scheme_code:       f.scheme_code,
      name:              f.name,
      category:          f.category,
      investment_amount: ((debouncedWeights[f.scheme_code] || 0) / 100) * totalValue,
      monthly_sip:       0,
      purchase_date:     f.purchase_date,
      plan_type:         f.plan_type,
    }));

    setLoading(true);
    Promise.all([
      analyzeRisk({ funds }),
      getHealthScore({ funds }),
    ]).then(([risk, health]) => {
      setMetrics({ risk: risk.data, health: health.data });
    }).catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, [debouncedWeights, portfolio, totalValue]);

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const normalized = Math.abs(total - 100) < 0.5;

  // Build the rebalance plan (buy/sell per fund)
  const plan = portfolio.map(f => {
    const curVal = (f.investment_amount || 0) + (f.monthly_sip || 0) * 12;
    const targetVal = ((weights[f.scheme_code] || 0) / 100) * totalValue;
    const delta = targetVal - curVal;
    return { fund: f, current: curVal, target: targetVal, delta };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Current + rebalanced health scores
  const curHealth  = null; // Would show via a second API call if desired
  const newHealth  = metrics?.health?.overall;
  const newRisk    = metrics?.risk?.portfolio_risk?.sharpe_ratio;
  const newVol     = metrics?.risk?.portfolio_risk?.volatility_pct;

  // ── Empty state ──
  if (portfolio.length < 2) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 18px',
            background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sliders size={28} style={{ color: 'var(--indigo)', opacity: 0.6 }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Need at least 2 funds to rebalance</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20, lineHeight: 1.55 }}>
            Add 2+ funds in Portfolio Builder — then drag the weight sliders here to see how the risk and health score change in real time.
          </p>
          <a href="/portfolio" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Go to Portfolio Builder
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={22} style={{ color: 'var(--indigo)' }} />
            Rebalance Simulator
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            Drag the sliders — the Sharpe, volatility, and Health Score update live. Model any allocation before you actually rebalance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={equalWeight} className="btn-secondary" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Percent size={12} /> Equal-weight all
          </button>
          <button onClick={resetToCurrent} className="btn-secondary" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={12} /> Reset to current
          </button>
        </div>
      </div>

      {/* Weights sum warning */}
      {!normalized && (
        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8 }}>
          <p style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={12} /> Total is {total.toFixed(1)}% — auto-redistributing to sum to 100. Lock a fund with the 🔒 button to freeze its weight while others adjust.
          </p>
        </div>
      )}

      {/* ── Main grid: sliders on left, metrics on right ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {/* Sliders */}
        <div className="glass-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700 }}>Target Allocation</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Sum: <strong style={{ color: normalized ? 'var(--green)' : '#f59e0b', fontFamily: 'monospace' }}>{total.toFixed(1)}%</strong></p>
          </div>
          {portfolio.map((f, i) => {
            const w = weights[f.scheme_code] || 0;
            const c = COLORS[i % COLORS.length];
            return (
              <div key={f.scheme_code} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}
                    </p>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
                      {f.category}
                    </span>
                  </div>
                  <button
                    onClick={() => setLocked(prev => ({ ...prev, [f.scheme_code]: !prev[f.scheme_code] }))}
                    title={locked[f.scheme_code] ? 'Locked — click to unlock' : 'Click to lock this weight'}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: locked[f.scheme_code] ? '#f59e0b' : 'var(--text-3)',
                    }}>
                    {locked[f.scheme_code] ? '🔒' : '🔓'}
                  </button>
                  <div style={{
                    minWidth: 60, textAlign: 'right', padding: '3px 8px', borderRadius: 6,
                    background: `${c}18`, border: `1px solid ${c}40`,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: c }}>{w.toFixed(1)}%</span>
                  </div>
                </div>
                <input
                  type="range" min={0} max={100} step={0.5} value={w}
                  onChange={e => updateWeight(f.scheme_code, Number(e.target.value))}
                  disabled={locked[f.scheme_code]}
                  style={{
                    width: '100%',
                    accentColor: c,
                    cursor: locked[f.scheme_code] ? 'not-allowed' : 'pointer',
                    opacity: locked[f.scheme_code] ? 0.5 : 1,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                    Current: {(initialWeights[f.scheme_code] || 0).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 9, color: w !== (initialWeights[f.scheme_code] || 0) ? c : 'var(--text-3)' }}>
                    Δ {w >= (initialWeights[f.scheme_code] || 0) ? '+' : ''}{(w - (initialWeights[f.scheme_code] || 0)).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live metrics */}
        <div className="glass-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700 }}>Simulated Metrics</h3>
            {loading && <div style={{ width: 12, height: 12, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} />}
          </div>

          {/* Health Score */}
          <div style={{
            padding: 14, borderRadius: 10,
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)',
          }}>
            <p className="label-upper" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={11} /> Portfolio Health Score
            </p>
            {newHealth != null ? (
              <>
                <p style={{ fontSize: 30, fontWeight: 800, fontFamily: 'monospace',
                  color: newHealth >= 80 ? 'var(--green)' : newHealth >= 60 ? '#22d3ee' : newHealth >= 40 ? '#f59e0b' : 'var(--red)',
                  letterSpacing: '-0.02em', lineHeight: 1,
                }}>{newHealth} <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>/ 100</span></p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Grade {metrics?.health?.grade} · {metrics?.health?.tone}</p>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{loading ? 'Computing…' : 'Move a slider to preview'}</p>
            )}
          </div>

          {/* Risk metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label-upper" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={10} /> Sharpe
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: newRisk != null ? (newRisk > 1 ? 'var(--green)' : newRisk > 0.5 ? '#f59e0b' : 'var(--red)') : 'var(--text-3)' }}>
                {newRisk != null ? newRisk.toFixed(2) : '—'}
              </p>
            </div>
            <div>
              <p className="label-upper" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Shield size={10} /> Volatility
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: newVol != null ? (newVol < 15 ? 'var(--green)' : newVol < 22 ? '#f59e0b' : 'var(--red)') : 'var(--text-3)' }}>
                {newVol != null ? `${newVol.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>

          {metrics?.health?.recommendations?.length > 0 && (
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <p className="label-upper" style={{ marginBottom: 4 }}>Auto-recommendations</p>
              <ul style={{ paddingLeft: 14, margin: 0 }}>
                {metrics.health.recommendations.slice(0, 3).map((r, i) => (
                  <li key={i} style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.4, marginBottom: 3 }}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Rebalance Plan Table ── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Rebalance Plan</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              To hit the target allocation, execute the following buys and sells.
            </p>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Total portfolio value: <strong style={{ color: 'var(--text-1)', fontFamily: 'monospace' }}>{formatCurrency(totalValue)}</strong></p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left',  padding: '10px 22px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fund</th>
              <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</th>
              <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}></th>
              <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target</th>
              <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((row, i) => {
              const isBuy  = row.delta > 100;
              const isSell = row.delta < -100;
              const isHold = !isBuy && !isSell;
              return (
                <tr key={row.fund.scheme_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px 22px' }}>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>
                      {(row.fund.name || row.fund.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}
                    </p>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1 }}>{row.fund.category}</p>
                  </td>
                  <td style={{ padding: '12px 22px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)' }}>{formatCurrency(row.current)}</td>
                  <td style={{ padding: '12px 22px', textAlign: 'center', color: 'var(--text-3)' }}><ArrowRight size={12} /></td>
                  <td style={{ padding: '12px 22px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{formatCurrency(row.target)}</td>
                  <td style={{ padding: '12px 22px', textAlign: 'right' }}>
                    {isBuy && <span style={{ padding: '3px 10px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: 'var(--green)', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>+ BUY {formatCurrency(row.delta)}</span>}
                    {isSell && <span style={{ padding: '3px 10px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--red)',   fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>− SELL {formatCurrency(Math.abs(row.delta))}</span>}
                    {isHold && <span style={{ padding: '3px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>HOLD</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Warning about tax + exit load */}
      <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 8 }}>
        <p style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: '#f59e0b' }} />
          <span>
            <strong>Before actually rebalancing:</strong> sells trigger STCG (20%) or LTCG (12.5%) tax on gains, and most funds charge a 1% exit load if held &lt;12 months. Check the Tax page for your specific liability before executing.
          </span>
        </p>
      </div>
    </div>
  );
}
