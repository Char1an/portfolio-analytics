import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart3, TrendingUp, Shield, RefreshCw, BookOpen, ChevronDown, ChevronUp, AlertTriangle, Info, HelpCircle, Download } from 'lucide-react';
import { exportCSV, exportExcel, exportPDF } from '../utils/exportUtils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from 'recharts';
import { analyzePerformance, analyzeRisk, getNavHistory } from '../services/api';
import { formatCurrency, formatPercent, CHART_COLORS } from '../utils/formatters';
import { usePortfolio } from '../hooks/usePortfolio';

// Benchmark proxies — codes verified against MFAPI.in
const BENCHMARKS = [
  { key: 'Nifty 50',         code: '118741', color: '#fbbf24', dash: '6 3' },
  { key: 'Sensex',           code: '151769', color: '#f97316', dash: '4 4' },
  { key: 'Mid Cap 150',      code: '150673', color: '#a78bfa', dash: '3 3' },
  { key: 'Small Cap',        code: '125354', color: '#f87171', dash: '5 3' },
  { key: 'S&P 500',          code: '148381', color: '#34d399', dash: '6 2' },
  { key: 'NASDAQ 100',       code: '145552', color: '#60a5fa', dash: '4 2' },
  { key: 'Gold',             code: '119788', color: '#f59e0b', dash: '3 6' },
];

const PERIOD_PRESETS = ['1Y', '2Y', '3Y', '5Y'];

function holdingYears(purchaseDate) {
  if (!purchaseDate) return null;
  const ms = Date.now() - new Date(purchaseDate).getTime();
  return ms / (365.25 * 24 * 3600 * 1000);
}

