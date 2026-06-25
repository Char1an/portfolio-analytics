/**
 * FundCompare.jsx — Side-by-side fund comparison with real numbers.
 * Beats Groww's version by:
 *   - All return windows (1m/3m/6m/1y/3y/5y/since inception) filled with real values
 *   - Risk metrics Groww doesn't show: Sharpe, Sortino, Max DD, recovery days
 *   - Correlation matrix between selected funds (unique to us)
 *   - Risk-return scatter plot
 *   - Auto-generated verdict per fund
 *   - Up to 4 funds (Groww allows 3)
 */
import { useState, useEffect, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Label, ReferenceLine,
} from 'recharts';
import { GitCompare, Plus, X, Search, AlertTriangle, Award, TrendingUp, Trophy, Info } from 'lucide-react';
import { compareFunds, getSchemes } from '../services/api';
import { usePortfolio } from '../hooks/usePortfolio';
import { formatPercent } from '../utils/formatters';

const MAX_FUNDS = 4;
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899'];

// ── Cell helper for the comparison grid ──
function Cell({ value, decimals = 1, unit = '%', good = 'higher', best = false }) {
  if (value == null || isNaN(value)) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const display = unit === '%' ? formatPercent(value, decimals) : `${value.toFixed(decimals)}${unit}`;
  return (
    <span style={{
      fontFamily: 'monospace', fontWeight: best ? 800 : 600,
      color: best ? (good === 'higher' ? 'var(--green)' : '#22d3ee') : (value < 0 ? 'var(--red)' : 'var(--text-1)'),
    }}>
      {display}{best && <span style={{ fontSize: 9, marginLeft: 3 }}>★</span>}
    </span>
  );
}

// ── Row in the comparison table ──
function CompareRow({ label, values, decimals, unit, good = 'higher', tooltip }) {
  // figure out best value for highlighting
  const numeric = values.map(v => (v == null || isNaN(v)) ? null : v);
  const valid = numeric.filter(v => v != null);
  let best = null;
  if (valid.length > 1) {
    best = good === 'higher' ? Math.max(...valid) : Math.min(...valid);
  }
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontSize: 11, fontWeight: 600 }} title={tooltip}>
        {label}{tooltip && <Info size={10} style={{ marginLeft: 4, opacity: 0.4 }} />}
      </td>
      {values.map((v, i) => (
        <td key={i} style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12 }}>
          <Cell value={v} decimals={decimals} unit={unit} good={good} best={best !== null && v === best} />
        </td>
      ))}
    </tr>
  );
}

