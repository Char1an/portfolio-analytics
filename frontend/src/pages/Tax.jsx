import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Receipt, TrendingUp, TrendingDown, Info, AlertTriangle, CheckCircle,
  Calculator, RefreshCw, Scissors, Clock,
} from 'lucide-react';
import { analyzePerformance, taxHarvest } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { usePortfolio } from '../hooks/usePortfolio';

/* ── Budget 2024 Indian MF Tax Rules ──────────────────────────
   Equity / Equity-oriented (>65% equity):
     STCG (held < 1 year): 20% flat
     LTCG (held ≥ 1 year): 12.5% on gains above ₹1,25,000 — exemption is
       applied ONCE across the ENTIRE portfolio's LTCG, not per fund.

   Debt / Gold / International (non-equity):
     Taxed at income slab rate regardless of holding period

   All tax liabilities include 4% Health & Education Cess.
   Surcharge may apply on LTCG if total income > ₹50L.
─────────────────────────────────────────────────────────────── */

const EQUITY_CATS = ['Large Cap','Large & Mid Cap','Mid Cap','Small Cap','Flexi Cap','ELSS','Index','Thematic'];

function taxRegime(category) {
  if (EQUITY_CATS.includes(category)) return 'equity';
  return 'non-equity';
}

function holdingYears(purchaseDate) {
  if (!purchaseDate) return null;
  const ms = Date.now() - new Date(purchaseDate).getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

function holdingLabel(yrs) {
  if (yrs === null) return '—';
  const y = Math.floor(yrs);
  const m = Math.round((yrs - y) * 12);
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}yr`;
  return `${y}yr ${m}mo`;
}

function computePortfolioTax(perfFunds, portfolioFunds, slabRate, whatIfYears, useWhatIf) {
  const enriched = perfFunds.map((f) => {
    const pf = portfolioFunds.find(p => String(p.scheme_code) === String(f.scheme_code)) || {};
    const cat = pf.category || 'Unknown';
    const rawGain = (typeof f.gain === 'number')
      ? f.gain
      : (f.current_value || 0) - (f.total_invested || 0);
    const gain = Math.max(0, rawGain);
    const hYrs = useWhatIf ? whatIfYears : holdingYears(pf.purchase_date);
    const effectiveHYrs = hYrs ?? 0;
    const regime = taxRegime(cat);
    let fundRegime;
    if (regime === 'equity') {
      fundRegime = effectiveHYrs >= 1 ? 'LTCG' : 'STCG';
    } else {
      fundRegime = 'Slab';
    }
    return { ...f, cat, gain, hYrs, effectiveHYrs, regime, fundRegime };
  });

  const totalLTCGGain = enriched
    .filter(f => f.fundRegime === 'LTCG')
    .reduce((s, f) => s + f.gain, 0);
  const ltcgExemption = Math.min(125000, totalLTCGGain);
  const totalTaxableLTCG = Math.max(0, totalLTCGGain - ltcgExemption);

  return enriched.map(f => {
    if (f.gain <= 0) {
      return { ...f, taxableGain: 0, baseTax: 0, cess: 0, taxLiability: 0 };
    }
    let baseTax = 0, taxableGain = 0;
    if (f.fundRegime === 'LTCG') {
      const share = totalLTCGGain > 0 ? f.gain / totalLTCGGain : 0;
      taxableGain = totalTaxableLTCG * share;
      baseTax = taxableGain * 0.125;
    } else if (f.fundRegime === 'STCG') {
      taxableGain = f.gain;
      baseTax = f.gain * 0.20;
    } else {
      taxableGain = f.gain;
      baseTax = f.gain * (slabRate / 100);
    }
    const cess = baseTax * 0.04;
    const taxLiability = Math.round(baseTax + cess);
    return { ...f, taxableGain: Math.round(taxableGain), baseTax: Math.round(baseTax), cess: Math.round(cess), taxLiability };
  });
}

const SLAB_OPTIONS = [
  { label: '0%',            value: 0  },
  { label: '5%',            value: 5  },
  { label: '20%',           value: 20 },
  { label: '30% (Highest)', value: 30 },
];

function Pill({ label, color, bg, border }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
      background: bg, color, border: `1px solid ${border}`,
    }}>{label}</span>
  );
}

function regimeColors(r) {
  if (r === 'STCG') return { color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)'   };
  return               { color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' };
}

/* ════════════════════════════════════════════════════════════
   TAX CALCULATOR TAB
════════════════════════════════════════════════════════════ */
function TaxCalculator({ portfolio }) {
  const [perfData, setPerfData]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [slabRate, setSlabRate]       = useState(30);
  const [useWhatIf, setUseWhatIf]     = useState(false);
  const [whatIfYears, setWhatIfYears] = useState(3);
  const [redeemAmount, setRedeemAmount] = useState('');

  const fetchPerf = useCallback(async () => {
    if (!portfolio.length) return;
    setLoading(true); setError(null);
    try {
      const r = await analyzePerformance({ funds: portfolio, mode: 'sip' });
      setPerfData(r.data);
    } catch (e) { setError(e?.message || 'Failed to load performance data'); }
    setLoading(false);
  }, [portfolio]);

  useEffect(() => { fetchPerf(); }, [fetchPerf]);

  const perfFunds    = perfData?.funds || [];
  const taxBreakdown = useMemo(() =>
    computePortfolioTax(perfFunds, portfolio, slabRate, whatIfYears, useWhatIf),
    [perfFunds, portfolio, slabRate, whatIfYears, useWhatIf]
  );

  const totals = useMemo(() => ({
    invested: taxBreakdown.reduce((s, t) => s + (t.total_invested || 0), 0),
    current:  taxBreakdown.reduce((s, t) => s + (t.current_value  || 0), 0),
    gain:     taxBreakdown.reduce((s, t) => s + (t.gain || 0), 0),
    tax:      taxBreakdown.reduce((s, t) => s + (t.taxLiability || 0), 0),
    cess:     taxBreakdown.reduce((s, t) => s + (t.cess || 0), 0),
    postTax:  taxBreakdown.reduce((s, t) => s + ((t.current_value || 0) - (t.taxLiability || 0)), 0),
  }), [taxBreakdown]);

  const totalLTCGGain    = taxBreakdown.filter(t => t.fundRegime === 'LTCG').reduce((s, t) => s + (t.gain || 0), 0);
  const ltcgExemptionUsed = Math.min(125000, totalLTCGGain);

  const partialRedeem  = parseFloat(redeemAmount) || 0;
  const blendedGainPct = totals.current > 0 ? totals.gain / totals.current : 0;
  const partialGain    = partialRedeem * blendedGainPct;
  const blendedTaxRate = totals.gain > 0 ? totals.tax / totals.gain : 0;
  const partialTax     = partialGain * blendedTaxRate;

  const hasMissingDates = portfolio.some(f => !f.purchase_date);

  return (
    <div className="space-y-5">
      {/* Refresh button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={fetchPerf} disabled={loading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? 'Recomputing…' : 'Recompute taxes'}
        </button>
      </div>

      {/* Tax Rule Banner */}
      <div className="glass-card" style={{ padding: '18px 22px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={13} /> 🇮🇳 Indian MF Tax Rules — Budget 2024 (FY 2024-25)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="goal-presets">
          {[
            { title: 'Equity STCG',       sub: 'Held < 1 year',       rule: '20% flat on gains + 4% cess',                                                                                                            color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)'   },
            { title: 'Equity LTCG',       sub: 'Held ≥ 1 year',       rule: '12.5% on gains above ₹1.25L exemption (shared across portfolio) + 4% cess',                                                              color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
            { title: 'Debt / Hybrid / Intl', sub: 'Any holding period', rule: 'Taxed at your income slab rate + 4% cess. Hybrid funds are conservatively treated as non-equity unless you classify them as a specific equity category.', color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
          ].map((r, i) => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: r.bg, border: `1px solid ${r.border}` }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.title}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, marginBottom: 6 }}>{r.sub}</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{r.rule}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--indigo)' }}>⚠ Holding period</strong> is auto-computed from the SIP Start Date you set in Portfolio Builder.
          The ₹1.25L LTCG exemption is applied <strong>once across your entire portfolio</strong> — not per fund.
          All taxes include <strong>4% Health & Education Cess</strong>.
          Surcharge may apply if total income exceeds ₹50L — consult a tax advisor.
        </div>
      </div>

      {/* Missing dates warning */}
      {hasMissingDates && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--amber)' }}>
            Some funds are missing a purchase date in Portfolio Builder. Their holding period is assumed as 0 (STCG — conservative).
            Set the correct date in Portfolio → Edit for accurate results.
          </p>
        </div>
      )}

      {/* Parameters */}
      <div className="glass-card" style={{ padding: '18px 22px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Parameters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="goal-inputs">
          <div>
            <p className="label-upper" style={{ marginBottom: 8 }}>Your Income Tax Slab</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
              Used for Debt / Gold / International funds. Equity tax rates are fixed by law.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SLAB_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setSlabRate(s.value)}
                  className={`period-btn ${slabRate === s.value ? 'active' : ''}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <p className="label-upper">Holding Period</p>
              <button onClick={() => setUseWhatIf(v => !v)} style={{
                padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                background: useWhatIf ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.08)',
                color: useWhatIf ? 'var(--amber)' : 'var(--text-3)',
              }}>
                {useWhatIf ? '↻ Switch back to Auto' : '⚡ Switch to What-If Mode'}
              </button>
            </div>
            {useWhatIf ? (
              <>
                <p style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 10 }}>
                  Override: apply this hypothetical holding period to all funds (planning purposes only).
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ label: '6 mo', years: 0.5 }, { label: '1 yr', years: 1 }, { label: '2 yr', years: 2 }, { label: '3 yr', years: 3 }, { label: '5 yr', years: 5 }].map(p => (
                    <button key={p.label} onClick={() => setWhatIfYears(p.years)}
                      className={`period-btn ${whatIfYears === p.years ? 'active' : ''}`}>{p.label}</button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
                Each fund's holding period is computed automatically from its <strong>SIP Start Date</strong> in Portfolio Builder.
                Switch to What-If mode to model scenarios like "what if I hold everything 1 more year."
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 18px', borderColor: 'var(--red-border)', background: 'var(--red-bg)' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error} — make sure the backend server is running</p>
        </div>
      )}

      {/* Summary KPIs */}
      {!loading && totals.invested > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="kpi-grid">
            {[
              { label: 'Total Gain',              val: formatCurrency(totals.gain),    color: totals.gain >= 0 ? 'var(--green)' : 'var(--red)', sub: `Across ${taxBreakdown.length} ${taxBreakdown.length === 1 ? 'fund' : 'funds'}`  },
              { label: 'Tax Liability (incl. cess)', val: formatCurrency(totals.tax),  color: 'var(--red)',   sub: `Cess: ${formatCurrency(totals.cess)}`   },
              { label: 'Post-Tax Value',           val: formatCurrency(totals.postTax), color: 'var(--green)', sub: 'After all taxes'                         },
              { label: 'Effective Tax Rate',       val: totals.gain > 0 ? `${((totals.tax / totals.gain) * 100).toFixed(1)}%` : '—', color: 'var(--amber)', sub: 'On total gains' },
            ].map((k, i) => (
              <div key={i} className="kpi-card" style={{ textAlign: 'left' }}>
                <p className="label-upper" style={{ marginBottom: 8 }}>{k.label}</p>
                <p className="stat-num" style={{ color: k.color, fontSize: 22 }}>{k.val}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* LTCG exemption status */}
          {totalLTCGGain > 0 && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--green-bg)', border: '1px solid var(--green-border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <CheckCircle size={15} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 3 }}>
                  ₹1.25L LTCG Exemption — {formatCurrency(ltcgExemptionUsed)} applied across portfolio
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  Total LTCG gains: {formatCurrency(totalLTCGGain)} &nbsp;·&nbsp;
                  Exempt: {formatCurrency(ltcgExemptionUsed)} &nbsp;·&nbsp;
                  Taxable LTCG: {formatCurrency(Math.max(0, totalLTCGGain - ltcgExemptionUsed))}
                  {totalLTCGGain < 125000 && (
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                      {' '}— All LTCG gains are within the exemption! Zero LTCG tax.
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Per-Fund Breakdown */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Per-Fund Tax Breakdown</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
              Holding period is auto-computed from each fund's SIP Start Date.{' '}
              {useWhatIf && <span style={{ color: 'var(--amber)', fontWeight: 600 }}>What-If mode: {whatIfYears}yr applied to all.</span>}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 780 }}>
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>Held Since</th>
                    <th>Holding</th>
                    <th>Gain</th>
                    <th>Regime</th>
                    <th title="Estimated tax including 4% cess. For partial redemptions this uses a blended rate (approximation) — actual tax depends on FIFO unit allocation at redemption.">Tax (incl. cess) ⓘ</th>
                    <th>Post-Tax Value</th>
                  </tr>
                </thead>
                <tbody>
                  {taxBreakdown.map((t, i) => {
                    const pf = portfolio.find(p => String(p.scheme_code) === String(t.scheme_code)) || {};
                    const hYrs = useWhatIf ? whatIfYears : holdingYears(pf.purchase_date);
                    return (
                      <tr key={i}>
                        <td>
                          <p style={{ fontWeight: 600, fontSize: 12 }}>
                            {(t.name || t.scheme_code || '').replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}
                          </p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t.cat}</p>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {pf.purchase_date || <span style={{ color: 'var(--amber)' }}>Not set</span>}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {hYrs !== null ? holdingLabel(hYrs) : <span style={{ color: 'var(--amber)' }}>?</span>}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: t.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {formatCurrency(t.gain)}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: t.fundRegime === 'LTCG' ? 'var(--green-bg)' : t.fundRegime === 'STCG' ? 'var(--red-bg)' : 'var(--amber-bg)',
                            color:      t.fundRegime === 'LTCG' ? 'var(--green)'    : t.fundRegime === 'STCG' ? 'var(--red)'    : 'var(--amber)',
                            border: `1px solid ${t.fundRegime === 'LTCG' ? 'var(--green-border)' : t.fundRegime === 'STCG' ? 'var(--red-border)' : 'var(--amber-border)'}`,
                          }}>
                            {t.fundRegime}
                          </span>
                          {t.fundRegime === 'Slab' && t.cat === 'Hybrid' && (
                            <span title="Hybrid funds are conservatively taxed at slab rate. Change the category in Portfolio Builder if this fund is equity-oriented (>65% equity)." style={{ cursor: 'help', marginLeft: 4, fontSize: 11, color: 'var(--text-3)' }}>ℹ</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', color: t.taxLiability > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                          {t.gain > 0 ? formatCurrency(t.taxLiability) : '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>
                          {formatCurrency((t.current_value || 0) - (t.taxLiability || 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 700, color: 'var(--text-1)', textAlign: 'left', padding: '12px 0', fontSize: 12 }}>Portfolio Total</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: totals.gain >= 0 ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{formatCurrency(totals.gain)}</td>
                    <td />
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--red)', textAlign: 'right' }}>{formatCurrency(totals.tax)}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--green)', textAlign: 'right' }}>{formatCurrency(totals.postTax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
              * LTCG tax is distributed proportionally across equity funds. The ₹1.25L exemption is applied at portfolio level.
              Cess included at 4%. Surcharge not modelled — applies if total income {'>'} ₹50L.
            </p>
          </div>

          {/* Surcharge warning */}
          {totals.gain > 500000 && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', display: 'flex', gap: 10 }}>
              <AlertTriangle size={14} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: 'var(--amber)', lineHeight: 1.55 }}>
                <strong>Surcharge may apply.</strong> If your total income exceeds ₹50L in FY 2024-25, a surcharge of 10–15%
                applies on income tax (including LTCG). This calculator does not model surcharge. Consult a CA.
              </p>
            </div>
          )}

          {/* What-If: Partial Redemption */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calculator size={14} style={{ color: 'var(--indigo)' }} /> What-If: Partial Redemption
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
              Estimate tax on redeeming a partial amount today. Uses your portfolio's blended gain/tax rate as an approximation.
              Actual tax may differ by fund and lot.
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Redemption Amount (₹)</label>
                <input type="number" className="input-field" placeholder="e.g. 100000"
                  value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} />
              </div>
              {partialRedeem > 0 && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Estimated Gain', val: formatCurrency(partialGain), color: 'var(--green)' },
                    { label: 'Estimated Tax',  val: formatCurrency(partialTax),  color: 'var(--red)'   },
                    { label: 'You Receive',    val: formatCurrency(partialRedeem - partialTax), color: 'var(--text-1)' },
                  ].map((k, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)', minWidth: 130 }}>
                      <p className="label-upper" style={{ marginBottom: 6 }}>{k.label}</p>
                      <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: k.color }}>{k.val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tax Optimisation Tips */}
          <div className="glass-card" style={{ padding: 22, background: 'rgba(52,211,153,0.03)', borderColor: 'var(--green-border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} /> Tax Optimisation Tips
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }} className="analytics-grid">
              {[
                { tip: 'Harvest ₹1.25L LTCG tax-free every year',       detail: 'You can book up to ₹1.25L in LTCG each financial year tax-free. Sell and re-buy (known as "tax harvesting") to reset cost basis — but check exit loads first.' },
                { tip: 'Hold equity ≥ 1 year before redeeming',          detail: "Switching from STCG (20%) to LTCG (12.5%) saves 7.5% in tax rate. On a ₹1L gain, that's ₹7,500 saved (plus cess)." },
                { tip: 'ELSS for 80C deduction + equity returns',         detail: 'Invest up to ₹1.5L in ELSS under Sec 80C to save ₹46,800 (at 30% slab). 3-year lock-in ensures LTCG treatment automatically.' },
                { tip: 'Avoid debt funds for short-term parking',         detail: 'Debt MF gains are taxed at your slab rate (up to 30%). For short-term needs, FD, liquid bees or arbitrage funds may be more tax-efficient.' },
                { tip: 'Watch exit loads before tax-harvesting',          detail: 'Most equity funds charge 1% exit load if redeemed within 1 year. Factor this in before harvesting gains — the load can offset the tax saving.' },
                { tip: 'Spread redemptions across financial years',       detail: 'If redeeming a large corpus, stagger across 2 financial years to use the ₹1.25L LTCG exemption twice — potentially saving ₹15,625 + cess.' },
              ].map((t, i) => (
                <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--green-bg)', border: '1px solid rgba(52,211,153,0.12)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>✓ {t.tip}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>{t.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && totals.invested === 0 && !error && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Receipt size={40} style={{ margin: '0 auto 14px', opacity: 0.25, display: 'block' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>No portfolio data yet.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>Add funds in Portfolio Builder first.</p>
          <a href="/portfolio" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13, textDecoration: 'none' }}>
            Build Portfolio →
          </a>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Fetching portfolio performance…</p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TAX HARVESTING TAB
════════════════════════════════════════════════════════════ */
function TaxHarvestingTab({ portfolio }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [result, setResult]   = useState(null);

  async function run() {
    if (!portfolio.length) { setError('Add funds in Portfolio Builder first.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await taxHarvest({ funds: portfolio, mode: 'sip', start_date: null, end_date: null });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    }
    setLoading(false);
  }

  const summary  = result?.summary       || {};
  const plan     = result?.harvest_plan  || {};
  const losses   = result?.loss_positions || [];
  const gains    = result?.gain_positions || [];
  const harvests = plan.recommended_harvests || [];
  const taxSaved  = summary.tax_saved    || 0;
  const taxBefore = summary.net_tax_before_harvest || 0;
  const taxAfter  = summary.net_tax_after_harvest  || 0;
  const savingsPct = summary.savings_pct || 0;

  return (
    <div className="space-y-5">
      {/* Analyse button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={run} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {loading
            ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spinRing 0.8s linear infinite' }} /> Analysing…</>
            : <><RefreshCw size={13} /> Analyse Portfolio</>}
        </button>
      </div>

      {/* How It Works */}
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={12} /> How Tax Loss Harvesting Works
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="goal-presets">
          {[
            { step: '1', title: 'Identify loss positions', desc: 'Find funds currently trading below your cost price (unrealised loss).',                                                                       color: 'var(--red)',   bg: 'var(--red-bg)',   border: 'var(--red-border)'   },
            { step: '2', title: 'Sell to realise the loss', desc: 'Sell the loss-making fund. STCG losses offset STCG gains first, then LTCG gains. LTCG losses offset LTCG gains only.',                    color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
            { step: '3', title: '30-day wash-sale rule',   desc: 'Wait 30 days before re-buying the same fund, or immediately switch to a similar (different AMC) fund to stay invested.',                   color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
          ].map(s => (
            <div key={s.step} style={{ padding: '12px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: s.color, marginBottom: 4 }}>Step {s.step} · {s.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--indigo)' }}>Tax rates (Budget 2024):</strong>{' '}
          STCG (held &lt; 1 yr): <strong>20% + 4% cess</strong> &nbsp;·&nbsp;
          LTCG (held ≥ 1 yr): <strong>12.5% + 4% cess</strong>, ₹1.25L annual exemption applies to <em>gains</em>, not losses.
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 18px', background: 'var(--red-bg)', borderColor: 'var(--red-border)' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Scissors size={40} style={{ margin: '0 auto 14px', opacity: 0.2, display: 'block' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Click "Analyse Portfolio" to scan your funds for harvestable tax losses.</p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Fetching NAVs and computing tax positions…</p>
        </div>
      )}

      {result && !loading && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="kpi-grid">
            {[
              { label: 'Tax Before Harvesting', val: formatCurrency(taxBefore), color: 'var(--red)',   sub: 'Current liability'          },
              { label: 'Tax After Harvesting',  val: formatCurrency(taxAfter),  color: 'var(--amber)', sub: 'After offsetting losses'     },
              { label: 'Tax You Can Save',       val: formatCurrency(taxSaved),  color: 'var(--green)', sub: `${savingsPct}% reduction`    },
              { label: 'Harvestable Loss',       val: formatCurrency(plan.total_harvestable_loss || 0), color: 'var(--red)', sub: `${losses.length} position${losses.length !== 1 ? 's' : ''}` },
            ].map((k, i) => (
              <div key={i} className="kpi-card" style={{ textAlign: 'left' }}>
                <p className="label-upper" style={{ marginBottom: 8 }}>{k.label}</p>
                <p className="stat-num" style={{ color: k.color, fontSize: 20 }}>{k.val}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {taxSaved > 0 && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--green-bg)', border: '1px solid var(--green-border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <CheckCircle size={15} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 3 }}>
                  You can save {formatCurrency(taxSaved)} in taxes ({savingsPct}% reduction) by harvesting losses
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  Net gain after harvesting: <strong style={{ color: 'var(--text-1)' }}>{formatCurrency(plan.net_gain_after_harvest || 0)}</strong>.
                  Sell the loss positions below, then switch to similar funds from a different AMC to stay invested.
                </p>
              </div>
            </div>
          )}

          {taxSaved === 0 && (
            <div style={{ padding: '12px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
              <CheckCircle size={13} style={{ color: 'var(--indigo)', marginRight: 8, verticalAlign: 'middle' }} />
              No harvestable losses found — your portfolio has no loss positions to offset against gains.
            </div>
          )}

          {/* Loss / Gain Positions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="analytics-grid">
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
                <TrendingDown size={14} /> Loss Positions ({losses.length})
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Funds below your cost price — candidates for harvesting</p>
              {losses.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>No loss positions</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {losses.map((pos, i) => (
                    <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid var(--red-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.name}</p>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <Pill label={pos.regime} {...regimeColors(pos.regime)} />
                            {pos.holding_years !== null && (
                              <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Clock size={9} /> {pos.holding_years.toFixed(1)}yr
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)', fontFamily: 'monospace' }}>{formatCurrency(pos.pnl)}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Loss</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-3)' }}>
                        <span>Cost: <strong style={{ color: 'var(--text-2)' }}>{formatCurrency(pos.invested)}</strong></span>
                        <span>Current: <strong style={{ color: 'var(--text-2)' }}>{formatCurrency(pos.current)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)' }}>
                <TrendingUp size={14} /> Gain Positions ({gains.length})
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Funds in profit — losses will be offset against these</p>
              {gains.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>No gain positions</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gains.map((pos, i) => (
                    <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--green-bg)', border: '1px solid var(--green-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.name}</p>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <Pill label={pos.regime} {...regimeColors(pos.regime)} />
                            {pos.holding_years !== null && (
                              <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Clock size={9} /> {pos.holding_years.toFixed(1)}yr
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)', fontFamily: 'monospace' }}>+{formatCurrency(pos.pnl)}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Gain</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-3)' }}>
                        <span>Cost: <strong style={{ color: 'var(--text-2)' }}>{formatCurrency(pos.invested)}</strong></span>
                        <span>Current: <strong style={{ color: 'var(--text-2)' }}>{formatCurrency(pos.current)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Harvest Recommendations */}
          {harvests.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scissors size={14} style={{ color: 'var(--indigo)' }} /> Recommended Harvest Plan
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>Sorted by largest loss first — execute to save the most tax</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>Fund</th><th>Regime</th><th>Loss (₹)</th>
                      <th>Invested</th><th>Current Value</th><th>Est. Tax Saved</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {harvests.map((h, i) => (
                      <tr key={i}>
                        <td>
                          <p style={{ fontWeight: 600, fontSize: 12 }}>{h.name}</p>
                          {h.holding_years !== null && (
                            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Held {h.holding_years.toFixed(1)} yrs</p>
                          )}
                        </td>
                        <td><Pill label={h.regime} {...regimeColors(h.regime)} /></td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--red)', fontWeight: 700 }}>{formatCurrency(h.pnl)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{formatCurrency(h.invested)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{formatCurrency(h.current)}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>
                          {h.estimated_tax_saved > 0 ? `+${formatCurrency(h.estimated_tax_saved)}` : '—'}
                        </td>
                        <td><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)' }}>📤 Sell to harvest</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 12 }}>Total Savings</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 800 }}>+{formatCurrency(taxSaved)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Wash-Sale Warning */}
          <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={15} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 3 }}>⏳ Wash-Sale Rule</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
                {plan.wash_sale_warning || "Wait at least 30 days before re-buying the same fund. To stay invested, immediately switch to a similar (but not identical) fund — e.g., replace one Nifty 50 index fund with another AMC's Nifty 50 fund."}
              </p>
            </div>
          </div>

          {/* STCG / LTCG Breakdown */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Gain / Loss Breakdown by Holding Period</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="kpi-grid">
              {[
                { label: 'STCG Gains',  val: formatCurrency(summary.total_stcg_gain || 0), color: 'var(--amber)', sub: '< 1 year, taxed at 20%'       },
                { label: 'LTCG Gains',  val: formatCurrency(summary.total_ltcg_gain || 0), color: 'var(--green)', sub: '≥ 1 year, taxed at 12.5%'      },
                { label: 'STCG Losses', val: formatCurrency(summary.total_stcg_loss || 0), color: 'var(--red)',   sub: 'Offsets STCG + LTCG gains'     },
                { label: 'LTCG Losses', val: formatCurrency(summary.total_ltcg_loss || 0), color: 'var(--red)',   sub: 'Offsets LTCG gains only'        },
              ].map((k, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}>
                  <p className="label-upper" style={{ marginBottom: 6 }}>{k.label}</p>
                  <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: k.color }}>{k.val}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{k.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE — Tab shell
════════════════════════════════════════════════════════════ */
export default function TaxPlanning() {
  const portfolio  = usePortfolio();
  const [tab, setTab] = useState('calculator');

  const tabs = [
    { id: 'calculator', label: 'Tax Calculator',   icon: Receipt  },
    { id: 'harvesting', label: 'Tax Harvesting',   icon: Scissors },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Tax Planning</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Budget 2024 Indian MF rules · Tax liability calculator · Loss harvesting recommendations
        </p>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--indigo)' : 'var(--text-3)',
                borderBottom: active ? '2px solid var(--indigo)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === 'calculator' && <TaxCalculator portfolio={portfolio} />}
      {tab === 'harvesting' && <TaxHarvestingTab portfolio={portfolio} />}
    </div>
  );
}
