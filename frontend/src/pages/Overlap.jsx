import { useState, useEffect } from 'react';
import { Layers, RefreshCw, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { portfolioOverlap } from '../services/api';
import { usePortfolio } from '../hooks/usePortfolio';

/* ── Heatmap cell colour (blue→red gradient via white at 0) ── */
function corrColor(val) {
  if (val === null) return 'rgba(99,102,241,0.05)';
  const abs = Math.abs(val);
  if (abs >= 0.9) return `rgba(248,113,113,${0.55 + abs * 0.3})`;
  if (abs >= 0.75) return `rgba(251,146,60,${0.35 + abs * 0.25})`;
  if (abs >= 0.5)  return `rgba(251,191,36,${0.25 + abs * 0.2})`;
  return `rgba(52,211,153,${0.1 + abs * 0.15})`;
}

function textColorForCorr(val) {
  if (val === null) return 'var(--text-3)';
  return Math.abs(val) >= 0.6 ? '#fff' : 'var(--text-2)';
}

function severityConfig(sev) {
  if (sev === 'Very High') return { color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)' };
  return                          { color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' };
}

function ScoreArc({ score }) {
  const r = 42;
  const cx = 56, cy = 56;
  const circ = Math.PI * r;  // half circle
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#34d399' : score >= 45 ? '#fbbf24' : '#f87171';
  return (
    <svg width="112" height="70" style={{ display: 'block', margin: '0 auto' }}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth={8} strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={800} fill={color}>{score}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="#4a5580">/100</text>
    </svg>
  );
}

export default function Overlap() {
  const portfolio = usePortfolio();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [result, setResult]   = useState(null);

  async function run() {
    if (portfolio.length < 2) { setError('Add at least 2 funds in Portfolio Builder to analyse overlap.'); setResult(null); return; }
    setLoading(true); setError(null);
    try {
      const res = await portfolioOverlap({ funds: portfolio });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
      setResult(null);
    }
    setLoading(false);
  }

  // Auto-run on mount once portfolio is available
  useEffect(() => {
    if (portfolio.length >= 2 && !result && !loading) { run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio.length]);

  const matrix  = result?.correlation_matrix    || [];
  const labels  = result?.fund_labels           || [];
  const pairs   = result?.high_correlation_pairs || [];
  const score   = result?.diversification_score  ?? null;
  const avgCorr = result?.average_correlation    ?? null;
  const risk    = result?.concentration_risk;
  const interp  = result?.interpretation;
  const datapts = result?.data_points;

  const riskConfig = {
    Low:    { color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
    Medium: { color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
    High:   { color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)' },
  };
  const riskCfg = riskConfig[risk] || riskConfig.Medium;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={22} style={{ color: 'var(--indigo)' }} />
            Portfolio Overlap
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            NAV correlation matrix · Identify overlapping funds · Diversification score
          </p>
        </div>
        <button onClick={run} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {loading
            ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spinRing 0.8s linear infinite' }} /> Computing…</>
            : <><RefreshCw size={13} /> Compute Overlap</>}
        </button>
      </div>

      {/* ── Explainer ── */}
      <div className="glass-card" style={{ padding: '14px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--indigo)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={12} /> How Overlap is Measured
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 10, color: 'var(--text-2)' }} className="goal-presets">
          {[
            { range: '> 90%',   label: 'Nearly identical', color: 'var(--red)',   bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
            { range: '75–90%',  label: 'High overlap',     color: 'var(--amber)', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)' },
            { range: '50–75%',  label: 'Moderate overlap', color: 'var(--amber)', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)' },
            { range: '< 50%',   label: 'Good diversification', color: 'var(--green)', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
          ].map(c => (
            <div key={c.range} style={{ padding: '8px 12px', borderRadius: 8, background: c.bg, border: `1px solid ${c.border}` }}>
              <p style={{ fontFamily: 'monospace', fontWeight: 800, color: c.color, fontSize: 12 }}>{c.range}</p>
              <p style={{ marginTop: 3, color: 'var(--text-2)' }}>{c.label}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
          Pearson correlation of daily NAV returns on aligned common dates. High correlation means funds move almost in lockstep — holding both provides minimal diversification benefit.
        </p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 18px', background: 'var(--red-bg)', borderColor: 'var(--red-border)' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Layers size={40} style={{ margin: '0 auto 14px', opacity: 0.2, display: 'block' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Click "Compute Overlap" to see the correlation matrix and diversification score.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 6 }}>Requires at least 2 funds in your portfolio.</p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Aligning NAVs and computing pairwise correlations…</p>
        </div>
      )}

      {result && !loading && (
        <>
          {/* ── Score + Summary ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }} className="analytics-grid">

            {/* Diversification Score Arc */}
            <div className="glass-card" style={{ padding: '20px 16px', textAlign: 'center' }}>
              <p className="label-upper" style={{ marginBottom: 12 }}>Diversification Score</p>
              {score !== null && <ScoreArc score={score} />}
              <p style={{ fontSize: 11, marginTop: 10, fontWeight: 700,
                color: score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)'
              }}>
                {score >= 70 ? 'Excellent' : score >= 45 ? 'Moderate' : 'Poor'}
              </p>
              {risk && (
                <div style={{ marginTop: 10, display: 'inline-block', padding: '4px 12px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: riskCfg.bg, color: riskCfg.color, border: `1px solid ${riskCfg.border}` }}>
                  {risk} Concentration Risk
                </div>
              )}
            </div>

            {/* Interpretation + Stats */}
            <div className="glass-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <p className="label-upper" style={{ marginBottom: 10 }}>Analysis</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>{interp}</p>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Avg Correlation', val: avgCorr !== null ? `${avgCorr}%` : '—' },
                  { label: 'Funds Analysed',  val: labels.length },
                  { label: 'Data Points',     val: datapts ?? '—' },
                  { label: 'High-Overlap Pairs', val: pairs.length },
                ].map((s, i) => (
                  <div key={i}>
                    <p className="label-upper" style={{ marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{s.val}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── High-Overlap Warnings ── */}
          {pairs.length > 0 && (
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
                <AlertTriangle size={14} /> High-Overlap Fund Pairs ({pairs.length})
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
                Pairs with correlation &gt; 85% — consider replacing one to improve diversification
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pairs.map((p, i) => {
                  const cfg = severityConfig(p.severity);
                  return (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 11, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{p.fund_a}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>↔</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{p.fund_b}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: cfg.color }}>
                          {(p.correlation * 100).toFixed(1)}%
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {p.severity}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>{p.warning}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pairs.length === 0 && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--green-bg)', border: '1px solid var(--green-border)', display: 'flex', gap: 12 }}>
              <CheckCircle size={15} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.6 }}>
                <strong>No high-overlap pairs detected.</strong> No fund pair has correlation above 85% — your portfolio shows good diversification across your selected funds.
              </p>
            </div>
          )}

          {/* ── Correlation Heatmap ── */}
          {matrix.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Correlation Matrix</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18 }}>
                Pairwise Pearson correlation of daily NAV returns. Green = low, Yellow = moderate, Red = high overlap.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: '100%' }}>
                  {/* Header row */}
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', background: 'transparent', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, fontSize: 9, whiteSpace: 'nowrap' }} />
                      {labels.map((l, j) => (
                        <th key={j} style={{
                          padding: '6px 4px', color: 'var(--text-3)', fontWeight: 600, fontSize: 9,
                          textAlign: 'center', maxWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: 80, verticalAlign: 'bottom',
                        }}>
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, i) => (
                      <tr key={i}>
                        <td style={{
                          padding: '4px 10px', fontWeight: 600, fontSize: 9, color: 'var(--text-2)',
                          whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {labels[i]}
                        </td>
                        {row.map((val, j) => {
                          const isDiag = i === j;
                          const display = isDiag ? '—' : val !== null ? val.toFixed(2) : '?';
                          return (
                            <td key={j} title={isDiag ? labels[i] : `${labels[i]} × ${labels[j]}: ${val?.toFixed(3)}`} style={{
                              padding: '6px 8px', textAlign: 'center', borderRadius: 6,
                              background: isDiag ? 'rgba(99,102,241,0.12)' : corrColor(val),
                              color: isDiag ? 'var(--indigo)' : textColorForCorr(val),
                              fontFamily: 'monospace', fontWeight: isDiag ? 700 : 600,
                              minWidth: 52, fontSize: 10,
                              border: '2px solid rgba(6,10,30,0.5)',
                            }}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginRight: 6 }}>Legend:</p>
                {[
                  { bg: 'rgba(52,211,153,0.25)',  label: '< 0.50 Low' },
                  { bg: 'rgba(251,191,36,0.3)',   label: '0.50–0.75 Moderate' },
                  { bg: 'rgba(251,146,60,0.45)',  label: '0.75–0.90 High' },
                  { bg: 'rgba(248,113,113,0.65)', label: '> 0.90 Very High' },
                ].map((l, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--text-2)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: l.bg, display: 'inline-block' }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
