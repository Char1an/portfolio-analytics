import { useState, useEffect } from 'react';
import { FlaskConical, RefreshCw, Info, TrendingUp, CheckCircle, AlertTriangle } from 'lucide-react';
import { usePortfolio } from '../hooks/usePortfolio';
import api from '../services/api';

/* ── Helpers ── */
function fmtPct(n, decimals = 1) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}
function fmtN(n, decimals = 2) {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

function tStatColor(t) {
  const abs = Math.abs(t);
  if (abs >= 2.0)  return 'var(--green)';
  if (abs >= 1.5)  return 'var(--amber)';
  return 'var(--text-3)';
}

/* ── Factor contribution bar ── */
function ContribBar({ label, value, total, color }) {
  // `total` is the sum of absolute contribution values — avoids divide-by-near-zero
  // when the fund's net return is close to 0 or negative.
  const pct = total > 0 ? (Math.abs(value) / total) * 100 : 0;
  const clamp = Math.min(pct, 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: value >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {fmtPct(value)}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(99,102,241,0.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${clamp}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ── Single fund attribution card ── */
function FundAttribution({ result }) {
  if (result.error) {
    return (
      <div className="glass-card" style={{ padding: '14px 18px', borderColor: 'var(--red-border)' }}>
        <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {result.fund_name}: {result.error}</p>
      </div>
    );
  }

  const fc    = result.factor_contributions || {};
  const total = result.fund_avg_annual_return_pct || 0;
  const alpha = result.alpha_annual_pct;
  const r2    = result.r_squared;
  const alphaColor = alpha >= 0 ? 'var(--green)' : 'var(--red)';

  const contributions = [
    { label: 'Market Beta (Nifty 50)',    value: fc.market_pct, color: '#818cf8' },
    { label: 'Size Factor — SMB',          value: fc.smb_pct,    color: '#38bdf8' },
    { label: 'Midcap Factor — MMB',        value: fc.mmb_pct,    color: '#a78bfa' },
    { label: 'Alpha (Manager Skill)',       value: fc.alpha_pct,  color: alpha >= 0 ? '#34d399' : '#f87171' },
    { label: 'Risk-Free Rate',             value: fc.rf_pct,     color: '#4a5580' },
  ];

  return (
    <div className="glass-card" style={{ padding: '20px 22px' }}>
      {/* Fund name + alpha badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{result.fund_name}</h3>
          {result.expense_ratio && (
            <span
              title={result.ter_source === 'auto' ? 'Auto-detected from AMFI database' : 'Manually entered'}
              style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,118,53,0.1)', color: 'var(--indigo)', border: '1px solid rgba(139,118,53,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              TER {result.expense_ratio?.toFixed(2)}%
              {result.ter_source === 'auto' && <span style={{ fontSize: 8, opacity: 0.7 }}>· AUTO</span>}
            </span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>ANNUAL ALPHA</p>
          <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: alphaColor, lineHeight: 1 }}>
            {fmtPct(alpha)}
          </p>
          <p style={{ fontSize: 9, color: result.alpha_significant ? 'var(--green)' : 'var(--amber)', marginTop: 3 }}>
            {result.alpha_significant ? '● Statistically significant' : '○ Not significant'}
            {' '}(t={fmtN(result.t_stat_alpha, 1)})
          </p>
        </div>
      </div>

      {/* Interpretation paragraph */}
      <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)', marginBottom: 18 }}>
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>{result.interpretation}</p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="analytics-grid">
        {/* Contribution breakdown bars */}
        <div>
          <p className="label-upper" style={{ marginBottom: 12 }}>Return Decomposition ({fmtPct(total)} avg/year)</p>
          {contributions.map((c, i) => (
            <ContribBar key={i} label={c.label} value={c.value} total={contributions.reduce((s, x) => s + Math.abs(x.value ?? 0), 0)} color={c.color} />
          ))}
        </div>

        {/* Regression stats */}
        <div>
          <p className="label-upper" style={{ marginBottom: 12 }}>Regression Statistics ({result.n_months} months)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Market Beta (β_mkt)', val: fmtN(result.beta_market), t: result.t_stat_market, note: 'Exposure to Nifty 50 moves' },
              { label: 'Size Loading (β_smb)', val: fmtN(result.beta_smb), t: result.t_stat_smb, note: '+ = small-cap tilt, − = large-cap' },
              { label: 'Mid Loading (β_mmb)', val: fmtN(result.beta_mmb), t: result.t_stat_mmb, note: '+ = mid-cap tilt, − = large-cap' },
              { label: 'Model R²', val: fmtN(r2), t: null, note: '% of variance explained by factors' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.08)' }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{s.label}</p>
                  <p style={{ fontSize: 9, color: 'var(--text-3)' }}>{s.note}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)' }}>{s.val}</p>
                  {s.t != null && (
                    <p style={{ fontSize: 9, color: tStatColor(s.t), fontWeight: 600 }}>t={fmtN(s.t, 1)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Expense ratio vs alpha verdict */}
          {result.expense_ratio != null && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 9,
              background: (result.alpha_annual_pct - result.expense_ratio) > 0.5 ? 'var(--green-bg)' : 'var(--red-bg)',
              border: `1px solid ${(result.alpha_annual_pct - result.expense_ratio) > 0.5 ? 'var(--green-border)' : 'var(--red-border)'}`,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: (result.alpha_annual_pct - result.expense_ratio) > 0.5 ? 'var(--green)' : 'var(--red)' }}>
                {(result.alpha_annual_pct - result.expense_ratio) > 0.5
                  ? `✓ Alpha (${fmtPct(result.alpha_annual_pct)}) > TER (${result.expense_ratio?.toFixed(2)}%) — manager adds net value`
                  : `✗ Alpha (${fmtPct(result.alpha_annual_pct)}) ≤ TER (${result.expense_ratio?.toFixed(2)}%) — passive index may outperform`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function FactorAttribution() {
  const portfolio                    = usePortfolio();
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [result, setResult]         = useState(null);
  const [expenseRatios, setExpenseRatios] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function run() {
    if (!portfolio.length) { setError('Add at least 1 fund in Portfolio Builder.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await api.post('/analytics/factor-attribution', {
        funds: portfolio,
        expense_ratios: Object.keys(expenseRatios).length > 0 ? expenseRatios : null,
      });
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

  const attributions = result?.fund_attributions || [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <FlaskConical size={22} style={{ color: 'var(--indigo)' }} />
            Factor Attribution
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            Fama-French 3-factor model · Market beta · Size (SMB) · Midcap (MMB) · True alpha
          </p>
        </div>
        <button onClick={run} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {loading
            ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spinRing 0.8s linear infinite' }} /> Computing…</>
            : <><RefreshCw size={13} /> Run Attribution</>}
        </button>
      </div>

      {/* ── Explainer ── */}
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--indigo)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={12} /> How Factor Attribution Works
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
          A fund's return is decomposed into: <strong>Risk-free rate</strong> (money you'd earn in a G-sec) +
          <strong> Market premium</strong> (return for taking market risk, scaled by β) +
          <strong> Size premium</strong> (small-cap tilt return) +
          <strong> Midcap premium</strong> + <strong>Alpha</strong> (genuine manager skill — the only part you're paying active fees for).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }} className="goal-presets">
          {[
            { label: 'Factor Proxy',      val: 'Index Fund NAV', note: 'No synthetic data — real returns' },
            { label: 'Market Factor',     val: 'Nifty 50',       note: 'Nippon India Index Fund' },
            { label: 'Size Factor (SMB)', val: 'SC250 − Nifty',  note: 'SBI Nifty Smallcap 250' },
            { label: 'Mid Factor (MMB)',  val: 'MC150 − Nifty',  note: 'SBI Nifty Midcap 150' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--indigo)', marginBottom: 3 }}>{s.label}</p>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-1)' }}>{s.val}</p>
              <p style={{ fontSize: 9, color: 'var(--text-3)' }}>{s.note}</p>
            </div>
          ))}
        </div>

        {/* Auto-detected TER notice */}
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(74,124,89,0.06)', border: '1px solid rgba(74,124,89,0.15)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 14, marginTop: -1 }}>{result ? '✓' : 'ℹ'}</span>
          <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {result
              ? <strong style={{ color: 'var(--green)' }}>Expense ratios auto-filled. </strong>
              : <strong>Expense ratios will be auto-detected from AMFI when you run. </strong>
            }
            {result
              ? "Matched against AMFI's TER database — each fund card shows whether alpha justifies the fee."
              : "Each fund card will show whether the manager's alpha justifies the TER."
            }
            <button
              onClick={() => setShowAdvanced(v => !v)}
              style={{ background: 'none', border: 'none', color: 'var(--indigo)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 6, textDecoration: 'underline' }}>
              {showAdvanced ? 'Hide override' : 'Override manually'}
            </button>
          </p>
        </div>

        {/* Manual override (collapsed by default) */}
        {showAdvanced && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
              Override the auto-detected TER for any fund. Leave blank to use the auto value.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {portfolio.map(f => {
                const detected = result?.fund_attributions?.find(r => r.scheme_code === f.scheme_code)?.expense_ratio;
                return (
                  <div key={f.scheme_code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || f.scheme_code}</span>
                    <input
                      type="number"
                      placeholder={detected != null ? `auto (${detected.toFixed(2)}%)` : 'auto'}
                      min="0" max="5" step="0.01"
                      value={expenseRatios[f.scheme_code] || ''}
                      onChange={e => setExpenseRatios(prev => ({
                        ...prev,
                        [f.scheme_code]: e.target.value ? parseFloat(e.target.value) : undefined,
                      }))}
                      className="input-field"
                      style={{ width: 100, padding: '4px 8px', fontSize: 11 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="glass-card" style={{ padding: '12px 18px', background: 'var(--red-bg)', borderColor: 'var(--red-border)' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !loading && !error && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <FlaskConical size={40} style={{ margin: '0 auto 14px', opacity: 0.2, display: 'block' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
            Click "Run Attribution" to decompose each fund's returns into factors and alpha.
          </p>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 6 }}>
            Requires 12+ months of NAV data per fund. Factor proxies are fetched automatically.
          </p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Fetching factor NAVs and running OLS regressions…</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && !loading && (
        <>
          {/* Factor proxies strip */}
          {result.factor_proxies && (
            <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.08)', fontSize: 10, color: 'var(--text-3)' }}>
              <span style={{ fontWeight: 700, color: 'var(--indigo)' }}>Factor proxies used: </span>
              {Object.entries(result.factor_proxies).map(([k, v]) => (
                <span key={k} style={{ marginRight: 16 }}><strong>{k}:</strong> {v}</span>
              ))}
            </div>
          )}

          {/* Alpha leaderboard */}
          {attributions.filter(r => !r.error).length > 1 && (
            <div className="glass-card" style={{ padding: '18px 22px' }}>
              <p className="label-upper" style={{ marginBottom: 12 }}>Alpha Leaderboard</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...attributions]
                  .filter(r => !r.error && r.alpha_annual_pct != null)
                  .sort((a, b) => (b.alpha_annual_pct || 0) - (a.alpha_annual_pct || 0))
                  .map((r, i) => {
                    const alpha = r.alpha_annual_pct;
                    const color = alpha >= 0 ? 'var(--green)' : 'var(--red)';
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.04)' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', width: 20, textAlign: 'right' }}>#{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fund_name}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color }}>
                          {fmtPct(alpha)}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: r.alpha_significant ? 'var(--green-bg)' : 'rgba(99,102,241,0.08)', color: r.alpha_significant ? 'var(--green)' : 'var(--text-3)', border: r.alpha_significant ? '1px solid var(--green-border)' : '1px solid rgba(99,102,241,0.15)' }}>
                          {r.alpha_significant ? 'Significant' : 'Not sig.'}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--indigo)', minWidth: 50, textAlign: 'right' }}>
                          R²={fmtN(r.r_squared)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Per-fund cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {attributions.map((r, i) => <FundAttribution key={i} result={r} />)}
          </div>
        </>
      )}
    </div>
  );
}