function formatHolding(yrs) {
  if (yrs === null || yrs === undefined) return '—';
  const y = Math.floor(yrs);
  const m = Math.floor((yrs - y) * 12);
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}yr`;
  return `${y}yr ${m}mo`;
}

/**
 * Compute portfolio-level tax correctly:
 * - Uses actual purchase_date from portfolio per fund
 * - ₹1.25L LTCG exemption applied once across ALL LTCG gains (portfolio-level, not per-fund)
 * - Proportional exemption allocation across LTCG funds
 * - 4% health & education cess on base tax
 * - Funds with no purchase_date default to LTCG (conservative)
 */
function computePortfolioTax(perfFunds, portfolio) {
  const dateMap = {};
  portfolio.forEach(f => { if (f.purchase_date) dateMap[f.scheme_code] = f.purchase_date; });

  // First pass: classify each fund, sum LTCG gains for exemption allocation
  let totalLtcgGain = 0;
  const items = perfFunds.map(f => {
    const gain  = Math.max(0, (f.current_value || 0) - (f.total_invested || 0));
    const pd    = dateMap[f.scheme_code] || null;
    const yrs   = holdingYears(pd);
    const isLtcg = (yrs === null) || (yrs >= 1); // missing date → assume LTCG
    if (isLtcg && gain > 0) totalLtcgGain += gain;
    return { f, gain, yrs, isLtcg, pd };
  });

  // Portfolio-level LTCG exemption: ₹1.25L (Budget 2024)
  const ltcgExempt = Math.min(125000, totalLtcgGain);

  // Second pass: compute tax per fund with proportional exemption
  return items.map(({ f, gain, yrs, isLtcg, pd }) => {
    let taxLiability = 0;
    let regime = gain > 0 ? (isLtcg ? 'LTCG 12.5%' : 'STCG 20%') : '—';
    if (gain > 0) {
      if (!isLtcg) {
        // STCG: 20% flat + 4% cess, no exemption
        taxLiability = Math.round(gain * 0.20 * 1.04);
      } else {
        // LTCG: allocate exemption proportionally by each fund's share of total LTCG gain
        const myExempt  = totalLtcgGain > 0 ? (gain / totalLtcgGain) * ltcgExempt : 0;
        const taxable   = Math.max(0, gain - myExempt);
        taxLiability    = Math.round(taxable * 0.125 * 1.04); // 12.5% + 4% cess
      }
      if (pd === null) regime = 'LTCG* 12.5%'; // flag: no purchase date on file
    }
    const name = (f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim();
    return {
      name,
      gain,
      taxLiability,
      postTaxValue: Math.round((f.current_value || 0) - taxLiability),
      regime,
      invested:      f.total_invested || 0,
      current:       f.current_value  || 0,
      purchaseDate:  pd,
      holdingYrs:    yrs,
      missingDate:   pd === null,
    };
  });
}

function computeRollingReturns(growthData, lines) {
  if (growthData.length < 2) return [];
  const keys = lines.map(l => l.key);
  const result = [];
  for (let i = 0; i < growthData.length; i++) {
    const cur = growthData[i];
    // Find a point approx 1Y (252 trading days ~ 365 calendar days) back
    const targetDate = new Date(cur.date);
    targetDate.setFullYear(targetDate.getFullYear() - 1);
    const targetStr = targetDate.toISOString().slice(0, 10);
    // Find closest available data point at or before targetStr
    let prior = null;
    for (let j = i - 1; j >= 0; j--) {
      if (growthData[j].date <= targetStr) { prior = growthData[j]; break; }
    }
    if (!prior) continue;
    const entry = { date: cur.date };
    let hasAny = false;
    keys.forEach(k => {
      const cv = parseFloat(cur[k]);
      const pv = parseFloat(prior[k]);
      if (!isNaN(cv) && !isNaN(pv) && pv > 0) {
        entry[k] = parseFloat(((cv / pv - 1) * 100).toFixed(2));
        hasAny = true;
      }
    });
    if (hasAny) result.push(entry);
  }
  return result;
}

function periodToStartDate(p) {
  const d = new Date();
  const map = { '1Y': 1, '2Y': 2, '3Y': 3, '5Y': 5 };
  d.setFullYear(d.getFullYear() - (map[p] || 3));
  return d.toISOString().slice(0, 10);
}

// ── Export helpers ─────────────────────────────────────────────
function ExportMenu({ perfFunds, riskFunds, taxData, period, totGain, totTax, totPostTax }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename  = (ext) => `portfolio-report-${dateStamp}.${ext}`;

  function perfRows() {
    return perfFunds.map(f => [
      (f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim(),
      f.total_invested != null ? Math.round(f.total_invested) : '',
      f.current_value  != null ? Math.round(f.current_value)  : '',
      f.absolute_return != null ? `${f.absolute_return.toFixed(1)}%` : '',
      f.xirr_pct != null ? `${f.xirr_pct.toFixed(1)}%` : (f.absolute_return != null ? `${f.absolute_return.toFixed(1)}%` : ''),
    ]);
  }
  function perfHeaders() { return ['Fund', 'Invested (₹)', 'Current Value (₹)', 'Absolute Return', 'XIRR']; }

  function riskRows() {
    return riskFunds.map(r => [
      (r.name || r.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim(),
      r.volatility_pct != null ? `${r.volatility_pct}%` : '',
      r.max_drawdown?.max_drawdown_pct != null ? `-${r.max_drawdown.max_drawdown_pct}%` : '',
      r.sharpe_ratio ?? '',
      r.risk_score != null ? `${r.risk_score}/10` : '',
    ]);
  }
  function riskHeaders() { return ['Fund', 'Volatility (Ann.)', 'Max Drawdown', 'Sharpe Ratio', 'Risk Score']; }

  function taxRows() {
    return taxData.map(t => [
      t.name,
      t.purchaseDate || 'Not set',
      t.invested  != null ? Math.round(t.invested)      : '',
      t.current   != null ? Math.round(t.current)       : '',
      t.gain      != null ? Math.round(t.gain)          : '',
      t.regime,
      t.taxLiability  != null ? Math.round(t.taxLiability)  : '',
      t.postTaxValue  != null ? Math.round(t.postTaxValue)  : '',
    ]);
  }
  function taxHeaders() { return ['Fund', 'Purchase Date', 'Invested (₹)', 'Current Value (₹)', 'Gain (₹)', 'Tax Regime', 'Tax (₹)', 'Post-Tax Value (₹)']; }

  function doCSV() {
    // Export all three sections as separate CSV files (zip not available; export the active tab as one)
    // We'll export a combined CSV with blank separator rows
    const rows = [
      ['=== Performance ==='],
      perfHeaders(),
      ...perfRows(),
      [],
      ['=== Risk Metrics ==='],
      riskHeaders(),
      ...riskRows(),
      [],
      ['=== Tax Impact ==='],
      taxHeaders(),
      ...taxRows(),
      [],
      ['Total Gain (₹)', Math.round(totGain), '', '', '', '', Math.round(totTax), Math.round(totPostTax)],
    ];
    exportCSV(rows.slice(2), perfHeaders(), filename('csv'));
    setOpen(false);
  }

  function doExcel() {
    const taxFooter = ['TOTAL', '', '', '', Math.round(totGain), '', Math.round(totTax), Math.round(totPostTax)];
    exportExcel([
      { name: 'Performance', headers: perfHeaders(), rows: perfRows() },
      { name: 'Risk Metrics', headers: riskHeaders(), rows: riskRows() },
      { name: 'Tax Impact',   headers: taxHeaders(),  rows: taxRows(), footerRow: taxFooter },
    ], filename('xlsx'));
    setOpen(false);
  }

  function doPDF() {
    const taxFooter = ['TOTAL', '', '', '', Math.round(totGain), '', Math.round(totTax), Math.round(totPostTax)];
    exportPDF([
      {
        title: 'Performance Summary',
        subtitle: `Period: ${period} · XIRR based on actual transaction history where available`,
        headers: perfHeaders(),
        rows: perfRows(),
      },
      {
        title: 'Risk Metrics',
        subtitle: 'Risk Score 0–10: ≤3.5 Low · ≤6.5 Medium · >6.5 High · Risk-free rate = 6.5% (10Y G-Sec)',
        headers: riskHeaders(),
        rows: riskRows(),
      },
      {
        title: 'Tax Impact (Budget 2024)',
        subtitle: 'Equity MF: STCG <1yr = 20% · LTCG ≥1yr = 12.5% above ₹1.25L exemption · +4% cess on all. Estimates only — consult a tax advisor.',
        headers: taxHeaders(),
        rows: taxRows(),
        footerRow: taxFooter,
      },
    ], filename('pdf'), 'Folio Klarity — Portfolio Analytics Report');
    setOpen(false);
  }

  const menuItems = [
    { label: 'Download CSV',  icon: '📄', action: doCSV },
    { label: 'Download Excel', icon: '📊', action: doExcel },
    { label: 'Download PDF',  icon: '📑', action: doPDF },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="btn-secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
      >
        <Download size={13} />
        Export
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '8px 6px', minWidth: 180, boxShadow: 'var(--shadow-card)',
        }}>
          <p className="label-upper" style={{ padding: '2px 10px 8px' }}>Export As</p>
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, background: 'transparent', border: 'none',
                cursor: 'pointer', fontSize: 12, color: 'var(--text-1)', textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0', paddingTop: 6, paddingLeft: 12 }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
              Exports all 3 sections:<br />Performance · Risk · Tax
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const portfolio                            = usePortfolio();
  const [loading, setLoading]               = useState(true);
  const [perfData, setPerfData]             = useState(null);
  const [riskData, setRiskData]             = useState(null);
  const [growthData, setGrowthData]         = useState([]);
  const [period, setPeriod]                 = useState('3Y');
  const [customStart, setCustomStart]       = useState('');
  const [customEnd, setCustomEnd]           = useState('');
  const [useCustom, setUseCustom]           = useState(false);
  const [activeBenchmarks, setActiveBenchmarks] = useState(['Nifty 50']);
  const [activeFunds, setActiveFunds]           = useState(() => portfolio.map(f => f.scheme_code));
  const [activeTab, setActiveTab]               = useState('performance');
  const [showChartPanel, setShowChartPanel]     = useState(false);
  const [showRiskMethod, setShowRiskMethod]     = useState(false);

  // Keep activeFunds in sync when portfolio hydrates from server (adds new codes, keeps existing selections)
  useEffect(() => {
    setActiveFunds(prev => {
      const codes = portfolio.map(f => f.scheme_code);
      // Add any new funds that aren't already tracked; don't remove user's deselections
      const next = [...prev.filter(c => codes.includes(c)), ...codes.filter(c => !prev.includes(c))];
      return next.length === 0 ? codes : next;
    });
  }, [portfolio]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const startDate = useCustom ? customStart : periodToStartDate(period);
    const endDate   = useCustom ? customEnd   : undefined;

    try {
      const [perfResp, riskResp] = await Promise.all([
        analyzePerformance({ funds: portfolio, mode: 'sip', start_date: startDate, end_date: endDate }),
        analyzeRisk({ funds: portfolio, start_date: startDate, end_date: endDate }),
      ]);
      setPerfData(perfResp.data);
      setRiskData(riskResp.data);

      // Load fund NAVs + selected benchmarks
      const fundFetches = portfolio.map(f =>
        getNavHistory(f.scheme_code, useCustom ? null : period, useCustom ? startDate : undefined, useCustom ? endDate : undefined).catch(() => null)
      );
      const benchFetches = activeBenchmarks
        .map(bk => BENCHMARKS.find(b => b.key === bk))
        .filter(Boolean)
        .map(b =>
          getNavHistory(b.code, useCustom ? null : period, useCustom ? startDate : undefined, useCustom ? endDate : undefined).catch(() => null)
        );

      const allResps = await Promise.all([...fundFetches, ...benchFetches]);

      const allData = {};

      // Use scheme_code as the chart data key to avoid label collisions when
      // multiple funds share the same truncated name (e.g. two "Motilal Oswal Nifty…" funds).
      // Benchmarks keep their string key since they are unique fixed strings.
      allResps.forEach((resp, i) => {
        if (!resp?.data?.nav_data) return;
        const pts  = resp.data.nav_data;
        const base = pts[0]?.nav || 1;
        const step = Math.max(1, Math.floor(pts.length / 90));
        const dataKey = i < portfolio.length
          ? portfolio[i].scheme_code
          : activeBenchmarks[i - portfolio.length];
        pts.forEach((p, j) => {
          if (j % step !== 0 && j !== pts.length - 1) return;
          if (!allData[p.date]) allData[p.date] = { date: p.date };
          allData[p.date][dataKey] = parseFloat(((p.nav / base) * 100).toFixed(2));
        });
      });

      setGrowthData(Object.values(allData).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [activeBenchmarks, customEnd, customStart, period, portfolio, useCustom]);

  useEffect(() => { loadData(); }, [loadData]);

  function applyCustomPeriod() {
    if (!customStart) return;
    setUseCustom(true);
  }

  function resetPeriod(p) {
    setUseCustom(false);
    setCustomStart('');
    setCustomEnd('');
    setPeriod(p);
  }

  function toggleBenchmark(key) {
    setActiveBenchmarks(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function toggleFund(code) {
    setActiveFunds(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  const perfFunds  = perfData?.funds || [];
  const riskFunds  = riskData?.fund_risks || [];

  // IDCW / Dividend plan detection
  const idcwFunds = portfolio.filter(f => /idcw|dividend/i.test(f.name || ''));

  // Nifty 50 latest period return (from growthData) — for counterfactual comparison
  const niftyKey  = 'Nifty 50';
  const niftyMultiplier = (() => {
    if (growthData.length < 2) return null;
    const first = parseFloat(growthData[0]?.[niftyKey]);
    const last  = parseFloat(growthData[growthData.length - 1]?.[niftyKey]);
    if (isNaN(first) || isNaN(last) || first === 0) return null;
    return last / first; // e.g. 1.82 means 82% growth
  })();

  // Latest NAV date across all chart data (data freshness)
  const latestNavDate = growthData.length > 0 ? growthData[growthData.length - 1]?.date : null;

  // Tax: use actual purchase_date from portfolio — correct holding period, portfolio-level LTCG exemption
  const taxData        = computePortfolioTax(perfFunds, portfolio);
  const totTax         = taxData.reduce((s, t) => s + t.taxLiability, 0);
  const totGain        = taxData.reduce((s, t) => s + t.gain, 0);
  const totPostTax     = taxData.reduce((s, t) => s + t.postTaxValue, 0);
  const missingDateCount = taxData.filter(t => t.missingDate && t.gain > 0).length;
  const totalLtcgGain  = taxData.filter(t => t.regime.includes('LTCG')).reduce((s, t) => s + t.gain, 0);
  const ltcgExemptUsed = Math.min(125000, totalLtcgGain);

  // Chart lines: filtered by activeFunds + activeBenchmarks
  // key = scheme_code for funds (collision-safe), benchmark string for indices
  const allFundLines = portfolio.map((f, i) => ({
    key:   f.scheme_code,
    name:  (f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim(),
    color: CHART_COLORS[i % CHART_COLORS.length],
    dash:  undefined,
    isFund: true,
  }));
  const chartLines = [
    ...allFundLines.filter(l => activeFunds.includes(l.key)),
    ...activeBenchmarks.map(bk => {
      const b = BENCHMARKS.find(x => x.key === bk);
      return b ? { key: bk, name: bk, color: b.color, dash: b.dash, isFund: false } : null;
    }).filter(Boolean),
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '55vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 14px' }} />
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading analytics…</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Performance Analytics</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            {portfolio.length} funds · Risk metrics, returns & tax impact
          </p>
        </div>

        {/* Period + Benchmark controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ExportMenu
            perfFunds={perfFunds}
            riskFunds={riskFunds}
            taxData={taxData}
            period={useCustom ? 'Custom' : period}
            totGain={totGain}
            totTax={totTax}
            totPostTax={totPostTax}
          />
          {/* Unified Chart Lines selector */}
          {(() => {
            const totalActive = activeFunds.length + activeBenchmarks.length;
            const totalAll    = portfolio.length + BENCHMARKS.length;
            return (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowChartPanel(v => !v)}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  📈 Chart Lines ({totalActive}/{totalAll})
                  {showChartPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showChartPanel && (
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
                    padding: '14px 10px', minWidth: 300, maxHeight: 520, overflowY: 'auto',
                    boxShadow: 'var(--shadow-card)',
                  }}>

                    {/* ── Your Funds ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 8px' }}>
                      <p className="label-upper">Your Funds</p>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => setActiveFunds(portfolio.map(f => f.scheme_code))}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--indigo)', cursor: 'pointer', fontWeight: 600 }}>
                          All
                        </button>
                        <button onClick={() => setActiveFunds([])}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                          None
                        </button>
                      </div>
                    </div>
                    {allFundLines.map(l => {
                      const on = activeFunds.includes(l.key);
                      return (
                        <button key={l.key} onClick={() => toggleFund(l.key)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            background: on ? `${l.color}14` : 'transparent',
                            border: on ? `1px solid ${l.color}44` : '1px solid transparent',
                            cursor: 'pointer', marginBottom: 3, transition: 'all 0.13s',
                          }}
                        >
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0, opacity: on ? 1 : 0.3 }} />
                          <span style={{ flex: 1, textAlign: 'left', fontSize: 12, color: on ? 'var(--text-1)' : 'var(--text-3)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {l.name}
                          </span>
                          {on && <span style={{ fontSize: 11, color: l.color, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                        </button>
                      );
                    })}

                    {/* ── Indices / Benchmarks ── */}
                    <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0 8px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 8px' }}>
                      <p className="label-upper">Indices</p>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => setActiveBenchmarks(BENCHMARKS.map(b => b.key))}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--indigo)', cursor: 'pointer', fontWeight: 600 }}>
                          All
                        </button>
                        <button onClick={() => setActiveBenchmarks([])}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                          None
                        </button>
                      </div>
                    </div>
                    {BENCHMARKS.map(b => {
                      const on = activeBenchmarks.includes(b.key);
                      return (
                        <button key={b.key} onClick={() => toggleBenchmark(b.key)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            background: on ? `${b.color}14` : 'transparent',
                            border: on ? `1px solid ${b.color}44` : '1px solid transparent',
                            cursor: 'pointer', marginBottom: 3, transition: 'all 0.13s',
                          }}
                        >
                          <span style={{ width: 22, height: 3, borderRadius: 2, background: b.color, flexShrink: 0, opacity: on ? 1 : 0.3 }} />
                          <span style={{ flex: 1, textAlign: 'left', fontSize: 12, color: on ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {b.key}
                          </span>
                          {on && <span style={{ fontSize: 11, color: b.color, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                        </button>
                      );
                    })}

                    <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0 0', padding: '8px 8px 0' }}>
                      <p style={{ fontSize: 10, color: 'var(--text-3)' }}>
                        Applies to both Normalized Growth and 1-Year Rolling Returns charts.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Period presets */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIOD_PRESETS.map(p => (
              <button key={p} onClick={() => resetPeriod(p)}
                className={`period-btn ${!useCustom && period === p ? 'active' : ''}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Custom Date Range ── */}
      <div className="glass-card" style={{ padding: '14px 18px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>
          📅 Custom Date Range {useCustom && <span style={{ color: 'var(--green)', marginLeft: 6 }}>● Active</span>}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="label-upper" style={{ display: 'block', marginBottom: 5 }}>Start Date</label>
            <input type="date" className="input-field" style={{ width: 160 }}
              value={customStart} onChange={e => setCustomStart(e.target.value)}
              max={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label-upper" style={{ display: 'block', marginBottom: 5 }}>End Date (optional)</label>
            <input type="date" className="input-field" style={{ width: 160 }}
              value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              min={customStart} max={new Date().toISOString().slice(0, 10)} />
          </div>
          <button onClick={applyCustomPeriod} disabled={!customStart} className="btn-primary" style={{ fontSize: 12 }}>
            Apply Range
          </button>
          {useCustom && (
            <button onClick={() => resetPeriod(period)} className="btn-secondary" style={{ fontSize: 12 }}>
              Clear
            </button>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>or use preset: 1Y / 2Y / 3Y / 5Y above</p>
        </div>
      </div>

      {/* Data freshness + Benchmark proxy disclaimer */}
      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f59e0b' }}>Benchmark Proxy Disclaimer:</strong>{' '}
            "Nifty 50", "Sensex" etc. are <strong>mutual fund proxies</strong> (index ETFs from MFAPI) — not the actual indices. They carry tracking error and expense ratios.
          </p>
          {latestNavDate && (
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
              📅 <strong style={{ color: 'var(--text-2)' }}>NAV data as of {new Date(latestNavDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
              {' '}— MFAPI updates daily after market close (T+1 lag). Values shown may be from the previous trading day.
            </p>
          )}
        </div>
      </div>

      {/* IDCW / Dividend plan warning */}
      {idcwFunds.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 3 }}>
              IDCW / Dividend Plan Detected — Returns Shown Are Incomplete
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
              <strong>{idcwFunds.map(f => f.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()).join(', ')}</strong> distribute income periodically.
              All return figures here are based on <strong>NAV growth only</strong> and do not include distributions received.
              True returns are higher but IDCW distributions are taxed at your <strong>income slab rate</strong>, not at the 12.5% LTCG rate.
              Consider switching to the <strong>Growth plan</strong> for accurate compounding and simpler tax treatment.
            </p>
          </div>
        </div>
      )}

      {/* ── Growth Chart ── */}
      <div className="glass-card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={14} style={{ color: 'var(--indigo)' }} />
              Normalized Growth Comparison
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              Base = ₹100 at period start · {useCustom ? `${customStart} → ${customEnd || 'today'}` : period}
            </p>
          </div>
          {chartLines.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
              No lines selected — use Chart Lines above
            </span>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 340, justifyContent: 'flex-end' }}>
              {chartLines.map(l => (
                <span key={l.key} style={{ fontSize: 10, color: l.color, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  {l.dash
                    ? <span style={{ width: 18, height: 2, background: l.color, display: 'inline-block', borderRadius: 1 }} />
                    : <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                  }
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{l.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {chartLines.length === 0 ? (
          <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 28 }}>📈</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No lines selected</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Use <strong style={{ color: 'var(--indigo)' }}>Chart Lines</strong> above to pick funds or indices</p>
          </div>
        ) : (
          <div style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => v} />
                <Tooltip
                  contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                  formatter={(v, n) => [`${parseFloat(v).toFixed(1)} (base 100)`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }} />
                {chartLines.map(l => (
                  <Line key={l.key} type="monotone" dataKey={l.key} name={l.name}
                    stroke={l.color} strokeWidth={l.dash ? 1.8 : 2.2}
                    strokeDasharray={l.dash} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Tab Switcher ── */}
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
          📈 Performance & Risk
        </button>
        <button className={`tab-btn ${activeTab === 'tax' ? 'active' : ''}`} onClick={() => setActiveTab('tax')}>
          🧾 Tax Impact
        </button>
      </div>

      {/* ── Performance Tab ── */}
      {activeTab === 'performance' && (
        <>
          <div className="grid grid-cols-2 gap-4 analytics-grid">
            {/* Performance Table */}
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={14} style={{ color: 'var(--indigo)' }} /> SIP Performance — {useCustom ? 'Custom' : period}
              </h3>
              <table className="data-table">
                <thead>
                  <tr><th>Fund</th><th>Invested</th><th>Value</th><th>Return</th><th>XIRR</th></tr>
                </thead>
                <tbody>
                  {perfFunds.map((f, i) => (
                    <tr key={i}>
                      <td>
                        <p style={{ fontWeight: 600, fontSize: 12 }}>{(f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{portfolio.find(p => String(p.scheme_code) === String(f.scheme_code))?.category}</p>
                        {f.data_source_warning && (
                          <p style={{ fontSize: 9, color: 'var(--amber)', marginTop: 2 }}>⚠ Illustrative — set SIP/lumpsum in Portfolio Builder</p>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{formatCurrency(f.total_invested)}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>{formatCurrency(f.current_value)}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: f.absolute_return >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatPercent(f.absolute_return)}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: (f.xirr_pct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {f.xirr_pct != null ? formatPercent(f.xirr_pct) : formatPercent(f.absolute_return)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>* XIRR accounts for timing of each SIP instalment</p>
            </div>

            {/* Risk Table */}
            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={14} style={{ color: 'var(--indigo)' }} /> Risk Metrics
                </h3>
                <button
                  onClick={() => setShowRiskMethod(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: 'var(--indigo)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
                >
                  <HelpCircle size={11} />
                  How is Score calculated?
                  {showRiskMethod ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              </div>

              {/* Methodology Panel */}
              {showRiskMethod && (
                <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--indigo)', marginBottom: 10 }}>Risk Score (0–10) — Composite Methodology</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.6 }}>
                    Three components are scored independently and combined using fixed weights into a single 0–10 score.
                    Higher score = higher risk. Categorized as <span style={{ color: 'var(--green)' }}>Low (≤3.5)</span>, <span style={{ color: 'var(--amber)' }}>Medium (≤6.5)</span>, or <span style={{ color: 'var(--red)' }}>High (&gt;6.5)</span>.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      {
                        label: 'Volatility (35% weight)',
                        formula: 'σ × √252 — annualised std dev of daily NAV returns',
                        scale: '0% vol → score 0 · 40%+ vol → score 10',
                        color: '#f59e0b',
                      },
                      {
                        label: 'Max Drawdown (35% weight)',
                        formula: 'Largest peak-to-trough NAV decline over full history',
                        scale: '0% drawdown → score 0 · 60%+ drawdown → score 10',
                        color: 'var(--red)',
                      },
                      {
                        label: 'Sharpe Penalty (30% weight)',
                        formula: '(Ann. return − 6.5% risk-free) ÷ Ann. volatility, then inverted',
                        scale: 'Sharpe ≥ 2 → score 0 · Sharpe ≤ 0 → score 10',
                        color: 'var(--indigo)',
                      },
                    ].map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.15)' }}>
                        <div style={{ width: 3, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{c.label}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 1 }}>{c.formula}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{c.scale}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
                    Source: standard risk metrics used by SEBI-registered risk profiling tools · risk-free rate = 6.5% (10Y G-Sec) ·
                    Sortino ratio also computed (downside vol only) but not included in composite score.
                  </p>
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th title="Annualised standard deviation of returns — how much the fund swings around its average. Higher = bumpier ride.">Volatility</th>
                    <th title="Maximum Drawdown — the worst peak-to-trough loss the fund has suffered. Tells you the deepest hole you'd have ridden through.">Max DD</th>
                    <th title="Sharpe Ratio — return earned per unit of risk taken. >1 is good, >2 is excellent, <0 means worse than risk-free.">Sharpe</th>
                    <th title="Composite risk-adjusted score built from Volatility, Drawdown and Sharpe. Higher is better.">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {riskFunds.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{(r.name || r.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}</td>
                      <td style={{ fontFamily: 'monospace' }}>{r.volatility_pct}%</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--red)', fontWeight: 600 }}>-{r.max_drawdown?.max_drawdown_pct}%</td>
                      <td style={{ fontFamily: 'monospace' }}>{r.sharpe_ratio}</td>
                      <td>
                        <span className={r.risk_score <= 3.5 ? 'badge-green' : r.risk_score <= 6.5 ? 'badge-yellow' : 'badge-red'}>
                          {r.risk_score}/10
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
                Click <strong>"How is Score calculated?"</strong> above for full methodology · Max drawdown peak/trough dates available in per-fund detail
              </p>
            </div>
          </div>

          {/* ── Counterfactual Comparison ── */}
          {perfFunds.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={14} style={{ color: 'var(--indigo)' }} /> Was It Worth It? — Counterfactual Analysis
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                  What would the same invested amount be worth if deployed in alternatives instead?
                  {niftyMultiplier === null && ' · Enable Nifty 50 benchmark above to see index comparison'}
                </p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>Invested</th>
                    <th>Your Fund</th>
                    {niftyMultiplier !== null && <th>Nifty 50 (same ₹)</th>}
                    <th>FD @ 7% (same ₹)</th>
                    {niftyMultiplier !== null && <th>Alpha vs Nifty</th>}
                  </tr>
                </thead>
                <tbody>
                  {perfFunds.map((f, i) => {
                    const invested = f.total_invested || 0;
                    const cur      = f.current_value  || 0;
                    // Holding years from purchase_date (same as tax calc)
                    const pd       = portfolio.find(p => p.scheme_code === f.scheme_code)?.purchase_date;
                    const yrs      = holdingYears(pd) ?? (period === '1Y' ? 1 : period === '2Y' ? 2 : period === '3Y' ? 3 : 5);
                    const niftyVal = niftyMultiplier !== null ? Math.round(invested * niftyMultiplier) : null;
                    const fdVal    = Math.round(invested * Math.pow(1.07, yrs));
                    const alpha    = niftyVal !== null ? cur - niftyVal : null;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{(f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}</td>
                        <td style={{ fontFamily: 'monospace' }}>{formatCurrency(invested)}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: cur >= invested ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(cur)}</td>
                        {niftyMultiplier !== null && (
                          <td style={{ fontFamily: 'monospace', color: 'var(--text-2)' }}>{formatCurrency(niftyVal)}</td>
                        )}
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-2)' }}>{formatCurrency(fdVal)}</td>
                        {alpha !== null && (
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: alpha >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {alpha >= 0 ? '+' : ''}{formatCurrency(alpha)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
                ⚠ Nifty 50 value assumes a lumpsum at period start (not SIP-matched) — a directional comparison, not a precise XIRR-to-XIRR comparison.
                FD at 7% annualised (approximate post-tax FD rate) · Holding period from purchase_date in Portfolio Builder.
              </p>
            </div>
          )}

          {/* Risk Score Bar Chart */}
          {riskFunds.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Risk Score Comparison</h3>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskFunds.map(r => ({
                    name: (r.name || r.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().split(' ').slice(0,2).join(' '),
                    score: r.risk_score,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }} />
                    <Bar dataKey="score" name="Risk Score" radius={[6, 6, 0, 0]}>
                      {riskFunds.map((r, i) => (
                        <Cell key={i} fill={r.risk_score <= 3.5 ? 'var(--green)' : r.risk_score <= 6.5 ? 'var(--amber)' : 'var(--red)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 1Y Rolling Returns Chart */}
          {growthData.length > 30 && (() => {
            const rollingData = computeRollingReturns(growthData, chartLines);
            if (rollingData.length < 5) return null;
            return (
              <div className="glass-card" style={{ padding: 22 }}>
                <div style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={14} style={{ color: 'var(--indigo)' }} /> 1-Year Rolling Returns
                  </h3>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                    Return over the trailing 12 months at each date — shows consistency of performance across different market cycles
                  </p>
                </div>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rollingData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                        formatter={(v, n) => [`${v}%`, n]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }} />
                      {/* Zero reference line */}
                      <Line type="monotone" dataKey={() => 0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" strokeWidth={1} dot={false} legendType="none" />
                      {chartLines.map(l => (
                        <Line key={l.key} type="monotone" dataKey={l.key} name={l.name}
                          stroke={l.color} strokeWidth={l.dash ? 1.5 : 2}
                          strokeDasharray={l.dash} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
                  Negative values indicate periods where a 12-month investment would have been in loss.
                  Higher and more consistent rolling returns indicate a more reliable fund.
                </p>
              </div>
            );
          })()}
        </>
      )}

      {/* ── Tax Tab ── */}
      {activeTab === 'tax' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Rule notice */}
          <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>🇮🇳 Equity MF Tax — Budget 2024</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11, color: 'var(--text-2)' }}>
              <div><span style={{ color: 'var(--red)', fontWeight: 600 }}>STCG (&lt;1 yr):</span> 20% flat + 4% cess</div>
              <div><span style={{ color: 'var(--green)', fontWeight: 600 }}>LTCG (≥1 yr):</span> 12.5% above ₹1.25L + 4% cess</div>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
              Holding periods from actual <strong>purchase dates</strong> in Portfolio Builder · ₹1.25L LTCG exemption applied portfolio-wide ·{' '}
              <a href="/tax" style={{ color: 'var(--indigo)' }}>Detailed Tax Calculator →</a>
            </p>
          </div>

          {/* Missing purchase date warning */}
          {missingDateCount > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={13} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--red)' }}>{missingDateCount} fund{missingDateCount > 1 ? 's' : ''} missing purchase date</strong> — defaulted to LTCG (conservative).
                Set a purchase date in the <a href="/portfolio" style={{ color: 'var(--indigo)' }}>Portfolio Builder</a> for accurate tax calculation. Marked with * below.
              </p>
            </div>
          )}

          {/* LTCG exemption banner */}
          {ltcgExemptUsed > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>🛡</span>
              <p style={{ fontSize: 11, color: 'var(--text-2)' }}>
                <strong style={{ color: 'var(--green)' }}>₹{ltcgExemptUsed.toLocaleString('en-IN')} LTCG exemption</strong> applied across all long-term gains
                {ltcgExemptUsed < 125000 && ` · ₹${(125000 - ltcgExemptUsed).toLocaleString('en-IN')} of the ₹1.25L annual exemption remaining`}
              </p>
            </div>
          )}

          {/* Tax KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="kpi-grid">
            {[
              { label: 'Total Gain', val: formatCurrency(totGain), color: totGain >= 0 ? 'var(--green)' : 'var(--red)' },
              { label: 'Estimated Tax', val: formatCurrency(totTax), color: 'var(--red)', sub: 'incl. 4% cess' },
              { label: 'Post-Tax Value', val: formatCurrency(totPostTax), color: 'var(--green)' },
            ].map((k, i) => (
              <div key={i} className="kpi-card" style={{ textAlign: 'left' }}>
                <p className="label-upper" style={{ marginBottom: 8 }}>{k.label}</p>
                <p className="stat-num" style={{ color: k.color }}>{k.val}</p>
                {k.sub && <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Per-fund tax table */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={14} style={{ color: 'var(--indigo)' }} /> Per-Fund Tax Breakdown
            </h3>
            <table className="data-table">
              <thead>
                <tr><th>Fund</th><th>Invested</th><th>Current</th><th>Gain</th><th>Regime</th><th>Tax</th><th>Post-Tax</th></tr>
              </thead>
              <tbody>
                {taxData.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <p style={{ fontWeight: 600, fontSize: 12 }}>{t.name}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                        {t.purchaseDate
                          ? <>Held since {new Date(t.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {formatHolding(t.holdingYrs)}</>
                          : <span style={{ color: 'var(--amber)' }}>⚠ No purchase date — assumed LTCG</span>
                        }
                      </p>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{formatCurrency(t.invested)}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatCurrency(t.current)}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: t.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(t.gain)}</td>
                    <td>
                      <span
                        className={t.regime.includes('LTCG') ? 'badge-green' : t.regime === 'STCG 20%' ? 'badge-red' : 'badge-yellow'}
                        style={{ fontSize: 10 }}
                      >
                        {t.regime}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--red)', fontWeight: 700 }}>{formatCurrency(t.taxLiability)}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>{formatCurrency(t.postTaxValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 700, fontSize: 12, textAlign: 'left', paddingLeft: 0, paddingTop: 12 }}>Total</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 800, color: totGain >= 0 ? 'var(--green)' : 'var(--red)', textAlign: 'right', paddingTop: 12 }}>{formatCurrency(totGain)}</td>
                  <td style={{ paddingTop: 12 }} />
                  <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--red)', textAlign: 'right', paddingTop: 12 }}>{formatCurrency(totTax)}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--green)', textAlign: 'right', paddingTop: 12 }}>{formatCurrency(totPostTax)}</td>
                </tr>
              </tfoot>
            </table>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
              * LTCG* = purchase date not set in Portfolio Builder; defaulted to LTCG (conservative estimate) ·
              Tax figures are estimates and include 4% health &amp; education cess · Consult a tax advisor for filing
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
