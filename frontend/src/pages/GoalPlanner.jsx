import { useState, useMemo } from 'react';
import { Target, TrendingUp, Calculator, Info, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatCurrency } from '../utils/formatters';

function calcSIPRequired(targetAmount, annualReturn, years) {
  const r = annualReturn / 100 / 12;
  const n = years * 12;
  if (r === 0) return targetAmount / n;
  const fvFactor = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  return targetAmount / fvFactor;
}

function calcSIPCorpus(monthlySIP, annualReturn, years) {
  const r = annualReturn / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlySIP * n;
  return monthlySIP * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

function fvLumpsum(principal, annualReturn, years) {
  return principal * Math.pow(1 + annualReturn / 100, years);
}

function buildGrowthCurve(monthlySIP, annualReturn, years, existingCorpus) {
  const data = [];
  for (let y = 0; y <= years; y++) {
    const sipCorpus  = calcSIPCorpus(monthlySIP, annualReturn, y);
    const invested   = monthlySIP * 12 * y;
    const corpusGrowth = fvLumpsum(existingCorpus, annualReturn, y);
    const total      = sipCorpus + corpusGrowth;
    data.push({
      year: `Yr ${y}`,
      corpus: Math.round(total),
      sipOnly: Math.round(sipCorpus),
      existingGrowth: Math.round(corpusGrowth),
      invested: Math.round(invested + existingCorpus),
    });
  }
  return data;
}

const GOAL_PRESETS = [
  { label: '🏠 Home Down Payment', amount: 2500000, years: 5 },
  { label: '🎓 Child Education',   amount: 5000000, years: 10 },
  { label: '✈️ Dream Vacation',    amount: 500000,  years: 3 },
  { label: '🛡️ Emergency Fund',   amount: 1000000, years: 2 },
  { label: '🏖️ Early Retirement', amount: 30000000, years: 20 },
  { label: '🚗 Car Purchase',      amount: 1500000, years: 4 },
];

export default function GoalPlanner() {
  const [mode, setMode]                 = useState('reverse');
  const [targetAmount, setTargetAmount] = useState(2500000);
  const [years, setYears]               = useState(5);
  const [annualReturn, setAnnualReturn] = useState(12);
  const [monthlySIP, setMonthlySIP]     = useState(10000);
  const [inflationRate, setInflationRate] = useState(6);
  const [existingCorpus, setExistingCorpus] = useState(0);
  const [showInflation, setShowInflation] = useState(false);

  // Inflation-adjusted target (today's ₹ target in future rupees)
  const realTarget = useMemo(() =>
    targetAmount * Math.pow(1 + inflationRate / 100, years),
    [targetAmount, inflationRate, years]
  );

  // Future value of existing corpus at given return
  const fvExisting = useMemo(() =>
    fvLumpsum(existingCorpus, annualReturn, years),
    [existingCorpus, annualReturn, years]
  );

  // Effective target for SIP = inflation-adjusted target minus existing corpus FV
  const effectiveTarget = useMemo(() => {
    const base = showInflation ? realTarget : targetAmount;
    return Math.max(0, base - fvExisting);
  }, [showInflation, realTarget, targetAmount, fvExisting]);

  const sipRequired   = useMemo(() => calcSIPRequired(effectiveTarget, annualReturn, years), [effectiveTarget, annualReturn, years]);
  const corpus        = useMemo(() => calcSIPCorpus(monthlySIP, annualReturn, years) + fvExisting, [monthlySIP, annualReturn, years, fvExisting]);

  const totalInvested = mode === 'reverse'
    ? sipRequired * 12 * years + existingCorpus
    : monthlySIP * 12 * years + existingCorpus;
  const displayCorpus = mode === 'reverse'
    ? (showInflation ? realTarget : targetAmount)
    : corpus;
  const totalGain     = displayCorpus - totalInvested;
  const gainPct       = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const displaySIP    = mode === 'reverse' ? sipRequired : monthlySIP;
  const growthCurve   = buildGrowthCurve(displaySIP, annualReturn, years, existingCorpus);
  const nominalGoal   = showInflation ? realTarget : targetAmount;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Goal Planner</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Calculate the SIP needed to reach any financial goal
        </p>
      </div>

      {/* ── SEBI RIA Disclaimer — prominent, top of page ── */}
      <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <AlertTriangle size={15} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
            Not Personalised Investment Advice — SEBI Regulation Notice
          </p>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.7, paddingLeft: 25 }}>
          Under <strong>SEBI (Investment Advisers) Regulations, 2013</strong>, providing personalised investment advice requires registration as a
          SEBI Registered Investment Adviser (RIA). This tool performs <strong>mathematical projections only</strong> — the SIP figures shown
          are outputs of compound interest formulae, not advice tailored to your income, risk profile, tax situation, or financial obligations.
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.7, paddingLeft: 25, marginTop: 6 }}>
          <strong>Do not make investment decisions based solely on this output.</strong> Actual returns are not guaranteed.
          Market-linked investments carry risk of loss of principal. Consult a <strong>SEBI-registered RIA</strong> for personalised advice.
          Find a registered advisor at{' '}
          <a href="https://www.sebi.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--indigo)' }}>sebi.gov.in</a>.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="tab-bar">
        <button className={`tab-btn ${mode === 'reverse' ? 'active' : ''}`} onClick={() => setMode('reverse')}>
          🎯 Goal → Find SIP
        </button>
        <button className={`tab-btn ${mode === 'forward' ? 'active' : ''}`} onClick={() => setMode('forward')}>
          💰 SIP → Find Corpus
        </button>
      </div>

      {/* Goal Presets */}
      <div className="glass-card" style={{ padding: 20 }}>
        <p className="label-upper" style={{ marginBottom: 12 }}>Quick Goal Presets</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }} className="goal-presets">
          {GOAL_PRESETS.map((p, i) => (
            <button key={i}
              onClick={() => { setTargetAmount(p.amount); setYears(p.years); }}
              style={{
                padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.03)',
                border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(99,102,241,0.03)'; }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{p.label}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{formatCurrency(p.amount)} · {p.years}Y</p>
            </button>
          ))}
        </div>
      </div>

      {/* Input Controls */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calculator size={14} style={{ color: 'var(--indigo)' }} /> Parameters
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="goal-inputs">
          {/* Left — goal / SIP + horizon + existing corpus */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {mode === 'reverse' ? (
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>
                  Target Corpus <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 400 }}>(today's value)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 12, fontFamily: 'monospace' }}>₹</span>
                  <input type="number" className="input-field" style={{ paddingLeft: 28 }} value={targetAmount}
                    onChange={e => setTargetAmount(Number(e.target.value) || 0)} />
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{formatCurrency(targetAmount)}</p>
              </div>
            ) : (
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Monthly SIP Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 12, fontFamily: 'monospace' }}>₹</span>
                  <input type="number" className="input-field" style={{ paddingLeft: 28 }} value={monthlySIP}
                    onChange={e => setMonthlySIP(Number(e.target.value) || 0)} />
                </div>
              </div>
            )}

            <div>
              <label className="label-upper" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                Time Horizon <span style={{ color: 'var(--indigo)', fontFamily: 'monospace' }}>{years} years</span>
              </label>
              <input type="range" min={1} max={30} value={years}
                onChange={e => setYears(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                <span>1Y</span><span>10Y</span><span>20Y</span><span>30Y</span>
              </div>
            </div>

            {/* Existing Corpus */}
            <div>
              <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>
                Existing Corpus / Lump Sum
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 12, fontFamily: 'monospace' }}>₹</span>
                <input type="number" className="input-field" style={{ paddingLeft: 28 }} value={existingCorpus}
                  onChange={e => setExistingCorpus(Number(e.target.value) || 0)} placeholder="0" />
              </div>
              {existingCorpus > 0 && (
                <p style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>
                  Grows to {formatCurrency(Math.round(fvExisting))} in {years}Y · reduces your SIP need
                </p>
              )}
            </div>
          </div>

          {/* Right — return rate + inflation + reference */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label className="label-upper" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                Expected Annual Return <span style={{ color: 'var(--indigo)', fontFamily: 'monospace' }}>{annualReturn}%</span>
              </label>
              <input type="range" min={4} max={24} step={0.5} value={annualReturn}
                onChange={e => setAnnualReturn(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                <span>4% (FD)</span><span>8% (Hybrid)</span><span>12% (Equity)</span><span>20%+</span>
              </div>
            </div>

            {/* Inflation Toggle + Slider */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="label-upper" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Inflation Adjustment
                  <span title="Adjusts your target for the rising cost of goods. A goal of ₹25L today may need ₹33L in 5 years at 6% inflation."
                    style={{ cursor: 'help', opacity: 0.5 }}>
                    <Info size={11} />
                  </span>
                </label>
                <button
                  onClick={() => setShowInflation(v => !v)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: showInflation ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${showInflation ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                    color: showInflation ? 'var(--indigo)' : 'var(--text-3)',
                    transition: 'all 0.15s',
                  }}
                >
                  {showInflation ? 'ON' : 'OFF'}
                </button>
              </div>
              {showInflation && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Rate</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#f59e0b', fontWeight: 700 }}>{inflationRate}%</span>
                  </div>
                  <input type="range" min={2} max={12} step={0.5} value={inflationRate}
                    onChange={e => setInflationRate(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                    <span>2%</span><span>6% (avg)</span><span>12%</span>
                  </div>
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6 }}>
                      Today's <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{formatCurrency(targetAmount)}</span> target will cost{' '}
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>{formatCurrency(Math.round(realTarget))}</span> in {years}Y at {inflationRate}% inflation.
                      {existingCorpus > 0 && <> Your existing corpus covers <span style={{ color: 'var(--green)', fontWeight: 600 }}>{formatCurrency(Math.round(fvExisting))}</span> of that.</>}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Historical reference */}
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.03)', border: '1px solid var(--border)' }}>
              <p className="label-upper" style={{ marginBottom: 10 }}>Historical Return Reference</p>
              {[
                { type: 'Nifty 50 (10Y avg)',   ret: '12–14%', color: 'var(--green)' },
                { type: 'Large Cap MF (10Y)',    ret: '11–13%', color: 'var(--green)' },
                { type: 'Mid Cap MF (10Y)',      ret: '14–18%', color: 'var(--amber)' },
                { type: 'Small Cap MF (10Y)',    ret: '16–22%', color: 'var(--amber)' },
                { type: 'Hybrid / Balanced',     ret: '9–11%',  color: 'var(--blue)' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-3)' }}>{r.type}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: r.color }}>{r.ret}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Result KPIs */}
      <div className="grid grid-cols-4 gap-4 kpi-grid">
        <div className="kpi-card" style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
          <p className="label-upper" style={{ marginBottom: 6 }}>
            {mode === 'reverse' ? 'Monthly SIP Needed' : 'Projected Corpus'}
          </p>
          <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: 'var(--indigo)' }}>
            {mode === 'reverse' ? formatCurrency(Math.round(sipRequired)) : formatCurrency(Math.round(corpus))}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            {mode === 'reverse'
              ? `to reach ${formatCurrency(Math.round(nominalGoal))}${showInflation ? ' (inflation-adj.)' : ''}`
              : `from ₹${monthlySIP.toLocaleString()}/mo`}
          </p>
        </div>
        <div className="kpi-card">
          <p className="label-upper" style={{ marginBottom: 6 }}>Total Invested</p>
          <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)' }}>{formatCurrency(Math.round(totalInvested))}</p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            {years * 12} SIP instalments{existingCorpus > 0 ? ' + lump sum' : ''}
          </p>
        </div>
        <div className="kpi-card">
          <p className="label-upper" style={{ marginBottom: 6 }}>Wealth Gained</p>
          <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {formatCurrency(Math.round(Math.abs(totalGain)))}
          </p>
          <p style={{ fontSize: 10, color: totalGain >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
            {totalGain >= 0 ? '+' : '-'}{Math.abs(gainPct).toFixed(0)}% returns on capital
          </p>
        </div>
        <div className="kpi-card">
          <p className="label-upper" style={{ marginBottom: 6 }}>Time to Goal</p>
          <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)' }}>{years}Y</p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>@ {annualReturn}% p.a.{showInflation ? `, ${inflationRate}% inflation` : ''}</p>
        </div>
      </div>

      {/* Inflation info banner */}
      {showInflation && mode === 'reverse' && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
          <span style={{ fontWeight: 700, color: '#f59e0b' }}>ℹ Inflation-Adjusted Calculation: </span>
          Your goal of {formatCurrency(targetAmount)} in today's money needs{' '}
          <strong style={{ color: '#f59e0b' }}>{formatCurrency(Math.round(realTarget))}</strong> in {years}Y at {inflationRate}% inflation.
          {existingCorpus > 0 && <>
            {' '}Your existing {formatCurrency(existingCorpus)} grows to{' '}
            <strong style={{ color: 'var(--green)' }}>{formatCurrency(Math.round(fvExisting))}</strong>, so SIP only targets the remaining{' '}
            <strong>{formatCurrency(Math.round(effectiveTarget))}</strong>.
          </>}
        </div>
      )}

      {/* Growth Chart */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={14} style={{ color: 'var(--indigo)' }} /> Corpus Growth Projection
        </h3>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growthCurve}>
              <defs>
                <linearGradient id="corpusGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="investGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="existingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
              <XAxis dataKey="year" tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} width={55} />
              <Tooltip
                contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                formatter={(v, n) => [formatCurrency(v), n]}
              />
              {mode === 'reverse' && (
                <ReferenceLine y={nominalGoal} stroke="#f59e0b" strokeDasharray="6 3"
                  label={{ value: showInflation ? 'Inflation-Adj Goal' : 'Goal', fill: '#f59e0b', fontSize: 10 }} />
              )}
              <Area type="monotone" dataKey="invested" name="Amount Invested" stroke="#22c55e" fill="url(#investGrad)" strokeWidth={1.5} />
              {existingCorpus > 0 && (
                <Area type="monotone" dataKey="existingGrowth" name="Existing Corpus Growth" stroke="#3b82f6" fill="url(#existingGrad)" strokeWidth={1.5} />
              )}
              <Area type="monotone" dataKey="corpus" name="Total Projected Corpus" stroke="#6366f1" fill="url(#corpusGrad)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {existingCorpus > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
            Blue area = existing {formatCurrency(existingCorpus)} growing at {annualReturn}% · Purple = SIP + existing corpus total
          </p>
        )}
      </div>

      {/* Step-Up SIP */}
      <div className="glass-card" style={{ padding: 20, borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.02)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={14} style={{ color: 'var(--indigo)' }} /> 💡 Step-Up SIP Strategy
        </h3>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.6 }}>
          Increase your SIP by a fixed % every year as your income grows. You start smaller today and reach the same goal — or a bigger corpus with the same SIP.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[10, 15, 20].map(pct => {
            const multiplier   = (Math.pow(1 + pct / 100, years) - 1) / ((pct / 100) * years);
            const stepUpSIP    = mode === 'reverse' ? sipRequired / multiplier : monthlySIP;
            const stepUpCorpus = mode === 'forward'
              ? (calcSIPCorpus(monthlySIP, annualReturn, years) * multiplier) + fvExisting
              : displayCorpus;
            return (
              <div key={pct} style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--indigo)', marginBottom: 10 }}>+{pct}% per year</p>
                {mode === 'reverse' ? (
                  <>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Start with just</p>
                    <p style={{ fontSize: 17, fontWeight: 700, fontFamily: 'monospace', color: 'var(--green)', marginTop: 2 }}>
                      {formatCurrency(Math.round(stepUpSIP))}/mo
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>vs {formatCurrency(Math.round(sipRequired))}/mo flat</p>
                    <p style={{ fontSize: 10, color: 'var(--green)', marginTop: 2, fontWeight: 600 }}>
                      Save ₹{Math.round(sipRequired - stepUpSIP).toLocaleString()}/mo initially
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Projected corpus</p>
                    <p style={{ fontSize: 17, fontWeight: 700, fontFamily: 'monospace', color: 'var(--green)', marginTop: 2 }}>
                      {formatCurrency(Math.round(stepUpCorpus))}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>vs {formatCurrency(Math.round(corpus))} flat</p>
                    <p style={{ fontSize: 10, color: 'var(--green)', marginTop: 2, fontWeight: 600 }}>
                      +{formatCurrency(Math.round(stepUpCorpus - corpus))} more
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
