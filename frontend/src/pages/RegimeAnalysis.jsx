import { useState, useEffect } from 'react';
import { Activity, RefreshCw, TrendingUp, TrendingDown, Minus, Star, Shield, Zap } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, Legend,
} from 'recharts';
import { regimeAnalysis } from '../services/api';
import { usePortfolio } from '../hooks/usePortfolio';

const REGIME_CONFIG = {
  Bull:     { color: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.25)',  icon: TrendingUp,   label: 'Bull Market' },
  Bear:     { color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.25)', icon: TrendingDown, label: 'Bear Market' },
  Sideways: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.25)',  icon: Minus,        label: 'Sideways / Consolidation' },
};

function RegimeBadge({ regime, size = 'sm' }) {
  const cfg = REGIME_CONFIG[regime] || {};
  const Icon = cfg.icon || Activity;
  const pad = size === 'lg' ? '7px 16px' : '3px 10px';
  const fs  = size === 'lg' ? 12 : 10;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: pad, borderRadius: 99, fontSize: fs, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      <Icon size={size === 'lg' ? 13 : 10} />
      {cfg.label || regime}
    </span>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: '#0d1225', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 11 }}>
      <p style={{ color: 'var(--text-3)', marginBottom: 5 }}>{label}</p>
      <p style={{ color: REGIME_CONFIG[d?.regime]?.color || 'var(--text-1)', fontWeight: 700 }}>
        Regime: {d?.regime}
      </p>
      <p style={{ color: 'var(--text-2)', marginTop: 3 }}>
        60d Rolling Return: {d?.rolling_return?.toFixed(1)}%
      </p>
    </div>
  );
}

