/**
 * SWP.jsx — Systematic Withdrawal Plan Calculator
 * Goes beyond Groww by adding:
 *   - Sustainability indicator (how long the corpus lasts at given rate)
 *   - Year-by-year depletion table + chart
 *   - Inflation adjustment toggle (real vs nominal)
 *   - Tax impact (STCG/LTCG with ₹1.25L exemption)
 *   - Backtest mode: simulate against a real fund's historical NAV
 *   - FD comparison
 */
import { useState, useMemo, useEffect } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { Banknote, TrendingDown, AlertTriangle, Info, Percent, Calendar, Activity, Sparkles } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { usePortfolio } from '../hooks/usePortfolio';
import { getNavHistory } from '../services/api';

// ── Core SWP math ────────────────────────────────────────────────────────
function simulateSWP({ corpus, monthlyWithdraw, annualReturnPct, years, inflationPct = 0 }) {
  const months = years * 12;
  const monthlyRate = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const monthlyInflation = inflationPct > 0 ? Math.pow(1 + inflationPct / 100, 1 / 12) - 1 : 0;

  const yearly = [];
  let balance = corpus;
  let totalWithdrawn = 0;
  let withdraw = monthlyWithdraw;
  let depletedAtMonth = null;

  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate);
    if (balance >= withdraw) {
      balance -= withdraw;
      totalWithdrawn += withdraw;
    } else {
      totalWithdrawn += balance;
      balance = 0;
      if (depletedAtMonth === null) depletedAtMonth = m;
      break;
    }
    if (monthlyInflation > 0) withdraw *= 1 + monthlyInflation;
    if (m % 12 === 0) {
      yearly.push({
        year: m / 12,
        balance: Math.round(balance),
        totalWithdrawn: Math.round(totalWithdrawn),
        currentWithdraw: Math.round(withdraw),
      });
    }
  }

  // sustainability — how many years until corpus would run out (extrapolated)
  let sustainabilityYears;
  if (depletedAtMonth !== null) {
    sustainabilityYears = +(depletedAtMonth / 12).toFixed(1);
  } else {
    // simulate longer to find depletion (cap at 100yrs)
    let bal = corpus, w = monthlyWithdraw, m = 0;
    while (bal > 0 && m < 1200) {
      bal = bal * (1 + monthlyRate);
      if (bal >= w) bal -= w; else { bal = 0; break; }
      if (monthlyInflation > 0) w *= 1 + monthlyInflation;
      m++;
    }
    sustainabilityYears = m >= 1200 ? Infinity : +(m / 12).toFixed(1);
  }

  return {
    finalBalance: Math.round(balance),
    totalWithdrawn: Math.round(totalWithdrawn),
    yearly,
    sustainabilityYears,
    depletedEarly: depletedAtMonth !== null,
  };
}

function calcLTCG_tax({ totalWithdrawn, totalInvested }) {
  // Approximate: assume withdrawals are proportionally gain + principal
  // Gain on each withdrawal = (withdraw_amount × (1 - principal_ratio))
  // For simplicity, total gain = totalWithdrawn - portion of original invested
  // We use a blended LTCG rate of 12.5% after ₹1.25L exemption per year
  // This is an approximation — actual tax depends on FIFO unit allocation
  const ltcgRate = 0.125;
  const cess = 0.04;
  const exemption = 125000;
  // Conservative: assume 1/3 of each withdrawal is gain (varies with returns)
  const estimatedGain = Math.max(0, totalWithdrawn - totalInvested);
  if (estimatedGain <= exemption) return 0;
  return Math.round((estimatedGain - exemption) * ltcgRate * (1 + cess));
}

