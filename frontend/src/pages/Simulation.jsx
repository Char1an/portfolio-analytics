import { useState, useEffect, useCallback } from 'react';
import { Flame, Play, Dice5, BarChart3, Info, HelpCircle, Search, X, Plus, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as RBar, Bar } from 'recharts';
import { getScenarios, runScenario, runMonteCarlo, searchFunds } from '../services/api';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { usePortfolio } from '../hooks/usePortfolio';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function tradingDayToLabel(day, totalDays) {
  const totalMonths = totalDays / 21;
  if (totalMonths <= 3) {
    const weeks = Math.round(day / 5);
    return `${weeks}w`;
  } else if (totalMonths <= 24) {
    const months = Math.round(day / 21);
    return `${months}mo`;
  } else {
    const years = Math.floor(day / 252);
    const months = Math.round((day % 252) / 21);
    if (months === 0) return `${years}yr`;
    if (years === 0) return `${months}mo`;
    return `${years}yr${months}mo`;
  }
}

export default function Simulation() {
  const portfolio                                = usePortfolio();
  const [extraFunds, setExtraFunds]             = useState([]); // funds added via search
  const [tab, setTab]                           = useState('scenario');
  const [scenarios, setScenarios]               = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('severe_crash');
  const [selectedFundCode, setSelectedFundCode] = useState('');
  const [sip, setSip]                           = useState(6000);
  const [scenarioResult, setScenarioResult]     = useState(null);
  const [mcResult, setMcResult]                 = useState(null);
  const [mcSims, setMcSims]                     = useState(1000);
  const [mcHorizonVal, setMcHorizonVal]         = useState(1);
  const [mcHorizonUnit, setMcHorizonUnit]       = useState('years');
  const [mcInvestment, setMcInvestment]         = useState(50000);
  const [mcSip, setMcSip]                       = useState(6000);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState(null);

  // Fund search state
  const [fundSearch, setFundSearch]       = useState('');
  const [fundResults, setFundResults]     = useState([]);
  const [fundSearching, setFundSearching] = useState(false);

  useEffect(() => {
    getScenarios().then(r => setScenarios(r.data.scenarios || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (portfolio.length > 0 && !selectedFundCode) {
      setSelectedFundCode(portfolio[0].scheme_code);
      setSip(portfolio[0].monthly_sip || 5000);
      setMcSip(portfolio[0].monthly_sip || 5000);
      setMcInvestment(portfolio[0].investment_amount || 50000);
    }
  }, [portfolio]);

  const doFundSearch = useCallback(debounce(async (q) => {
    if (q.length < 2) { setFundResults([]); return; }
    setFundSearching(true);
    try {
      const r = await searchFunds(q);
      setFundResults(r.data.results?.slice(0, 8) || []);
    } catch { setFundResults([]); }
    setFundSearching(false);
  }, 400), []);

  function addExtraFund(fund) {
    const code = String(fund.schemeCode);
    if (allFunds.find(f => f.scheme_code === code)) {
      // Already present — just select it
      selectFund({ scheme_code: code, name: fund.schemeName, category: 'Unknown', monthly_sip: 5000, investment_amount: 0 });
      setFundSearch('');
      setFundResults([]);
      return;
    }
    const newFund = {
      scheme_code: code,
      name: fund.schemeName,
      category: 'Unknown',
      monthly_sip: 5000,
      investment_amount: 0,
    };
    setExtraFunds(prev => [...prev, newFund]);
    selectFund(newFund);
    setFundSearch('');
    setFundResults([]);
  }

  function removeExtraFund(code) {
    setExtraFunds(prev => prev.filter(f => f.scheme_code !== code));
    if (selectedFundCode === code) {
      const remaining = allFunds.filter(f => f.scheme_code !== code);
      if (remaining.length > 0) selectFund(remaining[0]);
      else setSelectedFundCode('');
    }
  }

  function selectFund(fund) {
    setSelectedFundCode(fund.scheme_code);
    setSip(fund.monthly_sip || 5000);
    setMcSip(fund.monthly_sip || 5000);
    setMcInvestment(fund.investment_amount || 50000);
    setScenarioResult(null);
    setMcResult(null);
  }

  const allFunds = [...portfolio, ...extraFunds];
  const selectedFund = allFunds.find(f => f.scheme_code === selectedFundCode) || allFunds[0];

  function horizonToDays() {
    if (mcHorizonUnit === 'days')   return Math.max(1, mcHorizonVal);
    if (mcHorizonUnit === 'months') return Math.round(mcHorizonVal * 21);
    if (mcHorizonUnit === 'years')  return Math.round(mcHorizonVal * 252);
    return 252;
  }

  async function handleScenario() {
    if (!selectedFund) return;
    setLoading(true);
    setError(null);
    try {
      const r = await runScenario({
        scheme_code: selectedFund.scheme_code,
        scenario_id: selectedScenario,
        category: selectedFund.category,
        monthly_sip: sip,
      });
      setScenarioResult(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Scenario simulation failed. Please retry or check the backend.');
      setScenarioResult(null);
    }
    setLoading(false);
  }

  async function handleMC() {
    if (!selectedFund) return;
    setLoading(true);
    setError(null);
    try {
      const r = await runMonteCarlo({
        scheme_code: selectedFund.scheme_code,
        n_simulations: mcSims,
        horizon_days: horizonToDays(),
        monthly_sip: mcSip,
        initial_investment: mcInvestment,
      });
      setMcResult(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Monte Carlo simulation failed. Please retry or check the backend.');
      setMcResult(null);
    }
    setLoading(false);
  }

  const scenarioChart = scenarioResult?.portfolio_curve || [];
  const shortName = (name = '') => name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim().split(' ').slice(0, 3).join(' ');

  const mcChart = mcResult ? (() => {
    const p5  = mcResult.percentiles?.p5  || [];
    const p25 = mcResult.percentiles?.p25 || [];
    const p50 = mcResult.percentiles?.p50 || [];
    const p75 = mcResult.percentiles?.p75 || [];
    const p95 = mcResult.percentiles?.p95 || [];
    const totalDays = horizonToDays();
    const step = Math.max(1, Math.floor(p50.length / 60));
    return p50
      .map((_, i) => i % step === 0 || i === p50.length - 1
        ? {
            day: i,
            label: tradingDayToLabel(i, totalDays),
            p5: +p5[i]?.toFixed(0), p25: +p25[i]?.toFixed(0), p50: +p50[i]?.toFixed(0),
            p75: +p75[i]?.toFixed(0), p95: +p95[i]?.toFixed(0),
          }
        : null)
      .filter(Boolean);
  })() : [];

  const mcHist = mcResult?.distribution
    ? mcResult.distribution.counts.map((c, i) => ({
        range: `₹${(mcResult.distribution.bin_edges[i] / 1000).toFixed(0)}k`,
        count: c,
      }))
    : [];

  const horizonLabel = `${mcHorizonVal} ${mcHorizonUnit}`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Scenario Simulation</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Stress-test your portfolio across market scenarios and Monte Carlo paths
        </p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 16px', borderColor: 'var(--red-border)', background: 'var(--red-bg)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: 'var(--red)', fontSize: 12.5, lineHeight: 1.55 }}>{error}</p>
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Fund Selector ── */}
      <div className="glass-card" style={{ padding: '18px 20px' }}>
        <p className="label-upper" style={{ marginBottom: 10 }}>Select Fund to Simulate</p>

        {/* Portfolio funds */}
        {portfolio.length > 0 && (
          <>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
              Your Portfolio
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {portfolio.map(f => {
                const isSelected = selectedFundCode === f.scheme_code;
                return (
                  <button key={f.scheme_code}
                    onClick={() => selectFund(f)}
                    style={{
                      padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.16s',
                      background: isSelected ? 'var(--grad)' : 'rgba(99,102,241,0.07)',
                      color: isSelected ? '#fff' : 'var(--text-3)',
                      boxShadow: isSelected ? '0 2px 10px rgba(99,102,241,0.35)' : 'none',
                    }}>
                    {shortName(f.name)}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Extra (searched) funds */}
        {extraFunds.length > 0 && (
          <>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
              Added for Simulation
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {extraFunds.map(f => {
                const isSelected = selectedFundCode === f.scheme_code;
                return (
                  <div key={f.scheme_code} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <button onClick={() => selectFund(f)}
                      style={{
                        padding: '7px 10px 7px 14px', borderRadius: '9px 0 0 9px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.16s',
                        background: isSelected ? 'var(--grad)' : 'rgba(52,211,153,0.12)',
                        color: isSelected ? '#fff' : 'var(--green)',
                        boxShadow: isSelected ? '0 2px 10px rgba(52,211,153,0.25)' : 'none',
                      }}>
                      {shortName(f.name)}
                    </button>
                    <button onClick={() => removeExtraFund(f.scheme_code)}
                      style={{
                        padding: '7px 8px', borderRadius: '0 9px 9px 0', border: 'none', cursor: 'pointer',
                        background: isSelected ? 'rgba(248,113,113,0.35)' : 'rgba(52,211,153,0.07)',
                        color: isSelected ? '#f87171' : 'var(--text-3)',
                        transition: 'all 0.16s',
                      }}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Search any fund */}
        <div style={{ borderTop: portfolio.length > 0 || extraFunds.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: portfolio.length > 0 || extraFunds.length > 0 ? 14 : 0 }}>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
            Search &amp; Add Any Fund
          </p>
          <div style={{ position: 'relative', maxWidth: 440 }}>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. HDFC Small Cap, Axis Bluechip…"
              style={{ paddingLeft: 36 }}
              value={fundSearch}
              onChange={e => { setFundSearch(e.target.value); doFundSearch(e.target.value); }}
            />
            <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            {fundSearching && (
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, border: '2px solid var(--indigo)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} />
            )}
          </div>

          {fundResults.length > 0 && (
            <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto', maxWidth: 440 }}>
              {fundResults.map((r, i) => {
                const code = String(r.schemeCode);
                const already = allFunds.find(f => f.scheme_code === code);
                return (
                  <button key={i} onClick={() => addExtraFund(r)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', background: 'transparent', border: 'none',
                      borderBottom: i < fundResults.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{r.schemeName}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Code: {r.schemeCode}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: already ? 'var(--green)' : 'var(--indigo)', flexShrink: 0, marginLeft: 10 }}>
                      {already ? '✓ Selected' : <Plus size={13} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedFund && (
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
            Simulating: <strong style={{ color: 'var(--text-2)' }}>{selectedFund.name}</strong> · Code: {selectedFund.scheme_code}
            {selectedFund.category && selectedFund.category !== 'Unknown' && ` · ${selectedFund.category}`}
          </p>
        )}

        {allFunds.length === 0 && !fundSearch && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
            Your portfolio is empty. Search for a fund above to simulate it.
          </p>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'scenario' ? 'active' : ''}`} onClick={() => setTab('scenario')}>🔥 Scenario Stress Test</button>
        <button className={`tab-btn ${tab === 'montecarlo' ? 'active' : ''}`} onClick={() => setTab('montecarlo')}>🎲 Monte Carlo</button>
      </div>

      {/* ── Scenario Tab ── */}
      {tab === 'scenario' && (
        <>
          <div className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
              <Info size={14} style={{ color: 'var(--blue)', marginTop: 1, flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>
                Scenario testing applies historical market shock patterns (2008 crisis, COVID crash, etc.) to your fund's NAV and measures impact on your SIP portfolio value.
              </p>
            </div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Select Market Scenario</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
              {scenarios.map(s => (
                <button key={s.id} onClick={() => setSelectedScenario(s.id)}
                  style={{
                    padding: '14px', borderRadius: 12, border: `1px solid ${selectedScenario === s.id ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
                    background: selectedScenario === s.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.16s',
                  }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{s.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 8 }}>{s.description}</p>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: s.nifty_change_pct < 0 ? 'var(--red)' : 'var(--green)' }}>
                      {s.nifty_change_pct > 0 ? '+' : ''}{s.nifty_change_pct?.toFixed(1)}%
                    </span>
                    <span style={{ color: 'var(--text-3)' }}>{s.duration_months} months</span>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Monthly SIP (₹)</label>
                <input type="number" className="input-field" style={{ width: 140 }} value={sip} onChange={e => setSip(+e.target.value)} />
              </div>
              <button onClick={handleScenario} disabled={loading || !selectedFund} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                {loading ? <div style={{ width: 13, height: 13, border: '2px solid white', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} /> : <Play size={13} />}
                {loading ? 'Running…' : 'Run Scenario'}
              </button>
            </div>
          </div>

          {scenarioResult && (
            <div className="glass-card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 18 }}>{scenarioResult.scenario?.name} — Results</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { l: 'Max Drawdown', v: `${scenarioResult.metrics?.max_drawdown_pct}%`, c: 'var(--red)' },
                  { l: 'Final NAV', v: `₹${scenarioResult.metrics?.final_nav}`, c: 'var(--text-1)' },
                  { l: 'Total Invested', v: formatCurrency(scenarioResult.metrics?.total_invested), c: 'var(--text-1)' },
                  { l: 'Portfolio Return', v: formatPercent(scenarioResult.metrics?.return_pct), c: scenarioResult.metrics?.return_pct >= 0 ? 'var(--green)' : 'var(--red)' },
                ].map((m, i) => (
                  <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <p className="label-upper" style={{ marginBottom: 6 }}>{m.l}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: m.c }}>{m.v}</p>
                  </div>
                ))}
              </div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={scenarioChart}>
                    <defs>
                      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }} formatter={v => formatCurrency(v)} />
                    <Area type="monotone" dataKey="value" name="Portfolio Value" stroke="#6366f1" fill="url(#sg)" strokeWidth={2.2} />
                    <Line type="monotone" dataKey="invested" name="Amount Invested" stroke="rgba(99,102,241,0.3)" strokeDasharray="6 4" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Monte Carlo Tab ── */}
      {tab === 'montecarlo' && (
        <>
          <div className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, padding: '12px 14px', background: 'var(--blue-bg)', borderRadius: 10, border: '1px solid var(--blue-border)' }}>
              <HelpCircle size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--blue)' }}>Monte Carlo simulation</strong> runs thousands of randomised future NAV paths based on the fund's historical return and volatility.
                The fan chart shows the spread of possible outcomes — from worst-case (5th percentile) to best-case (95th percentile).
                This helps you understand the range of realistic outcomes before investing.
              </p>
            </div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Dice5 size={14} style={{ color: 'var(--indigo)' }} /> Monte Carlo Parameters
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Simulations</label>
                <select className="select-field" value={mcSims} onChange={e => setMcSims(+e.target.value)}>
                  {[200, 500, 1000, 2000].map(n => <option key={n} value={n}>{n} paths</option>)}
                </select>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>More = better accuracy, slower</p>
              </div>
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Horizon</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min={1} max={mcHorizonUnit === 'years' ? 50 : mcHorizonUnit === 'months' ? 600 : 18000} className="input-field" value={mcHorizonVal}
                    onChange={e => {
                      const maxV = mcHorizonUnit === 'years' ? 50 : mcHorizonUnit === 'months' ? 600 : 18000;
                      setMcHorizonVal(Math.min(maxV, Math.max(1, parseInt(e.target.value) || 1)));
                    }}
                    style={{ flex: 1 }} />
                  <select className="select-field" value={mcHorizonUnit} onChange={e => setMcHorizonUnit(e.target.value)} style={{ width: 90 }}>
                    <option value="days">days</option>
                    <option value="months">months</option>
                    <option value="years">years</option>
                  </select>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>= {horizonToDays()} trading days (252/year)</p>
              </div>
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Lumpsum (₹)</label>
                <input type="number" className="input-field" value={mcInvestment} onChange={e => setMcInvestment(+e.target.value)} />
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Initial one-time investment</p>
              </div>
              <div>
                <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Monthly SIP (₹)</label>
                <input type="number" className="input-field" value={mcSip} onChange={e => setMcSip(+e.target.value)} />
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Recurring monthly investment</p>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { l: '6mo', v: 6, u: 'months' }, { l: '1yr', v: 1, u: 'years' },
                { l: '3yr', v: 3, u: 'years' }, { l: '5yr', v: 5, u: 'years' }, { l: '10yr', v: 10, u: 'years' },
              ].map(p => (
                <button key={p.l} onClick={() => { setMcHorizonVal(p.v); setMcHorizonUnit(p.u); }}
                  className="period-btn" style={{ fontSize: 11 }}>{p.l}</button>
              ))}
              <button onClick={handleMC} disabled={loading || !selectedFund} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, marginLeft: 'auto' }}>
                {loading ? <div style={{ width: 13, height: 13, border: '2px solid white', borderTop: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} /> : <Dice5 size={13} />}
                {loading ? 'Simulating…' : `Run ${mcSims} Simulations`}
              </button>
            </div>
          </div>

          {mcResult && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {[
                  { l: 'Best Case (95th)', v: mcResult.outcomes?.best_case, c: 'var(--green)' },
                  { l: 'Optimistic (75th)', v: mcResult.outcomes?.optimistic, c: '#34d39988' },
                  { l: 'Median (50th)', v: mcResult.outcomes?.median, c: 'var(--indigo)' },
                  { l: 'Conservative (25th)', v: mcResult.outcomes?.conservative, c: 'var(--amber)' },
                  { l: 'Worst Case (5th)', v: mcResult.outcomes?.worst_case, c: 'var(--red)' },
                ].map((o, i) => (
                  <div key={i} className="kpi-card" style={{ textAlign: 'left' }}>
                    <p className="label-upper" style={{ marginBottom: 8 }}>{o.l}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: o.c }}>{formatCurrency(o.v)}</p>
                  </div>
                ))}
              </div>

              <div className="glass-card" style={{ padding: 22 }}>
                <div style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700 }}>Probability Fan Chart — {mcSims} paths · {horizonLabel}</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    Each shaded band represents 25% of all simulated outcomes. The purple line is the median path.
                  </p>
                </div>
                <div style={{ height: 360 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mcChart}>
                      <defs>
                        <linearGradient id="mc95" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="mc75" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }} formatter={v => formatCurrency(+v)} />
                      <Area type="monotone" dataKey="p95" name="95th pct" stroke="rgba(99,102,241,0.18)" fill="url(#mc95)" />
                      <Area type="monotone" dataKey="p75" name="75th pct" stroke="rgba(99,102,241,0.28)" fill="url(#mc75)" />
                      <Line type="monotone" dataKey="p50" name="Median" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="p25" name="25th pct" stroke="rgba(251,191,36,0.6)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="p5"  name="5th pct"  stroke="rgba(248,113,113,0.6)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="analytics-grid">
                <div className="glass-card" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 18 }}>Probability Analysis</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {[
                      { l: 'Profit Probability', v: mcResult.probabilities?.profit_pct, c: 'var(--green)', fill: '#34d399' },
                      { l: 'Probability of 2× Return', v: mcResult.probabilities?.double_pct, c: 'var(--indigo)', fill: '#6366f1' },
                      { l: 'Probability of >10% Loss', v: mcResult.probabilities?.loss_10_pct, c: 'var(--red)', fill: '#f87171' },
                    ].map((p, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 7 }}>
                          <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{p.l}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: p.c, fontSize: 14 }}>{p.v}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.min(p.v || 0, 100)}%`, background: p.fill }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20, padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-2)' }}>
                    <span>Ann. Return: </span>
                    <strong style={{ color: 'var(--green)', fontFamily: 'monospace' }}>{mcResult.parameters?.annualized_return_pct}%</strong>
                    <span style={{ margin: '0 8px', color: 'var(--text-3)' }}>|</span>
                    <span>Volatility: </span>
                    <strong style={{ color: 'var(--amber)', fontFamily: 'monospace' }}>{mcResult.parameters?.annualized_volatility_pct}%</strong>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={14} style={{ color: 'var(--indigo)' }} /> Outcome Distribution
                  </h3>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
                    Distribution of terminal portfolio values across all {mcSims} simulated paths.
                    A right-skewed distribution (long tail to the right) indicates higher upside potential.
                  </p>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RBar data={mcHist}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.05)" />
                        <XAxis dataKey="range" tick={{ fill: 'var(--text-3)', fontSize: 8 }} interval={2} />
                        <YAxis tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: 'rgba(6,9,26,0.98)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }} />
                        <Bar dataKey="count" name="Frequency" radius={[3, 3, 0, 0]} fill="#6366f1" fillOpacity={0.8} />
                      </RBar>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