export default function RegimeAnalysis() {
  const portfolio = usePortfolio();
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [result, setResult]       = useState(null);

  async function run() {
    if (!portfolio.length) { setError('Add funds in Portfolio Builder first.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await regimeAnalysis({ funds: portfolio });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
      setResult(null);
    }
    setLoading(false);
  }

  // Auto-run on mount once portfolio is available
  useEffect(() => {
    if (portfolio.length > 0 && !result && !loading) { run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio.length]);

  const history    = result?.regime_history   || [];
  const stats      = result?.regime_stats     || {};
  const fundPerf   = result?.fund_performance || {};
  const highlights = result?.highlights       || {};
  const current    = result?.current_regime;

  // Build chart data with color
  const chartData = history.map(h => ({
    date:           h.date,
    regime:         h.regime,
    rolling_return: h.rolling_return,
    // Separate series per regime for coloured areas
    Bull:     h.regime === 'Bull'     ? h.rolling_return : null,
    Bear:     h.regime === 'Bear'     ? h.rolling_return : null,
    Sideways: h.regime === 'Sideways' ? h.rolling_return : null,
  }));

  // Fund performance table data
  const fundRows = Object.entries(fundPerf).map(([code, d]) => ({
    code,
    name:     d.name,
    bull:     d.Bull,
    bear:     d.Bear,
    sideways: d.Sideways,
    overall:  d.overall,
  }));

  // Bar chart for regime performance across funds
  const fundBarData = fundRows.map(r => ({
    name:     r.name.length > 18 ? r.name.slice(0, 18) + '…' : r.name,
    Bull:     r.bull     ?? 0,
    Bear:     r.bear     ?? 0,
    Sideways: r.sideways ?? 0,
  }));

  function pctColor(v) {
    if (v == null) return 'var(--text-3)';
    return v >= 0 ? 'var(--green)' : 'var(--red)';
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={22} style={{ color: 'var(--indigo)' }} />
            Market Regime Analysis
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            GMM-based regime detection on Nifty 50 · See how your funds perform in Bull, Bear &amp; Sideways markets
          </p>
        </div>
        <button onClick={run} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {loading
            ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spinRing 0.8s linear infinite' }} /> Detecting…</>
            : <><RefreshCw size={13} /> Detect Regimes</>}
        </button>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 18px', background: 'var(--red-bg)', borderColor: 'var(--red-border)' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Activity size={40} style={{ margin: '0 auto 14px', opacity: 0.2, display: 'block' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Click "Detect Regimes" to analyse market phases and fund performance.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 6 }}>
            Uses a Gaussian Mixture Model on 60-day rolling Nifty 50 returns.
          </p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Fetching Nifty 50 data and fitting GMM model…</p>
        </div>
      )}

      {result && !loading && (
        <>
          {/* ── Current Regime ── */}
          <div className="glass-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p className="label-upper" style={{ marginBottom: 8 }}>Current Market Regime</p>
                {current && <RegimeBadge regime={current} size="lg" />}
              </div>
              <div style={{ flex: 1 }} />
              {/* Regime Stats */}
              {['Bull', 'Bear', 'Sideways'].map(r => {
                const s   = stats[r] || {};
                const cfg = REGIME_CONFIG[r];
                return (
                  <div key={r} style={{ padding: '12px 18px', borderRadius: 11, background: cfg.bg, border: `1px solid ${cfg.border}`, minWidth: 120, textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: cfg.color, fontFamily: 'monospace' }}>{s.pct_time ?? 0}%</p>
                    <p style={{ fontSize: 10, fontWeight: 700, color: cfg.color, marginTop: 3 }}>{r} Market</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.count ?? 0} days</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Avg {s.avg_return?.toFixed(1) ?? '—'}% p.a.</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Regime History Chart ── */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Nifty 50 Regime History (60-day Rolling Return)</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18 }}>
              Each point is labelled Bull / Bear / Sideways by a Gaussian Mixture Model. ~{history.length} data points shown.
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.08)" />
                <XAxis dataKey="date" tick={{ fill: '#4a5580', fontSize: 10 }}
                  tickFormatter={v => v?.slice(0, 7)}
                  interval={Math.max(1, Math.floor(chartData.length / 10))}
                />
                <YAxis tick={{ fill: '#4a5580', fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Bull"     stroke="#34d399" fill="rgba(52,211,153,0.15)"  strokeWidth={1.5} connectNulls={false} dot={false} />
                <Area type="monotone" dataKey="Bear"     stroke="#f87171" fill="rgba(248,113,113,0.15)" strokeWidth={1.5} connectNulls={false} dot={false} />
                <Area type="monotone" dataKey="Sideways" stroke="#fbbf24" fill="rgba(251,191,36,0.12)"  strokeWidth={1.5} connectNulls={false} dot={false} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: REGIME_CONFIG[v]?.color }}>{v}</span>} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Highlights ── */}
          {highlights && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="goal-presets">
              {[
                { key: 'best_in_bull',    icon: Star,   label: 'Best in Bull Market',   color: '#34d399', bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.2)',  sub: 'Highest avg return in bull phases' },
                { key: 'best_in_bear',    icon: Shield, label: 'Best in Bear Market',   color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.2)', sub: 'Most resilient in downturns' },
                { key: 'most_consistent', icon: Zap,    label: 'Most Consistent',       color: '#818cf8', bg: 'rgba(99,102,241,0.07)',  border: 'rgba(99,102,241,0.2)',  sub: 'Lowest return variance across regimes' },
              ].map(h => {
                const data = highlights[h.key] || {};
                const Icon = h.icon;
                return (
                  <div key={h.key} style={{ padding: '16px 18px', borderRadius: 12, background: h.bg, border: `1px solid ${h.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Icon size={13} style={{ color: h.color }} />
                      <p style={{ fontSize: 11, fontWeight: 700, color: h.color }}>{h.label}</p>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 3 }}>
                      {data.fund || '—'}
                    </p>
                    {data.val !== undefined && (
                      <p style={{ fontSize: 12, fontFamily: 'monospace', color: h.color, fontWeight: 700 }}>
                        {h.key === 'most_consistent'
                          ? `σ = ${data.val?.toFixed(1)}%`
                          : `${data.val?.toFixed(1)}% p.a.`}
                      </p>
                    )}
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{h.sub}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Fund Performance Table ── */}
          {fundRows.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Fund Performance by Market Regime</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
                Annualised average return during each regime phase. Helps identify which funds outperform in different market conditions.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 580 }}>
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th style={{ color: '#34d399' }}>🐂 Bull</th>
                      <th style={{ color: '#f87171' }}>🐻 Bear</th>
                      <th style={{ color: '#fbbf24' }}>↔ Sideways</th>
                      <th>Overall CAGR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundRows.sort((a, b) => (b.overall || 0) - (a.overall || 0)).map((r, i) => (
                      <tr key={i}>
                        <td>
                          <p style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</p>
                        </td>
                        {['bull', 'bear', 'sideways'].map(k => (
                          <td key={k} style={{ fontFamily: 'monospace', fontWeight: 700, color: pctColor(r[k]) }}>
                            {r[k] != null ? `${r[k] > 0 ? '+' : ''}${r[k].toFixed(1)}%` : '—'}
                          </td>
                        ))}
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: pctColor(r.overall) }}>
                          {r.overall != null ? `${r.overall > 0 ? '+' : ''}${r.overall.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
                * Annualised from daily avg returns during each regime's dates. Benchmark: Nifty 50 (Nippon India Index Fund proxy).
              </p>
            </div>
          )}

          {/* ── Bar Chart ── */}
          {fundBarData.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Regime Return Comparison</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18 }}>Grouped bar chart — returns in each regime per fund</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={fundBarData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: '#4a5580', fontSize: 9 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fill: '#4a5580', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v, name) => [`${v?.toFixed(1)}%`, name]} contentStyle={{ background: '#0d1225', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }} />
                  <Legend formatter={v => <span style={{ fontSize: 11, color: REGIME_CONFIG[v]?.color }}>{v}</span>} />
                  <Bar dataKey="Bull"     fill="#34d399" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Bear"     fill="#f87171" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Sideways" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