// ── Slider component ─────────────────────────────────────────────────────
function Slider({ label, value, onChange, min, max, step, unit, format }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{label}</label>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 8, padding: '5px 12px', minWidth: 110, justifyContent: 'flex-end',
        }}>
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{unit}</span>
          <input
            type="number" value={value}
            onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
            min={min} max={max} step={step}
            style={{
              width: 80, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--green)', fontWeight: 700, fontSize: 13, textAlign: 'right',
              fontFamily: 'monospace',
            }}
          />
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--green)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{format ? format(min) : min}</span>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function SWP() {
  const portfolio = usePortfolio();
  const [corpus, setCorpus]                 = useState(5_00_000);
  const [monthlyWithdraw, setMonthlyWithdraw] = useState(10_000);
  const [annualReturn, setAnnualReturn]     = useState(12);
  const [years, setYears]                   = useState(10);

  const [inflationOn, setInflationOn]       = useState(false);
  const [inflationPct, setInflationPct]     = useState(6);
  const [taxOn, setTaxOn]                   = useState(false);
  const [backtestFundCode, setBacktestFundCode] = useState('');
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  // ── Live SWP simulation ──
  const sim = useMemo(() => simulateSWP({
    corpus,
    monthlyWithdraw,
    annualReturnPct: annualReturn,
    years,
    inflationPct: inflationOn ? inflationPct : 0,
  }), [corpus, monthlyWithdraw, annualReturn, years, inflationOn, inflationPct]);

  const ltcgTax = taxOn ? calcLTCG_tax({ totalWithdrawn: sim.totalWithdrawn, totalInvested: corpus }) : 0;

  // ── FD comparison ──
  const fdSim = useMemo(() => simulateSWP({
    corpus, monthlyWithdraw, annualReturnPct: 7, years,
    inflationPct: inflationOn ? inflationPct : 0,
  }), [corpus, monthlyWithdraw, years, inflationOn, inflationPct]);

  // ── Backtest against a real fund ──
  async function runBacktest() {
    if (!backtestFundCode) return;
    setBacktestLoading(true);
    try {
      const r = await getNavHistory(backtestFundCode);
      const navs = (r.data?.nav_data || []).map(p => ({ date: p.date, nav: parseFloat(p.nav) }))
        .filter(p => !isNaN(p.nav)).sort((a, b) => a.date.localeCompare(b.date));
      if (navs.length < 250) {
        setBacktestResult({ error: 'Need at least ~1 year of NAV history.' });
        return;
      }
      // Take last `years` years of NAV, simulate SWP using daily returns
      const cutoff = new Date(navs[navs.length - 1].date);
      cutoff.setFullYear(cutoff.getFullYear() - years);
      const window = navs.filter(p => new Date(p.date) >= cutoff);
      if (window.length < 100) {
        setBacktestResult({ error: 'Insufficient historical data for the chosen period.' });
        return;
      }
      // Build month-end NAV list
      const monthly = [];
      let curMonth = window[0].date.slice(0, 7);
      let last = window[0];
      for (const p of window) {
        if (p.date.slice(0, 7) !== curMonth) {
          monthly.push(last);
          curMonth = p.date.slice(0, 7);
        }
        last = p;
      }
      monthly.push(last);

      // Units-based simulation
      let units = corpus / monthly[0].nav;
      let bal = units * monthly[0].nav;
      const path = [{ month: 0, balance: bal, date: monthly[0].date }];
      let totalWith = 0;
      let depleted = null;
      let w = monthlyWithdraw;
      const monthlyInfl = inflationOn ? Math.pow(1 + inflationPct / 100, 1 / 12) - 1 : 0;
      for (let i = 1; i < monthly.length; i++) {
        bal = units * monthly[i].nav;
        if (bal >= w) {
          const sellUnits = w / monthly[i].nav;
          units -= sellUnits;
          bal = units * monthly[i].nav;
          totalWith += w;
        } else {
          totalWith += bal;
          units = 0; bal = 0;
          if (depleted === null) depleted = i;
          break;
        }
        if (monthlyInfl) w *= 1 + monthlyInfl;
        path.push({ month: i, balance: Math.round(bal), date: monthly[i].date });
      }
      setBacktestResult({
        path,
        finalBalance: Math.round(bal),
        totalWithdrawn: Math.round(totalWith),
        depleted: depleted !== null,
        depletedAfterMonths: depleted,
        startDate: window[0].date,
        endDate: window[window.length - 1].date,
      });
    } catch (e) {
      setBacktestResult({ error: e.response?.data?.detail || e.message });
    } finally {
      setBacktestLoading(false);
    }
  }

  // ── Sustainability badge ──
  const sustainability = sim.sustainabilityYears;
  let sustBadge;
  if (sustainability === Infinity) {
    sustBadge = { color: 'var(--green)', bg: 'rgba(34,197,94,0.10)', label: 'Perpetual', desc: 'Returns exceed withdrawals — corpus grows indefinitely' };
  } else if (sustainability >= 30) {
    sustBadge = { color: 'var(--green)', bg: 'rgba(34,197,94,0.10)', label: `${sustainability}+ years`, desc: 'Sustainable for an entire retirement' };
  } else if (sustainability >= 15) {
    sustBadge = { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', label: `${sustainability} years`, desc: 'Manageable but plan for the long term' };
  } else if (sustainability >= 5) {
    sustBadge = { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: `${sustainability} years`, desc: 'Short runway — consider reducing withdrawals' };
  } else {
    sustBadge = { color: 'var(--red)', bg: 'rgba(239,68,68,0.10)', label: `${sustainability} years`, desc: 'Corpus will run out very quickly' };
  }

  const chartData = sim.yearly.map(y => ({
    year: `Y${y.year}`,
    Balance: y.balance,
    Withdrawn: y.totalWithdrawn,
  }));

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Banknote size={22} style={{ color: 'var(--green)' }} />
          SWP Calculator
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Plan your retirement withdrawals — with sustainability analysis, inflation adjustment, tax impact, and real-fund backtesting.
        </p>
      </div>

      {/* ── Sliders + Live Result ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <Slider
            label="Total Investment" value={corpus} onChange={setCorpus}
            min={50000} max={50000000} step={10000} unit="₹"
            format={v => formatCurrency(v)}
          />
          <Slider
            label="Withdrawal per Month" value={monthlyWithdraw} onChange={setMonthlyWithdraw}
            min={500} max={500000} step={500} unit="₹"
            format={v => formatCurrency(v)}
          />
          <Slider
            label="Expected Return Rate (p.a.)" value={annualReturn} onChange={setAnnualReturn}
            min={1} max={25} step={0.5} unit="%"
          />
          <Slider
            label="Time Period" value={years} onChange={setYears}
            min={1} max={40} step={1} unit="Yr"
          />

          {/* Inflation toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px',
            background: inflationOn ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${inflationOn ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
            borderRadius: 10, marginTop: 14,
          }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingDown size={13} /> Inflation Adjustment
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Increase withdrawal each month to maintain purchasing power</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {inflationOn && (
                <input type="number" min={1} max={15} step={0.5} value={inflationPct}
                  onChange={e => setInflationPct(Math.max(1, Math.min(15, Number(e.target.value) || 6)))}
                  style={{ width: 50, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 6, padding: '4px 6px', color: 'var(--indigo)', fontSize: 11, fontWeight: 700, textAlign: 'center' }} />
              )}
              {inflationOn && <span style={{ fontSize: 10, color: 'var(--indigo)', fontWeight: 700 }}>%</span>}
              <button onClick={() => setInflationOn(v => !v)} style={{
                padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: inflationOn ? 'var(--indigo)' : 'rgba(255,255,255,0.05)',
                color: inflationOn ? '#fff' : 'var(--text-3)', fontSize: 10, fontWeight: 700,
              }}>{inflationOn ? 'ON' : 'OFF'}</button>
            </div>
          </div>

          {/* Tax toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px',
            background: taxOn ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${taxOn ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
            borderRadius: 10, marginTop: 10,
          }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Percent size={13} /> Show Tax Impact (LTCG)
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-3)' }}>12.5% after ₹1.25L exemption (Budget 2024)</p>
            </div>
            <button onClick={() => setTaxOn(v => !v)} style={{
              padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: taxOn ? '#f59e0b' : 'rgba(255,255,255,0.05)',
              color: taxOn ? '#fff' : 'var(--text-3)', fontSize: 10, fontWeight: 700,
            }}>{taxOn ? 'ON' : 'OFF'}</button>
          </div>
        </div>

        {/* ── Live Result Card ── */}
        <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="label-upper" style={{ marginBottom: 0 }}>Plan Summary</p>

          {/* Sustainability Banner */}
          <div style={{ padding: '14px 16px', borderRadius: 12, background: sustBadge.bg, border: `1px solid ${sustBadge.color}40` }}>
            <p style={{ fontSize: 10, color: sustBadge.color, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Corpus lasts
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color: sustBadge.color, fontFamily: 'monospace' }}>{sustBadge.label}</p>
            <p style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{sustBadge.desc}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label-upper" style={{ marginBottom: 4 }}>Total Withdrawn</p>
              <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)' }}>{formatCurrency(sim.totalWithdrawn)}</p>
            </div>
            <div>
              <p className="label-upper" style={{ marginBottom: 4 }}>Final Balance</p>
              <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: sim.finalBalance > corpus ? 'var(--green)' : sim.finalBalance > 0 ? 'var(--text-1)' : 'var(--red)' }}>
                {formatCurrency(sim.finalBalance)}
              </p>
            </div>
          </div>

          {taxOn && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, marginBottom: 3 }}>Estimated LTCG Tax</p>
              <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#f59e0b' }}>{formatCurrency(ltcgTax)}</p>
              <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>Approximation — actual tax depends on FIFO unit allocation</p>
            </div>
          )}

          {/* FD comparison */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p style={{ fontSize: 10, color: 'var(--indigo)', fontWeight: 700, marginBottom: 6 }}>VS. FD @ 7%</p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>FD lasts</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>
                {fdSim.sustainabilityYears === Infinity ? 'Perpetual' : `${fdSim.sustainabilityYears} yrs`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>FD final balance</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{formatCurrency(fdSim.finalBalance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Depletion Chart ── */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} /> Corpus Depletion Over Time
        </h3>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
              <XAxis dataKey="year" tick={{ fill: '#5a5a6e', fontSize: 10 }} />
              <YAxis tick={{ fill: '#5a5a6e', fontSize: 10 }} tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }}
                formatter={v => formatCurrency(v)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Balance" stroke="#22c55e" strokeWidth={2.5} fill="url(#balGrad)" />
              <Line type="monotone" dataKey="Withdrawn" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <ReferenceLine y={0} stroke="rgba(239,68,68,0.4)" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Year-by-Year Table ── */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Year-by-Year Breakdown</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left',  padding: '8px 10px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>Year</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>Remaining Balance</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>Cumulative Withdrawn</th>
                {inflationOn && <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>Monthly Withdrawal</th>}
              </tr>
            </thead>
            <tbody>
              {sim.yearly.map(y => (
                <tr key={y.year} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--text-1)', fontWeight: 600 }}>Year {y.year}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: y.balance > 0 ? 'var(--text-1)' : 'var(--red)' }}>{formatCurrency(y.balance)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)' }}>{formatCurrency(y.totalWithdrawn)}</td>
                  {inflationOn && <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--indigo)' }}>{formatCurrency(y.currentWithdraw)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sim.depletedEarly && (
          <p style={{ marginTop: 12, fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={12} /> Corpus depleted before the chosen time period.
          </p>
        )}
      </div>

      {/* ── Backtest mode ── */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={14} style={{ color: 'var(--indigo)' }} /> Backtest Against a Real Fund
        </h3>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
          Replay your SWP using a fund's actual historical NAV data — see how it would have *really* performed.
        </p>
        {portfolio.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px dashed var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Add funds in Portfolio Builder to enable backtesting.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={backtestFundCode} onChange={e => setBacktestFundCode(e.target.value)} className="select-field" style={{ flex: 1 }}>
              <option value="">Select a fund…</option>
              {portfolio.map(f => <option key={f.scheme_code} value={f.scheme_code}>{f.name || f.scheme_code}</option>)}
            </select>
            <button onClick={runBacktest} disabled={!backtestFundCode || backtestLoading} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
              {backtestLoading ? 'Running…' : 'Run Backtest'}
            </button>
          </div>
        )}
        {backtestResult?.error && (
          <p style={{ marginTop: 12, fontSize: 11, color: 'var(--red)' }}>⚠️ {backtestResult.error}</p>
        )}
        {backtestResult?.path && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
              <div>
                <p className="label-upper">Period</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{backtestResult.startDate} → {backtestResult.endDate}</p>
              </div>
              <div>
                <p className="label-upper">Actual Final Balance</p>
                <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: backtestResult.finalBalance > 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(backtestResult.finalBalance)}</p>
              </div>
              <div>
                <p className="label-upper">Total Withdrawn</p>
                <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{formatCurrency(backtestResult.totalWithdrawn)}</p>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={backtestResult.path}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: '#5a5a6e', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#5a5a6e', fontSize: 10 }} tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }} formatter={v => formatCurrency(v)} />
                  <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={false} name="Backtested Balance" />
                  <ReferenceLine y={0} stroke="rgba(239,68,68,0.4)" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {backtestResult.depleted && (
              <p style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>
                ⚠️ Corpus depleted in this backtest period — real returns underperformed the assumed rate.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.20)' }}>
        <p style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: '#f59e0b' }} />
          <span>
            SWP returns vary with market conditions. The "expected return" assumes a constant rate — real fund returns are volatile and may deviate significantly.
            Use the <strong>Backtest</strong> feature to see how a real fund's historical NAV would have performed under this plan.
          </span>
        </p>
      </div>
    </div>
  );
}
