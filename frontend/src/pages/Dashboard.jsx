import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, TrendingDown, IndianRupee, Shield,
  BarChart3, Zap, RefreshCw, ArrowUpRight, ArrowDownRight, Briefcase,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RPie, Pie, Cell,
} from 'recharts';
import { getNavHistory, analyzePerformance, analyzeRisk, generateInsights } from '../services/api';
import { formatCurrency, formatPercent, CHART_COLORS } from '../utils/formatters';
import { usePortfolio } from '../hooks/usePortfolio';
import { useAuth } from '../contexts/auth';

// ── Derived short name ──
const shortName = (name) => name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim();

// ── Pie label ──
const RADIAN = Math.PI / 180;
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.07) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ── KPI Card ──
function KPI({ icon, label, value, sub, accent, color }) {
  const Icon = icon;
  const accentMap = {
    green: { bg: 'var(--green-bg)', text: 'var(--green)', border: 'var(--green-border)' },
    red: { bg: 'var(--red-bg)', text: 'var(--red)', border: 'var(--red-border)' },
    blue: { bg: 'var(--blue-bg)', text: 'var(--blue)', border: 'var(--blue-border)' },
    amber: { bg: 'var(--amber-bg)', text: 'var(--amber)', border: 'var(--amber-border)' },
    indigo: { bg: 'rgba(99,102,241,0.1)', text: 'var(--indigo)', border: 'rgba(99,102,241,0.2)' },
  };
  const a = accentMap[color] || accentMap.indigo;

  return (
    <div className="kpi-card animate-slide-up" style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="label-upper">{label}</span>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: a.bg, border: `1px solid ${a.border}`,
        }}>
          {Icon && <Icon size={16} style={{ color: a.text }} />}
        </div>
      </div>
      <p className="stat-num" style={{ color: 'var(--text-1)' }}>{value}</p>
      {sub && (
        <p style={{ fontSize: 11, marginTop: 6, color: sub.startsWith('+') ? 'var(--green)' : sub.startsWith('-') ? 'var(--red)' : 'var(--text-3)', fontWeight: 600 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const portfolio                      = usePortfolio();
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [perfData, setPerfData]       = useState(null);
  const [riskData, setRiskData]       = useState(null);
  const [navChartData, setNavChartData] = useState([]); // normalized multi-fund
  const [navChartLines, setNavChartLines] = useState([]); // [{key, color}]
  const [selectedNavCode, setSelectedNavCode] = useState(null);
  const [insights, setInsights]       = useState([]);
  const { user }                      = useAuth();
  const displayName                   = user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
    : 'your';

  // Track last-fetched portfolio fingerprint so we don't re-fetch when only
  // the array reference changes (e.g. every savePortfolio call re-creates the array)
  const lastFetchedKey = useRef(null);

  useEffect(() => {
    const key = JSON.stringify(portfolio.map(f => ({ c: f.scheme_code, a: f.investment_amount, s: f.monthly_sip, d: f.purchase_date })));
    if (key === lastFetchedKey.current) return;
    lastFetchedKey.current = key;
    loadDashboard(portfolio);
  }, [portfolio]);

  async function loadDashboard(funds) {
    if (!funds || funds.length === 0) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [perfResp, riskResp] = await Promise.all([
        analyzePerformance({ funds, mode: 'sip' }),
        analyzeRisk({ funds }),
      ]);
      const perf = perfResp.data;
      setPerfData(perf);
      setRiskData(riskResp.data);

      // NAV charts — load ALL portfolio funds, normalize to base-100
      const navFetches = funds.map(f => getNavHistory(f.scheme_code, '3Y').catch(() => null));
      const navResps = await Promise.all(navFetches);

      const allDates = {};
      const lines = [];
      navResps.forEach((resp, i) => {
        if (!resp?.data?.nav_data?.length) return;
        const pts = resp.data.nav_data;
        const base = pts[0]?.nav || 1;
        const step = Math.max(1, Math.floor(pts.length / 100));
        const label = shortName(funds[i]?.name || funds[i]?.scheme_code || '');
        lines.push({ key: label, color: CHART_COLORS[i % CHART_COLORS.length], code: funds[i].scheme_code });
        pts.forEach((p, j) => {
          if (j % step !== 0 && j !== pts.length - 1) return;
          if (!allDates[p.date]) allDates[p.date] = { date: p.date };
          allDates[p.date][label] = parseFloat(((p.nav / base) * 100).toFixed(2));
        });
      });
      const sortedDates = Object.values(allDates).sort((a, b) => a.date.localeCompare(b.date));
      setNavChartData(sortedDates);
      setNavChartLines(lines);
      setSelectedNavCode(null); // default to "All" so every fund line is visible

      // Insights — pass real current_value
      const fundPerfMap = {};
      (perf.funds || []).forEach(f => { fundPerfMap[f.scheme_code] = f.current_value ?? f.total_invested ?? 0; });
      const totalCurrent = perf.portfolio_summary?.current_value || 1;

      const insResp = await generateInsights({
        funds: funds.map(f => ({
          ...f,
          weight: (fundPerfMap[f.scheme_code] || f.investment_amount) / totalCurrent,
          invested: f.investment_amount,
          current_value: fundPerfMap[f.scheme_code] || f.investment_amount,
        })),
      });
      setInsights(insResp.data.insights || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  function refresh() { loadDashboard(portfolio); }

  const summary  = perfData?.portfolio_summary || {};
  const perfFunds = perfData?.funds || [];
  const latestNavDate = navChartData.length > 0 ? navChartData[navChartData.length - 1]?.date : null;
  const riskFunds = riskData?.fund_risks || [];
  const avgRisk   = riskFunds.length
    ? (riskFunds.reduce((s, r) => s + (r.risk_score || 0), 0) / riskFunds.length)
    : null;

  const allocationData = perfFunds.length
    ? perfFunds.map((f, i) => ({
        name: shortName(f.name || portfolio.find(p => String(p.scheme_code) === String(f.scheme_code))?.name || f.scheme_code),
        value: f.current_value || f.total_invested || 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))
    : portfolio.map((f, i) => ({
        name: shortName(f.name),
        value: f.investment_amount || 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

  if (!loading && portfolio.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="animate-fade-in" style={{ textAlign: 'center' }}>
        <Briefcase size={52} style={{ margin: '0 auto 18px', opacity: 0.18, display: 'block' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No funds in your portfolio</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 22 }}>
          Add funds in Portfolio Builder to see your dashboard analytics.
        </p>
        <a href="/portfolio" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
          Go to Portfolio Builder
        </a>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="animate-fade-in" style={{ textAlign: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', margin: '0 auto 18px',
          border: '2px solid rgba(99,102,241,0.2)',
          borderTop: '2px solid #6366f1',
          animation: 'spinRing 0.9s linear infinite',
        }} />
        <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Loading portfolio data…</p>
        <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>
          Fetching NAV history for {portfolio.length || '…'} funds
        </p>
      </div>
    </div>
  );

  // ── Editorial hero copy ──
  const today = new Date();
  const dateLine = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const navDateLine = latestNavDate
    ? new Date(latestNavDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const ret = summary.absolute_return_pct || 0;
  const isUp = ret >= 0;
  const heroEyebrow = isUp ? 'SINCE INVESTMENT' : 'A ROUGH PATCH';
  const heroHeadline = isUp
    ? <>Your portfolio is <span className="headline-serif-italic" style={{ color: 'var(--green)' }}>up</span></>
    : <>Your portfolio is <span className="headline-serif-italic" style={{ color: 'var(--red)' }}>down</span></>;
  const heroSubline = isUp
    ? `${ret.toFixed(1)}% gain on what you've put in while you weren't looking.`
    : `${Math.abs(ret).toFixed(1)}% off your invested capital — markets have wobbled.`;

  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ── Editorial Masthead ── */}
      <div style={{ paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <p className="eyebrow">The Portfolio Edit</p>
          <button onClick={refresh} disabled={loading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="dateline" style={{ marginTop: 4 }}>
          {dateLine} · {user?.username ? `${displayName}'s portfolio` : 'Local portfolio'}
          {navDateLine && <span style={{ color: 'var(--text-3)', fontStyle: 'normal', fontSize: 11 }}> &nbsp;·&nbsp; NAV as of {navDateLine}</span>}
        </p>
        <div className="editorial-rule" />

        {/* ── Hero ── */}
        <p className="eyebrow" style={{ color: 'var(--amber)', marginBottom: 14 }}>◆ {heroEyebrow}</p>
        <h1 className="headline-serif" style={{ fontSize: 'clamp(40px, 6vw, 76px)' }}>
          {heroHeadline}
        </h1>
        <p className="headline-serif" style={{ fontSize: 'clamp(20px, 2.4vw, 32px)', color: 'var(--text-2)', marginTop: 8, fontWeight: 400 }}>
          {heroSubline}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 18, fontStyle: 'italic' }}>
          {greeting}{user?.username ? `, ${displayName}` : ''}.
        </p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '14px 18px', borderColor: 'var(--red-border)', background: 'var(--red-bg)' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error} — make sure the backend server is running</p>
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-4 gap-4 kpi-grid">
        <KPI icon={IndianRupee} label="Total Invested"  value={formatCurrency(summary.total_invested)}  sub={`${portfolio.length} ${portfolio.length === 1 ? 'fund' : 'funds'}`}               color="indigo" />
        <KPI icon={TrendingUp}  label="Current Value"   value={formatCurrency(summary.current_value)}   sub={formatPercent(summary.absolute_return_pct)} color={summary.gain_loss >= 0 ? 'green' : 'red'} accent />
        <KPI icon={summary.gain_loss >= 0 ? ArrowUpRight : ArrowDownRight} label="Total Gain / Loss"
          value={(summary.gain_loss < 0 ? '− ' : '+ ') + formatCurrency(Math.abs(summary.gain_loss ?? 0))}
          sub={summary.gain_loss >= 0 ? 'Profit' : 'Loss'}
          color={summary.gain_loss >= 0 ? 'green' : 'red'}
        />
        <KPI icon={Shield} label="Avg Risk Score"
          value={avgRisk ? `${avgRisk.toFixed(1)} / 10` : '—'}
          sub={avgRisk ? (avgRisk <= 3.5 ? 'Low Risk' : avgRisk <= 6.5 ? 'Moderate' : 'High Risk') : ''}
          color={avgRisk ? (avgRisk <= 3.5 ? 'green' : avgRisk <= 6.5 ? 'amber' : 'red') : 'indigo'}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-3 gap-4 chart-grid">
        {/* NAV Chart — all funds, normalized */}
        <div className="glass-card col-span-2" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700 }}>3-Year Normalized Growth</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Base = ₹100 at start · all portfolio funds compared</p>
            </div>
            {/* Fund selector pills */}
            {navChartLines.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  onClick={() => setSelectedNavCode(null)}
                  style={{
                    padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.14s',
                    background: selectedNavCode === null ? 'var(--grad)' : 'rgba(99,102,241,0.07)',
                    color: selectedNavCode === null ? '#fff' : 'var(--text-3)',
                  }}
                >All</button>
                {navChartLines.map(l => (
                  <button key={l.code}
                    onClick={() => setSelectedNavCode(prev => prev === l.code ? null : l.code)}
                    style={{
                      padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.14s',
                      background: selectedNavCode === l.code ? l.color : 'rgba(99,102,241,0.07)',
                      color: selectedNavCode === l.code ? '#fff' : 'var(--text-3)',
                    }}
                  >{l.key.split(' ').slice(0, 2).join(' ')}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={navChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => v} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                  formatter={(v, n) => [`${parseFloat(v).toFixed(1)} (base 100)`, n]}
                />
                {navChartLines
                  .filter(l => selectedNavCode === null || l.code === selectedNavCode)
                  .map(l => (
                    <Line key={l.key} type="monotone" dataKey={l.key}
                      stroke={l.color} strokeWidth={selectedNavCode === null ? 2 : 2.5}
                      dot={false} connectNulls
                      strokeOpacity={selectedNavCode && selectedNavCode !== l.code ? 0.2 : 1}
                    />
                  ))
                }
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
            Click a fund pill to isolate it · all values normalised so different-priced funds are directly comparable
          </p>
        </div>

        {/* Allocation Pie */}
        <div className="glass-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700 }}>Allocation</h3>
            <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>By Value</span>
          </div>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RPie>
                <Pie data={allocationData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" labelLine={false} label={PieLabel}>
                  {allocationData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
              </RPie>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allocationData.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: f.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-2)', fontWeight: 600, fontSize: 11 }}>{formatCurrency(f.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fund Table + Insights ── */}
      <div className="grid grid-cols-3 gap-4 chart-grid">
        {/* Performance Table */}
        <div className="glass-card col-span-2" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Fund Performance</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Invested</th>
                <th>Current</th>
                <th>Return</th>
                <th>XIRR</th>
              </tr>
            </thead>
            <tbody>
              {perfFunds.map((fund, i) => {
                const isActual = fund.data_source === 'actual_transactions';
                return (
                  <tr key={i}>
                    <td>
                      <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 12 }}>{shortName(fund.name || fund.scheme_code)}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{portfolio.find(p => String(p.scheme_code) === String(fund.scheme_code))?.category}</p>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{formatCurrency(fund.total_invested)}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>{formatCurrency(fund.current_value)}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: fund.absolute_return >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatPercent(fund.absolute_return)}</td>
                    <td>
                      <p style={{ fontFamily: 'monospace', fontWeight: 700, color: (fund.xirr_pct ?? fund.cagr ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fund.xirr_pct != null ? formatPercent(fund.xirr_pct) : (fund.cagr ? formatPercent(fund.cagr) : '—')}
                      </p>
                      <p style={{ fontSize: 9, color: isActual ? 'var(--green)' : 'var(--text-3)', marginTop: 2, fontWeight: isActual ? 700 : 400 }}>
                        {isActual ? `✓ ${fund.transaction_count} actual txns` : '~ estimated SIP'}
                      </p>
                    </td>
                  </tr>
                );
              })}
              {perfFunds.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>No data — ensure backend is running</td></tr>
              )}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 12 }}>
            ✓ = XIRR from actual logged transactions · ~ = estimated from regular monthly SIP assumption.{' '}
            <a href="/portfolio" style={{ color: 'var(--indigo)', textDecoration: 'none' }}>Log actual transactions</a> for precision.
          </p>
        </div>

        {/* Insights */}
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={14} style={{ color: 'var(--amber)' }} /> Portfolio Insights
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.slice(0, 5).map((ins, i) => {
              const cfg = {
                critical: { bg: 'var(--red-bg)', border: 'var(--red-border)', icon: '🔴' },
                warning:  { bg: 'var(--amber-bg)', border: 'var(--amber-border)', icon: '🟡' },
                info:     { bg: 'var(--blue-bg)', border: 'var(--blue-border)', icon: '🔵' },
                tip:      { bg: 'var(--green-bg)', border: 'var(--green-border)', icon: '💡' },
              };
              const c = cfg[ins.severity] || cfg.info;
              return (
                <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: c.bg, border: `1px solid ${c.border}` }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>
                    {c.icon} {ins.title}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{ins.description}</p>
                </div>
              );
            })}
            {insights.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No insights yet — load portfolio data first.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Risk Cards ── */}
      {riskFunds.length > 0 && (
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 18 }}>Risk Analysis</h3>
          <div className="grid grid-cols-3 gap-4 risk-grid" style={{ gridTemplateColumns: `repeat(${Math.min(riskFunds.length, 4)}, 1fr)` }}>
            {riskFunds.map((r, i) => (
              <div key={i} style={{ padding: 16, borderRadius: 12, background: 'rgba(99,102,241,0.03)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>{shortName(r.name || r.scheme_code)}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                    <svg width={52} height={52} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx={18} cy={18} r={15.915} fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth={3} />
                      <circle cx={18} cy={18} r={15.915} fill="none"
                        stroke={r.risk_score <= 3.5 ? 'var(--green)' : r.risk_score <= 6.5 ? 'var(--amber)' : 'var(--red)'}
                        strokeWidth={3}
                        strokeDasharray={`${r.risk_score * 10} 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'monospace' }}>
                      {r.risk_score}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.risk_score <= 3.5 ? 'var(--green)' : r.risk_score <= 6.5 ? 'var(--amber)' : 'var(--red)' }}>
                      {r.risk_category} Risk
                    </span>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Sharpe: {r.sharpe_ratio}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                  <div style={{ color: 'var(--text-3)' }}>Volatility<br /><span style={{ fontFamily: 'monospace', color: 'var(--text-2)', fontWeight: 600 }}>{r.volatility_pct}%</span></div>
                  <div style={{ color: 'var(--text-3)' }}>Max Drawdown<br /><span style={{ fontFamily: 'monospace', color: 'var(--red)', fontWeight: 600 }}>-{r.max_drawdown?.max_drawdown_pct}%</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
