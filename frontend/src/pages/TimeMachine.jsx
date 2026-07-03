/**
 * TimeMachine.jsx — Historical Portfolio Replay
 * Drag a time slider to see what your portfolio would have been worth on any past date.
 * Highlights major market events (COVID crash, 2022 correction, etc.).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from 'recharts';
import { Clock, Play, Pause, TrendingUp, TrendingDown, IndianRupee, AlertTriangle } from 'lucide-react';
import { usePortfolio } from '../hooks/usePortfolio';
import { getHistoricalSnapshot } from '../services/api';
import { formatCurrency, formatPercent } from '../utils/formatters';

// Named market events for reference lines
const EVENTS = [
  { date: '2020-03-23', label: 'COVID low',       color: '#ef4444' },
  { date: '2020-11-09', label: 'Vaccine rally',   color: '#22c55e' },
  { date: '2022-06-17', label: 'Rate-hike low',   color: '#f59e0b' },
  { date: '2024-06-04', label: 'Election day',    color: '#818cf8' },
];

function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}
function isoOffset(baseDate, daysOffset) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export default function TimeMachine() {
  const portfolio = usePortfolio();
  const today = new Date().toISOString().slice(0, 10);

  // Earliest purchase date across portfolio = start of slider range
  const earliestPurchase = useMemo(() => {
    const dates = portfolio.map(f => f.purchase_date).filter(Boolean).sort();
    return dates[0] || '2019-01-01';
  }, [portfolio]);

  const totalDays = daysBetween(earliestPurchase, today);
  const [dayOffset, setDayOffset] = useState(totalDays);
  const [snapshot, setSnapshot]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError]         = useState(null);
  const playRef = useRef(null);
  const lastKeyRef = useRef(null);

  const asOf = useMemo(() => isoOffset(earliestPurchase, dayOffset), [earliestPurchase, dayOffset]);

  // Fetch snapshot with debounce
  useEffect(() => {
    if (portfolio.length === 0) return;
    const key = asOf;
    const t = setTimeout(() => {
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      setLoading(true);
      setError(null);
      getHistoricalSnapshot({ funds: portfolio, as_of_date: asOf })
        .then(r => setSnapshot(r.data))
        .catch(e => setError(e.response?.data?.detail || e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [asOf, portfolio]);

  // Play/pause auto-scrub
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setDayOffset(prev => {
          const step = Math.max(7, Math.round(totalDays / 60));
          if (prev + step >= totalDays) {
            setIsPlaying(false);
            return totalDays;
          }
          return prev + step;
        });
      }, 250);
    } else if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalDays]);

  // ── Empty state ──
  if (portfolio.length === 0) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 18px',
            background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={28} style={{ color: 'var(--indigo)', opacity: 0.6 }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No portfolio to travel through</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20, lineHeight: 1.55 }}>
            Add funds with purchase dates in Portfolio Builder to see how your portfolio value evolved through time — including through the COVID crash and other major events.
          </p>
          <a href="/portfolio" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Go to Portfolio Builder
          </a>
        </div>
      </div>
    );
  }

  const value  = snapshot?.total_value || 0;
  const inv    = snapshot?.total_invested || 0;
  const gain   = snapshot?.gain || 0;
  const gainPc = snapshot?.gain_pct || 0;
  const ddPct  = snapshot?.drawdown_from_peak_pct || 0;
  const peakV  = snapshot?.peak_value || 0;

  const curve = snapshot?.portfolio_curve || [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={22} style={{ color: 'var(--indigo)' }} />
          Portfolio Time Machine
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Drag the slider to any past date — see what your portfolio was worth then. Hit ▶ to auto-scrub through history.
        </p>
      </div>

      {/* KPI Row — value at the selected date */}
      <div className="grid grid-cols-4 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="glass-card" style={{ padding: 18 }}>
          <p className="label-upper" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> As of
          </p>
          <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '-0.01em' }}>
            {new Date(asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{daysBetween(asOf, today)} days ago</p>
        </div>
        <div className="glass-card" style={{ padding: 18 }}>
          <p className="label-upper" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IndianRupee size={10} /> Portfolio Value
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            {formatCurrency(value)}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>Invested: {formatCurrency(inv)}</p>
        </div>
        <div className="glass-card" style={{ padding: 18 }}>
          <p className="label-upper" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            {gain >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />} Gain / Loss
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: gain >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.01em' }}>
            {gain >= 0 ? '+ ' : '− '}{formatCurrency(Math.abs(gain))}
          </p>
          <p style={{ fontSize: 10, color: gain >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>{formatPercent(gainPc)}</p>
        </div>
        <div className="glass-card" style={{ padding: 18, background: ddPct < -10 ? 'rgba(239,68,68,0.05)' : undefined, borderColor: ddPct < -10 ? 'rgba(239,68,68,0.3)' : undefined }}>
          <p className="label-upper" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            {ddPct < -5 && <AlertTriangle size={10} />} Drawdown from Peak
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: ddPct < -5 ? 'var(--red)' : 'var(--text-3)', letterSpacing: '-0.01em' }}>
            {ddPct <= 0 ? formatPercent(ddPct) : '—'}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>Peak: {formatCurrency(peakV)}</p>
        </div>
      </div>

      {/* Time slider */}
      <div className="glass-card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              {new Date(asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Drag the slider · press ▶ to auto-play through history</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.25, 0.5, 0.75, 1].map(f => (
              <button key={f} onClick={() => setDayOffset(Math.round(totalDays * f))}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-3)', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                {f === 1 ? 'Today' : f === 0.25 ? 'Early' : f === 0.5 ? 'Mid' : 'Recent'}
              </button>
            ))}
            <button onClick={() => setIsPlaying(v => !v)} className={isPlaying ? 'btn-secondary' : 'btn-primary'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 14px' }}>
              {isPlaying ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Play</>}
            </button>
          </div>
        </div>
        <input type="range" min={0} max={totalDays} value={dayOffset}
          onChange={e => setDayOffset(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--indigo)', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
          <span>{new Date(earliestPurchase).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span>{new Date(today).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Historical portfolio chart with markers for major events */}
      {curve.length > 0 && (
        <div className="glass-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Portfolio Value Through Time</h3>
            <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Vertical lines mark major market events</p>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 6, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#5a5a6e', fontSize: 9 }} />
                <YAxis tick={{ fill: '#5a5a6e', fontSize: 10 }} tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 11 }}
                  formatter={v => formatCurrency(v)}
                />
                <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.2} fill="url(#valGrad)" name="Portfolio Value" />
                {/* Selected date marker */}
                <ReferenceLine x={asOf} stroke="#22c55e" strokeWidth={2}
                  label={{ value: 'Selected', position: 'top', fill: '#22c55e', fontSize: 10, fontWeight: 700 }} />
                {/* Named events */}
                {EVENTS.map(e => (
                  curve.some(p => p.date >= e.date) &&
                  <ReferenceLine key={e.date} x={e.date} stroke={e.color} strokeDasharray="4 3" strokeOpacity={0.55}
                    label={{ value: e.label, position: 'insideTop', fill: e.color, fontSize: 9, fontWeight: 700 }} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-fund breakdown at the selected date */}
      {snapshot?.funds?.length > 0 && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700 }}>Fund Breakdown on {new Date(asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</h3>
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left',  padding: '10px 22px', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fund</th>
                <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>NAV</th>
                <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invested</th>
                <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Value</th>
                <th style={{ textAlign: 'right', padding: '10px 22px', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gain</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.funds.map(f => (
                <tr key={f.scheme_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '11px 22px', fontWeight: 600 }}>{(f.name || f.scheme_code).replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}</td>
                  <td style={{ padding: '11px 22px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-3)' }}>{f.target_nav}</td>
                  <td style={{ padding: '11px 22px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)' }}>{formatCurrency(f.invested)}</td>
                  <td style={{ padding: '11px 22px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{formatCurrency(f.current_value)}</td>
                  <td style={{ padding: '11px 22px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: f.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {f.gain >= 0 ? '+ ' : '− '}{formatCurrency(Math.abs(f.gain))}
                    <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>({formatPercent(f.gain_pct)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>Loading snapshot…</p>}
      {error   && <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--red)' }}>⚠️ {error}</p>}
    </div>
  );
}