// ── Search modal for adding funds ──
function FundSearch({ onPick, onClose, exclude = [] }) {
  const [query, setQuery] = useState('');
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSchemes(null).then(r => setSchemes(r.data?.schemes || [])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => schemes
    .filter(s => !exclude.includes(s.code))
    .filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30), [schemes, query, exclude]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-card" style={{
        width: 560, maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
      }}>
        <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input autoFocus placeholder="Search funds…" value={query} onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 14 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading schemes…</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No matches.</p>
          ) : filtered.map(s => (
            <div key={s.code} onClick={() => onPick(s)} style={{
              padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
            }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
               onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{s.name}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.category} · {s.house || ''}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──
export default function FundCompare() {
  const portfolio = usePortfolio();
  const [funds, setFunds] = useState([]);            // [{ scheme_code, name, category }]
  const [showSearch, setShowSearch] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-seed from portfolio if empty
  useEffect(() => {
    if (funds.length === 0 && portfolio.length > 0) {
      setFunds(portfolio.slice(0, Math.min(3, MAX_FUNDS)).map(f => ({
        scheme_code: f.scheme_code, name: f.name, category: f.category,
      })));
    }
  }, [portfolio.length]); // eslint-disable-line

  // Re-fetch comparison whenever the funds list changes
  useEffect(() => {
    if (funds.length < 2) { setData(null); return; }
    setLoading(true);
    setError(null);
    compareFunds({ funds })
      .then(r => setData(r.data))
      .catch(e => { setError(e.response?.data?.detail || e.message); setData(null); })
      .finally(() => setLoading(false));
  }, [funds]);

  function addFund(s) {
    setFunds(prev => [...prev, { scheme_code: s.code, name: s.name, category: s.category }]);
    setShowSearch(false);
  }
  function removeFund(code) {
    setFunds(prev => prev.filter(f => f.scheme_code !== code));
  }

  // Build scatter data
  const scatter = (data?.funds || []).map((f, i) => ({
    name: f.name,
    risk: f.risk?.volatility_pct || 0,
    ret: f.returns?.['3y'] ?? f.returns?.['1y'] ?? 0,
    sharpe: f.risk?.sharpe_ratio || 0,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitCompare size={22} style={{ color: 'var(--indigo)' }} />
          Compare Funds
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Side-by-side comparison with real numbers — returns, risk, correlation, and a verdict. Up to {MAX_FUNDS} funds.
        </p>
      </div>

      {/* Fund chips */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {funds.map((f, i) => (
            <div key={f.scheme_code} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              background: `${COLORS[i % COLORS.length]}18`, border: `1px solid ${COLORS[i % COLORS.length]}50`,
              borderRadius: 10,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{(f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}</p>
                <p style={{ fontSize: 9, color: 'var(--text-3)' }}>{f.category}</p>
              </div>
              <button onClick={() => removeFund(f.scheme_code)} aria-label="Remove fund"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
                <X size={12} />
              </button>
            </div>
          ))}
          {funds.length < MAX_FUNDS && (
            <button onClick={() => setShowSearch(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'rgba(99,102,241,0.10)', border: '1px dashed rgba(99,102,241,0.4)',
              borderRadius: 10, color: 'var(--indigo)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              <Plus size={12} /> Add a fund
            </button>
          )}
        </div>
        {funds.length < 2 && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={11} /> Add at least 2 funds to compare. Pick from your portfolio or search.
          </p>
        )}
      </div>

      {showSearch && <FundSearch onPick={addFund} onClose={() => setShowSearch(false)} exclude={funds.map(f => f.scheme_code)} />}

      {/* Loading / Error */}
      {loading && (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Computing comparison…</p>
        </div>
      )}
      {error && (
        <div className="glass-card" style={{ padding: 16, border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> {error}
          </p>
        </div>
      )}

      {/* Comparison Data */}
      {data?.funds?.length >= 2 && (
        <>
          {/* Verdicts */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={14} style={{ color: '#f59e0b' }} /> Verdict
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.funds.length}, 1fr)`, gap: 10 }}>
              {data.funds.map((f, i) => (
                <div key={f.scheme_code} style={{
                  padding: 14, borderRadius: 10,
                  background: `${COLORS[i % COLORS.length]}10`, border: `1px solid ${COLORS[i % COLORS.length]}30`,
                }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {f.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().slice(0, 28)}
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: COLORS[i % COLORS.length], lineHeight: 1.4 }}>{f.verdict}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Fund Details Table */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>Side-by-Side Comparison</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 220 }}>Metric</th>
                    {data.funds.map((f, i) => (
                      <th key={f.scheme_code} style={{ textAlign: 'right', padding: '12px 14px', fontSize: 11, fontWeight: 700, color: COLORS[i % COLORS.length] }}>
                        {f.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().split(' ').slice(0, 4).join(' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Fund Details */}
                  <tr><td colSpan={data.funds.length + 1} style={{ padding: '14px 14px 6px', fontSize: 10, color: 'var(--indigo)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(99,102,241,0.04)' }}>Fund Details</td></tr>
                  <CompareRow label="Latest NAV" values={data.funds.map(f => f.latest_nav)} decimals={2} unit="" />
                  <CompareRow label="Category" values={data.funds.map(f => f.category)} decimals={0} unit="" />
                  <CompareRow label="Inception Date" values={data.funds.map(f => f.inception)} decimals={0} unit="" />
                  <CompareRow label="Years of History" values={data.funds.map(f => f.years_history)} decimals={1} unit="y" good="higher" />

                  {/* Returns */}
                  <tr><td colSpan={data.funds.length + 1} style={{ padding: '14px 14px 6px', fontSize: 10, color: 'var(--green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(34,197,94,0.04)' }}>Returns</td></tr>
                  <CompareRow label="1 Month" values={data.funds.map(f => f.returns?.['1m'])} decimals={2} good="higher" />
                  <CompareRow label="3 Months" values={data.funds.map(f => f.returns?.['3m'])} decimals={2} good="higher" />
                  <CompareRow label="6 Months" values={data.funds.map(f => f.returns?.['6m'])} decimals={2} good="higher" />
                  <CompareRow label="1 Year (CAGR)" values={data.funds.map(f => f.returns?.['1y'])} decimals={2} good="higher" />
                  <CompareRow label="3 Year (CAGR)" values={data.funds.map(f => f.returns?.['3y'])} decimals={2} good="higher" />
                  <CompareRow label="5 Year (CAGR)" values={data.funds.map(f => f.returns?.['5y'])} decimals={2} good="higher" />
                  <CompareRow label="Since Inception (CAGR)" values={data.funds.map(f => f.returns?.inception)} decimals={2} good="higher" />

                  {/* Risk */}
                  <tr><td colSpan={data.funds.length + 1} style={{ padding: '14px 14px 6px', fontSize: 10, color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(245,158,11,0.04)' }}>Risk Metrics (Groww doesn't show these)</td></tr>
                  <CompareRow label="Volatility (annualised)" values={data.funds.map(f => f.risk?.volatility_pct)} decimals={2} good="lower" tooltip="Standard deviation of returns. Lower = more stable." />
                  <CompareRow label="Max Drawdown" values={data.funds.map(f => f.risk?.max_drawdown_pct)} decimals={2} good="lower" tooltip="Worst peak-to-trough loss. Lower = milder downturns." />
                  <CompareRow label="Recovery Days" values={data.funds.map(f => f.risk?.recovery_days)} decimals={0} unit="d" good="lower" tooltip="Days to recover from max drawdown. Fewer = faster bounce-back." />
                  <CompareRow label="Sharpe Ratio" values={data.funds.map(f => f.risk?.sharpe_ratio)} decimals={2} unit="" good="higher" tooltip="Return per unit of risk. >1 good, >2 excellent." />
                  <CompareRow label="Sortino Ratio" values={data.funds.map(f => f.risk?.sortino_ratio)} decimals={2} unit="" good="higher" tooltip="Like Sharpe but only penalises downside volatility." />
                  <CompareRow label="Risk Score (0-10)" values={data.funds.map(f => f.risk?.risk_score)} decimals={1} unit="/10" good="lower" tooltip="Composite risk score. Lower = safer." />

                  {/* Best/Worst Year */}
                  <tr><td colSpan={data.funds.length + 1} style={{ padding: '14px 14px 6px', fontSize: 10, color: 'var(--text-2)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(255,255,255,0.02)' }}>Calendar Year Extremes</td></tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>Best Year</td>
                    {data.funds.map(f => (
                      <td key={f.scheme_code} style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>
                        {f.best_year ? `${formatPercent(f.best_year.return_pct)} (${f.best_year.year})` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>Worst Year</td>
                    {data.funds.map(f => (
                      <td key={f.scheme_code} style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: 'var(--red)', fontWeight: 700 }}>
                        {f.worst_year ? `${formatPercent(f.worst_year.return_pct)} (${f.worst_year.year})` : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Correlation matrix */}
          {Object.keys(data.correlation || {}).length >= 2 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={14} style={{ color: 'var(--indigo)' }} /> Correlation Matrix
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
                Weekly return correlation. <strong>Lower = better diversification.</strong> 1.0 means the funds move identically; 0 = independent; negative = move opposite.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
                  <thead>
                    <tr>
                      <th></th>
                      {data.funds.map((f, i) => (
                        <th key={f.scheme_code} style={{ padding: 6, fontSize: 10, color: COLORS[i % COLORS.length], fontWeight: 700, transform: 'rotate(-30deg)', minWidth: 80, textAlign: 'left' }}>
                          {f.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().split(' ').slice(0, 2).join(' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.funds.map((rowFund, ri) => (
                      <tr key={rowFund.scheme_code}>
                        <td style={{ padding: 6, fontSize: 10, color: COLORS[ri % COLORS.length], fontWeight: 700, textAlign: 'right', minWidth: 100 }}>
                          {rowFund.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().split(' ').slice(0, 2).join(' ')}
                        </td>
                        {data.funds.map(colFund => {
                          const v = data.correlation[rowFund.scheme_code]?.[colFund.scheme_code];
                          // Heat: red = high (bad), green = low (good)
                          let bg = 'rgba(255,255,255,0.04)';
                          if (v != null) {
                            const intensity = Math.abs(v);
                            if (rowFund.scheme_code === colFund.scheme_code) bg = 'rgba(255,255,255,0.06)';
                            else if (v > 0.85) bg = `rgba(239,68,68,${0.18 + intensity * 0.3})`;
                            else if (v > 0.6)  bg = `rgba(251,191,36,${0.12 + intensity * 0.25})`;
                            else if (v > 0.3)  bg = `rgba(34,197,94,${0.10 + intensity * 0.2})`;
                            else                bg = `rgba(34,211,238,${0.10 + intensity * 0.2})`;
                          }
                          return (
                            <td key={colFund.scheme_code} style={{
                              padding: '10px 12px', textAlign: 'center', borderRadius: 6,
                              background: bg, fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                              color: 'var(--text-1)', minWidth: 70,
                            }}>
                              {v != null ? v.toFixed(2) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(34,211,238,0.4)', borderRadius: 2, marginRight: 4 }} /> 0.0–0.3 Excellent diversification</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(34,197,94,0.4)',  borderRadius: 2, marginRight: 4 }} /> 0.3–0.6 Good</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(251,191,36,0.4)', borderRadius: 2, marginRight: 4 }} /> 0.6–0.85 Overlap</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(239,68,68,0.4)',  borderRadius: 2, marginRight: 4 }} /> &gt;0.85 Redundant</span>
              </p>
            </div>
          )}

          {/* Risk-Return Scatter */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={14} style={{ color: 'var(--green)' }} /> Risk vs Return
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
              Top-left = best (high return, low risk). Bottom-right = worst (low return, high risk).
            </p>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                  <XAxis type="number" dataKey="risk" name="Risk (Volatility %)" tick={{ fill: '#5a5a6e', fontSize: 10 }}>
                    <Label value="Risk (Volatility %)" position="bottom" offset={-10} fill="#5a5a6e" fontSize={11} />
                  </XAxis>
                  <YAxis type="number" dataKey="ret" name="Return (3Y % p.a.)" tick={{ fill: '#5a5a6e', fontSize: 10 }}>
                    <Label value="Return (3Y % p.a.)" angle={-90} position="insideLeft" fill="#5a5a6e" fontSize={11} />
                  </YAxis>
                  <ZAxis type="number" range={[200, 200]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div style={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: 10, fontSize: 11 }}>
                          <p style={{ color: 'var(--text-1)', fontWeight: 700 }}>{p.name.slice(0, 36)}</p>
                          <p style={{ color: 'var(--text-2)', marginTop: 3 }}>Risk: {p.risk.toFixed(1)}%</p>
                          <p style={{ color: 'var(--text-2)' }}>Return: {p.ret.toFixed(1)}%</p>
                          <p style={{ color: 'var(--indigo)', marginTop: 3 }}>Sharpe: {p.sharpe.toFixed(2)}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatter}>
                    {scatter.map((entry, i) => <circle key={i} r={9} fill={entry.fill} fillOpacity={0.8} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
              {scatter.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.fill }} />
                  {s.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().split(' ').slice(0, 4).join(' ')}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
