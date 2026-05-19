import { useState } from 'react';
import { Settings2, Play, AlertTriangle, Info } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, ReferenceDot } from 'recharts';
import { optimizePortfolio, getEfficientFrontier } from '../services/api';
import { formatPercent, CHART_COLORS } from '../utils/formatters';
import { usePortfolio } from '../hooks/usePortfolio';

export default function Optimizer() {
  const portfolio = usePortfolio();
  const [target, setTarget] = useState('max_sharpe');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [frontier, setFrontier] = useState(null);
  const [error, setError] = useState(null);

  async function handleOptimize() {
    setLoading(true);
    setError(null);
    const funds = portfolio;
    try {
      const [optResp, frontResp] = await Promise.all([
        optimizePortfolio({ funds, target }),
        getEfficientFrontier({ funds }),
      ]);
      setResult(optResp.data);
      setFrontier(frontResp.data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Optimization failed. Please retry or check the backend.';
      setError(msg);
    }
    setLoading(false);
  }

  const frontierPoints = frontier?.frontier_points?.map(p => ({
    risk: p.volatility_pct, ret: p.return_pct, sharpe: p.sharpe_ratio,
  })) || [];

  const weightData = result ? Object.entries(result.optimal_weights).map(([code, w]) => ({
    name: result.fund_names?.[code] || code,
    optimal: parseFloat((w * 100).toFixed(1)),
    current: result.current_portfolio ? parseFloat((result.current_portfolio.weights?.[code] * 100 || 0).toFixed(1)) : 0,
  })) : [];

  const optPoint = result ? [{ risk: result.expected_volatility_pct, ret: result.expected_return_pct }] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Portfolio Optimizer</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Modern Portfolio Theory — find your optimal allocation on the efficient frontier</p>
      </div>

      {/* Warnings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f59e0b' }}>Tax Consequence Warning:</strong>{' '}
            Rebalancing to the optimal allocation may trigger STCG (20%) or LTCG (12.5%) taxes on gains from funds you reduce or exit.
            Factor in your holding period and tax liability before rebalancing. Consult a SEBI RIA for personalised advice.
          </p>
        </div>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--red)' }}>Exit Load Warning:</strong>{' '}
            Most equity mutual funds charge a 1% exit load on redemptions within 12 months. Rebalancing within the lock-in window will reduce your actual return.
            Check each fund's exit load schedule before executing any rebalance.
          </p>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
              Look-Back Bias Warning — 3-Year Data Window
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 24 }}>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>
              This optimizer uses <strong style={{ color: 'var(--text-1)' }}>3 years of NAV data</strong>. The 2021–2024 window captures almost exclusively the post-COVID bull run,
              during which Nifty rallied ~120% and small/mid caps outperformed dramatically.
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>
              <strong style={{ color: '#f59e0b' }}>Consequence:</strong> The "optimal" portfolio from this period will
              systematically over-allocate to small/mid caps and growth funds — which performed well in this window —
              and underweight large caps and defensives. This is the <em>opposite</em> of what sound risk-adjusted
              allocation would suggest over a full market cycle that includes corrections.
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text-1)' }}>How to use this responsibly:</strong> Treat the output as
              a <em>sensitivity analysis</em> — a data point, not a directive. Cross-reference with at least a 7–10 year
              historical window (use the dedicated Tax or Analytics pages) and your own risk tolerance before any
              rebalancing decision. Mean-Variance optimisation is highly sensitive to the historical period chosen.
            </p>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10, paddingLeft: 24 }}>
            Method: scipy quadratic programming on daily NAV returns · Annualised using 252 trading days · rf = 6.5% G-Sec
          </p>
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-end gap-4">
          <div>
            <label className="text-[10px] text-gray-500 uppercase font-semibold">Optimization Target</label>
            <select className="select-field mt-1 w-56" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="max_sharpe">Maximum Sharpe Ratio</option>
              <option value="min_volatility">Minimum Volatility</option>
            </select>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
              {target === 'max_sharpe' ? 'Best return per unit of risk taken' : 'Lowest possible portfolio swings'}
            </p>
          </div>
          <button onClick={handleOptimize} disabled={loading} className="btn-primary flex items-center gap-2 text-xs">
            {loading ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Play size={12} />}
            {loading ? 'Optimizing...' : 'Optimize Portfolio'}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 text-sm font-semibold">Optimization Failed</p>
              <p className="text-gray-400 text-xs mt-1">{error}</p>
              <p className="text-gray-500 text-[10px] mt-2">Make sure the backend server is running and your portfolio has at least 2 funds with available NAV data.</p>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center border-dashed border-2 border-[var(--color-border)]">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
            <Settings2 size={28} className="text-indigo-400 opacity-60" />
          </div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Efficient Frontier Not Yet Computed</h3>
          <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
            Click <strong className="text-indigo-400">Optimize Portfolio</strong> to run Modern Portfolio Theory optimization
            and visualize the efficient frontier — the set of all portfolios with maximum return for a given risk level.
          </p>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-600">
            <AlertTriangle size={12} />
            Uses 3Y NAV — read the look-back bias warning above before acting on results
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="kpi-card">
              <p className="label-upper" style={{ marginBottom: 6 }}>Hist. Avg Return (Ann.)</p>
              <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--green)' }}>{formatPercent(result.expected_return_pct)}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>3-year historical average</p>
            </div>
            <div className="kpi-card">
              <p className="label-upper" style={{ marginBottom: 6 }}>Portfolio Volatility</p>
              <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#f59e0b' }}>{result.expected_volatility_pct}%</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Annualised std deviation</p>
            </div>
            <div className="kpi-card">
              <p className="label-upper" style={{ marginBottom: 6 }}>Sharpe Ratio</p>
              <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--indigo)' }}>{Number(result.sharpe_ratio).toFixed(2)}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Risk-adjusted return (rf=6%)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Efficient Frontier — curve of all attainable portfolios with the optimal point highlighted */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-1">Efficient Frontier</h3>
              <p className="text-[10px] text-gray-500 mb-4">Each dot = a possible portfolio. ⭐ = your optimal point.</p>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                    <XAxis dataKey="risk" name="Risk (%)" tick={{ fill: '#5a5a6e', fontSize: 10 }} label={{ value: 'Risk (Volatility %)', position: 'insideBottom', offset: -3, fill: '#5a5a6e', fontSize: 10 }} />
                    <YAxis dataKey="ret" name="Return (%)" tick={{ fill: '#5a5a6e', fontSize: 10 }} label={{ value: 'Return %', angle: -90, position: 'insideLeft', fill: '#5a5a6e', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }}
                      formatter={(v, n) => [`${v}%`, n]} cursor={{ strokeDasharray: '3 3' }}
                    />
                    {/* Frontier curve */}
                    <Scatter data={frontierPoints} fill="#6366f1" fillOpacity={0.5} r={3} name="Frontier" />
                    {/* Optimal point */}
                    <Scatter data={optPoint} fill="#22c55e" r={10} name="⭐ Optimal" shape="star" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Current vs Optimal Weights */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-4">Current vs Optimal Weights</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weightData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                    <XAxis type="number" tick={{ fill: '#5a5a6e', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#8b8b9e', fontSize: 10 }} width={120} />
                    <Tooltip contentStyle={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }} formatter={v => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#8b8b9e' }} />
                    <Bar dataKey="current" name="Current" fill="rgba(99,102,241,0.3)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="optimal" name="Optimal" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {result.current_portfolio && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-4">Current vs Optimal — Comparison</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 uppercase tracking-wide border-b border-[var(--color-border)]">
                  <th className="text-left pb-3">Metric</th><th className="text-right pb-3">Current</th><th className="text-right pb-3">Optimal</th><th className="text-right pb-3">Improvement</th>
                </tr></thead>
                <tbody>
                  {[
                    { m: 'Hist. Avg Return', c: result.current_portfolio.expected_return_pct, o: result.expected_return_pct, fmt: v => formatPercent(v), better: 'higher' },
                    { m: 'Volatility', c: result.current_portfolio.expected_volatility_pct, o: result.expected_volatility_pct, fmt: v => `${v}%`, better: 'lower' },
                    { m: 'Sharpe Ratio', c: result.current_portfolio.sharpe_ratio, o: result.sharpe_ratio, fmt: v => Number(v).toFixed(2), better: 'higher' },
                  ].map((r, i) => {
                    const improved = r.better === 'higher' ? r.o > r.c : r.o < r.c;
                    const delta = r.better === 'lower' ? r.c - r.o : r.o - r.c;
                    return (
                      <tr key={i} className="border-b border-[var(--color-border)]">
                        <td className="py-3 text-gray-200 font-medium">{r.m}</td>
                        <td className="py-3 text-right font-mono text-gray-400">{r.fmt(r.c)}</td>
                        <td className="py-3 text-right font-mono text-indigo-400 font-semibold">{r.fmt(r.o)}</td>
                        <td className={`py-3 text-right font-mono font-semibold ${improved ? 'text-green-400' : 'text-red-400'}`}>
                          {improved ? '+' : '-'}{Math.abs(delta).toFixed(2)}{r.m.includes('Ratio') ? '' : '%'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
