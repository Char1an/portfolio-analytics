import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, X, Briefcase, ArrowRight, RotateCcw, Info, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Trash2, Upload, Pencil, Check, Download } from 'lucide-react';
import { searchFunds } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { loadPortfolio, savePortfolio, syncPortfolioToServer, DEFAULT_FUNDS } from '../utils/portfolioStore';
import { useAuth } from '../contexts/auth';
import CASImport from '../components/CASImport';
import { exportPortfolioCSV } from '../utils/exportUtils';

const shortName = (name) => name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim();

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const EMPTY_TXN = { date: new Date().toISOString().slice(0, 10), amount: '', type: 'sip' };

export default function Portfolio() {
  const [mode, setMode]               = useState('simple');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]     = useState(false);
  const [portfolio, setPortfolio]     = useState(loadPortfolio);
  const [expandedFund, setExpandedFund] = useState(null);
  const [txnForm, setTxnForm]         = useState(null); // { fundCode, ...EMPTY_TXN }
  const [flash, setFlash]             = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showCASImport, setShowCASImport] = useState(false);
  const [editingTxn, setEditingTxn]   = useState(null); // { fundCode, txnId, date, amount, type }
  const [showAllTxns, setShowAllTxns] = useState({});   // fundCode -> bool
  const { hydrated, isLoggedIn }      = useAuth();
  const hasUserEdit                   = useRef(false);

  // When AuthContext finishes hydrating from /me, pull the server portfolio in.
  useEffect(() => {
    function refresh() { setPortfolio(loadPortfolio()); }
    window.addEventListener('portfolio-hydrated', refresh);
    return () => window.removeEventListener('portfolio-hydrated', refresh);
  }, []);

  // Persist + sync — but ONLY after the user has actually edited the portfolio
  // in this session AND (if logged in) we've finished hydrating from the server.
  // This prevents an empty/stale localStorage from overwriting good server data
  // on initial mount (the original data-loss bug).
  useEffect(() => {
    if (!hasUserEdit.current) return;
    if (isLoggedIn && !hydrated) return;
    savePortfolio(portfolio);
    syncPortfolioToServer(portfolio);
  }, [portfolio, hydrated, isLoggedIn]);

  // Wrapper used by all mutators below — flips the edit flag so the sync effect
  // can fire. This makes the "first edit triggers persistence" rule explicit.
  const editPortfolio = useCallback(updater => {
    hasUserEdit.current = true;
    setPortfolio(updater);
  }, []);

  const doSearch = useCallback(debounce(async (q) => {
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await searchFunds(q);
      setSearchResults(r.data.results?.slice(0, 10) || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, 400), []);

  function addFund(fund) {
    if (portfolio.find(p => p.scheme_code === String(fund.schemeCode))) {
      setFlash('Already in portfolio');
      setTimeout(() => setFlash(null), 2000);
      return;
    }
    const isDirect = !fund.schemeName?.toLowerCase().includes('regular');
    editPortfolio(prev => [...prev, {
      scheme_code:      String(fund.schemeCode),
      name:             fund.schemeName,
      category:         'Unknown',
      monthly_sip:      5000,
      investment_amount: 0,
      purchase_date:    new Date().toISOString().slice(0, 10),
      plan_type:        isDirect ? 'Direct' : 'Regular',
    }]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeFund(code) {
    editPortfolio(prev => prev.filter(f => f.scheme_code !== code));
  }

  function updateFund(code, field, value) {
    editPortfolio(prev => prev.map(f =>
      f.scheme_code === code
        ? { ...f, [field]: (field === 'purchase_date' || field === 'plan_type' || field === 'category') ? value : (Number(value) || 0) }
        : f
    ));
  }

  function addTransaction(code, txn) {
    const newTxn = { ...txn, id: Date.now(), amount: Number(txn.amount) };
    editPortfolio(prev => prev.map(f =>
      f.scheme_code === code
        ? { ...f, transactions: [...(f.transactions || []), newTxn] }
        : f
    ));
    setTxnForm(null);
  }

  function removeTransaction(fundCode, txnId) {
    editPortfolio(prev => prev.map(f =>
      f.scheme_code === fundCode
        ? { ...f, transactions: (f.transactions || []).filter(t => t.id !== txnId) }
        : f
    ));
  }

  function saveEditedTransaction() {
    if (!editingTxn || !editingTxn.amount || Number(editingTxn.amount) <= 0) return;
    const { fundCode, txnId, date, amount, type } = editingTxn;
    editPortfolio(prev => prev.map(f =>
      f.scheme_code === fundCode
        ? { ...f, transactions: (f.transactions || []).map(t =>
            t.id === txnId ? { ...t, date, amount: Number(amount), type } : t
          ) }
        : f
    ));
    setEditingTxn(null);
  }

  function resetToDefaults() {
    if (!confirmReset) { setConfirmReset(true); return; }
    editPortfolio(() => DEFAULT_FUNDS);
    setConfirmReset(false);
  }

  const totalLumpsum = portfolio.reduce((s, f) => s + (f.investment_amount || 0), 0);
  const totalSIP     = portfolio.reduce((s, f) => s + (f.monthly_sip || 0), 0);

  const overlapWarnings = useMemo(() => {
    const warnings = [];
    if (portfolio.length < 2) return warnings;

    // Category duplicates
    const catMap = {};
    portfolio.forEach(f => {
      const cat = f.category || 'Unknown';
      if (cat === 'Unknown') return;
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(shortName(f.name));
    });
    Object.entries(catMap).forEach(([cat, funds]) => {
      if (funds.length > 1) {
        warnings.push({
          level: 'warn',
          msg: `${cat} overlap: ${funds.join(' & ')} — both in the same category increases concentration risk without true diversification.`,
        });
      }
    });

    // AMC concentration — use first word as AMC (e.g. "HDFC", "Nippon", "Motilal")
    const amcMap = {};
    portfolio.forEach(f => {
      const amc = (f.name || '').split(' ')[0];
      if (!amc) return;
      if (!amcMap[amc]) amcMap[amc] = 0;
      amcMap[amc]++;
    });
    Object.entries(amcMap).forEach(([amc, count]) => {
      if (count >= 2) {
        warnings.push({
          level: 'info',
          msg: `${count} funds from "${amc}" — high AMC concentration. Spreading across AMCs reduces single-AMC operational risk.`,
        });
      }
    });

    // Regular plan mix
    const regularFunds = portfolio.filter(f => f.plan_type === 'Regular');
    if (regularFunds.length > 0) {
      warnings.push({
        level: 'warn',
        msg: `${regularFunds.length} fund(s) on Regular plan. Switching to Direct can save 0.5–1.5% per year in expense ratio — significant over long horizons.`,
      });
    }

    // No unknown categories — count how many need categories
    const unknownCount = portfolio.filter(f => !f.category || f.category === 'Unknown').length;
    if (unknownCount > 0) {
      warnings.push({
        level: 'info',
        msg: `${unknownCount} fund(s) have no category set. Set the category in Edit mode to enable overlap detection and scenario testing accuracy.`,
      });
    }

    // IDCW / Dividend plan detection
    const idcwFunds = portfolio.filter(f => /idcw|dividend/i.test(f.name || ''));
    if (idcwFunds.length > 0) {
      warnings.push({
        level: 'warn',
        msg: `⚠ IDCW/Dividend plan detected: ${idcwFunds.map(f => shortName(f.name)).join(', ')}. IDCW distributions are taxed at your income slab rate (not 12.5% LTCG). All return figures in Analytics show NAV growth only — they do NOT include distributions received. Switch to Growth plan for accurate compounding and simpler tax treatment.`,
      });
    }

    return warnings;
  }, [portfolio]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Portfolio Builder</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            Configure your holdings — changes reflect instantly on all pages
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulseDot 2s infinite' }} />
            Auto-saved
          </span>
          {confirmReset ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--amber)' }}>Replace current portfolio?</span>
              <button onClick={resetToDefaults} className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-border)' }}>Confirm</button>
              <button onClick={() => setConfirmReset(false)} className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</button>
            </span>
          ) : (
            <>
              <button onClick={() => setShowCASImport(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Upload size={12} /> Import CAS
              </button>
              <button
                onClick={() => exportPortfolioCSV(portfolio)}
                disabled={portfolio.length === 0}
                title="Download portfolio + transactions as XLSX"
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: portfolio.length === 0 ? 0.5 : 1 }}>
                <Download size={12} /> Export
              </button>
              <button onClick={resetToDefaults} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <RotateCcw size={12} /> Reset
              </button>
            </>
          )}
        </div>
      </div>

      {showCASImport && (
        <CASImport
          existingPortfolio={portfolio}
          onClose={() => setShowCASImport(false)}
          onImport={(newFunds) => {
            // Smart-merge instead of silent overwrite. For each incoming fund:
            //   - If no existing entry with same scheme_code → add as new.
            //   - If collision → merge fields (prefer non-empty existing values
            //     so user customizations aren't lost) and dedupe transactions
            //     by date+amount+type so re-imports don't duplicate rows.
            let addedCount = 0, mergedCount = 0;
            editPortfolio(prev => {
              const byCode = new Map(prev.map(f => [f.scheme_code, f]));
              newFunds.forEach(incoming => {
                const existing = byCode.get(incoming.scheme_code);
                if (!existing) {
                  byCode.set(incoming.scheme_code, incoming);
                  addedCount++;
                  return;
                }
                // Collision — merge conservatively
                const existingTxns = existing.transactions || [];
                const incomingTxns = incoming.transactions || [];
                const seen = new Set(existingTxns.map(t => `${t.date}|${t.amount}|${t.type}`));
                const mergedTxns = [...existingTxns];
                incomingTxns.forEach(t => {
                  const key = `${t.date}|${t.amount}|${t.type}`;
                  if (!seen.has(key)) { mergedTxns.push(t); seen.add(key); }
                });
                byCode.set(incoming.scheme_code, {
                  ...incoming,
                  // Keep existing customizations where they exist
                  name:              existing.name || incoming.name,
                  monthly_sip:       existing.monthly_sip || 0,
                  purchase_date:     existing.purchase_date || incoming.purchase_date,
                  plan_type:         existing.plan_type || incoming.plan_type,
                  // Take the larger of the two invested amounts (CAS is
                  // usually the authoritative source but respect a user
                  // who intentionally set a higher figure)
                  investment_amount: Math.max(existing.investment_amount || 0, incoming.investment_amount || 0),
                  transactions:      mergedTxns,
                });
                mergedCount++;
              });
              return Array.from(byCode.values());
            });
            setShowCASImport(false);
            const parts = [];
            if (addedCount)  parts.push(`${addedCount} new fund${addedCount === 1 ? '' : 's'} added`);
            if (mergedCount) parts.push(`${mergedCount} existing fund${mergedCount === 1 ? '' : 's'} updated (transactions merged, your SIP/name kept)`);
            setFlash({ type: 'success', msg: parts.join(' · ') || 'No changes applied.' });
          }}
        />
      )}

      {/* ── Mode Toggle ── */}
      <div className="tab-bar">
        <button className={`tab-btn ${mode === 'simple' ? 'active' : ''}`} onClick={() => setMode('simple')}>🎯 Simple</button>
        <button className={`tab-btn ${mode === 'advanced' ? 'active' : ''}`} onClick={() => setMode('advanced')}>⚙️ Advanced</button>
      </div>

      {/* ── Search ── */}
      <div className="glass-card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={14} style={{ color: 'var(--indigo)' }} /> Search & Add Funds
        </h3>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by fund name, AMC… (e.g., HDFC Small Cap, Axis Bluechip)"
            className="input-field"
            style={{ paddingLeft: 38 }}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
          />
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          {searching && (
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--indigo)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} />
          )}
        </div>

        {flash && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: 12, fontWeight: 600 }}>
            {flash}
          </div>
        )}

        {searchResults.length > 0 && (
          <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, maxHeight: 260, overflowY: 'auto' }}>
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => addFund(r)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', background: 'transparent', border: 'none', borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{r.schemeName}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                    Code: {r.schemeCode} ·{' '}
                    <span style={{ color: r.schemeName?.toLowerCase().includes('regular') ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>
                      {r.schemeName?.toLowerCase().includes('regular') ? 'Regular' : 'Direct'}
                    </span>
                  </p>
                </div>
                <Plus size={14} style={{ color: 'var(--indigo)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Portfolio Summary Banner ── */}
      <div className="glass-card" style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <p className="label-upper" style={{ marginBottom: 3 }}>Total Lumpsum Invested</p>
            <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{formatCurrency(totalLumpsum)}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>One-time amounts already invested across all funds</p>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div>
            <p className="label-upper" style={{ marginBottom: 3 }}>Monthly SIP Commitment</p>
            <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--indigo)' }}>{formatCurrency(totalSIP)}/mo</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Ongoing monthly investment across all funds</p>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div>
            <p className="label-upper" style={{ marginBottom: 3 }}>Funds in Portfolio</p>
            <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{portfolio.length}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Active fund holdings</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/analytics" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, textDecoration: 'none' }}>
            Analytics <ArrowRight size={12} />
          </a>
        </div>
      </div>

      {/* ── Overlap & Diversification Warnings ── */}
      {overlapWarnings.length > 0 && (
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <p className="label-upper" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertTriangle size={12} style={{ color: '#f59e0b' }} /> Portfolio Health Warnings
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overlapWarnings.map((w, i) => (
              <div key={i} style={{
                padding: '10px 14px', borderRadius: 8,
                background: w.level === 'warn' ? 'rgba(245,158,11,0.07)' : 'var(--blue-bg)',
                border: `1px solid ${w.level === 'warn' ? 'rgba(245,158,11,0.25)' : 'var(--blue-border)'}`,
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                {w.level === 'warn'
                  ? <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                  : <Info size={13} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />}
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>{w.msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Info box about the fields ── */}
      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--blue-bg)', border: '1px solid var(--blue-border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--blue)' }}>Lumpsum Invested</strong> = total amount you've already put in as one-time investments.{' '}
          <strong style={{ color: 'var(--indigo)' }}>Monthly SIP</strong> = the amount you invest every month going forward.
          Both are used to calculate your current portfolio value and XIRR.
        </p>
      </div>

      {/* ── Fund Cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {portfolio.map((fund, i) => {
          const isExpanded = expandedFund === fund.scheme_code;
          return (
            <div key={fund.scheme_code} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Fund header row */}
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                    background: `rgba(${['99,102,241', '167,139,250', '52,211,153', '251,191,36', '248,113,113'][i % 5]}, 0.12)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: ['#818cf8','#a78bfa','#34d399','#fbbf24','#f87171'][i % 5],
                  }}>
                    {(shortName(fund.name) || '?')[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>
                        {shortName(fund.name)}
                      </p>
                      <span className={fund.plan_type === 'Direct' ? 'badge-green' : 'badge-yellow'} style={{ fontSize: 10 }}>
                        {fund.plan_type || 'Direct'}
                      </span>
                      {fund.category && fund.category !== 'Unknown' && (
                        <span className="badge-blue" style={{ fontSize: 10 }}>{fund.category}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                      Code: {fund.scheme_code}
                      {fund.transactions?.length > 0 && (
                        <span style={{ marginLeft: 8, color: 'var(--green)', fontWeight: 700 }}>
                          · {fund.transactions.length} {fund.transactions.length === 1 ? 'transaction' : 'transactions'} logged ✓
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Summary numbers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>SIP/mo</p>
                    <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--indigo)' }}>{formatCurrency(fund.monthly_sip)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Invested</p>
                    <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{formatCurrency(fund.investment_amount)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => setExpandedFund(isExpanded ? null : fund.scheme_code)} className="btn-secondary" style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {isExpanded ? 'Less' : 'Edit'}
                    </button>
                    <button onClick={() => removeFund(fund.scheme_code)} className="btn-danger" style={{ padding: '6px 10px' }} aria-label={`Remove ${fund.name || fund.scheme_code} from portfolio`} title="Remove fund">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded edit form */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '18px 20px', background: 'rgba(99,102,241,0.02)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: mode === 'advanced' ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
                    {/* Monthly SIP */}
                    <div>
                      <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Monthly SIP (₹)</label>
                      <input type="number" min="0" step="500" className="input-field" value={fund.monthly_sip}
                        onChange={e => updateFund(fund.scheme_code, 'monthly_sip', Math.max(0, Number(e.target.value) || 0))}
                        placeholder="0" />
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Amount you invest every month</p>
                    </div>

                    {/* Lumpsum Invested */}
                    <div>
                      <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Lumpsum Invested (₹)</label>
                      <input type="number" min="0" step="1000" className="input-field" value={fund.investment_amount}
                        onChange={e => updateFund(fund.scheme_code, 'investment_amount', Math.max(0, Number(e.target.value) || 0))}
                        placeholder="0" />
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>One-time amount already invested</p>
                    </div>

                    {/* SIP Start Date */}
                    <div>
                      <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>SIP Start Date</label>
                      <input type="date" className="input-field" value={fund.purchase_date || ''}
                        onChange={e => updateFund(fund.scheme_code, 'purchase_date', e.target.value)}
                        max={new Date().toISOString().slice(0, 10)} />
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Used for accurate XIRR calculation</p>
                    </div>

                    {/* Plan Type — advanced only */}
                    {mode === 'advanced' && (
                      <div>
                        <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Plan Type</label>
                        <select className="select-field" value={fund.plan_type || 'Direct'}
                          onChange={e => updateFund(fund.scheme_code, 'plan_type', e.target.value)}>
                          <option value="Direct">Direct</option>
                          <option value="Regular">Regular</option>
                        </select>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Direct has lower expense ratio</p>
                      </div>
                    )}

                    {/* Category */}
                    <div>
                      <label className="label-upper" style={{ display: 'block', marginBottom: 6 }}>Category</label>
                      <select className="select-field" value={fund.category || 'Unknown'}
                        onChange={e => updateFund(fund.scheme_code, 'category', e.target.value)}>
                        <option value="Unknown">Unknown</option>
                        <option value="Large Cap">Large Cap</option>
                        <option value="Mid Cap">Mid Cap</option>
                        <option value="Small Cap">Small Cap</option>
                        <option value="Flexi Cap">Flexi Cap</option>
                        <option value="Large & Mid Cap">Large &amp; Mid Cap</option>
                        <option value="ELSS">ELSS</option>
                        <option value="Index">Index</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="Debt">Debt</option>
                        <option value="International">International</option>
                        <option value="Thematic">Thematic</option>
                      </select>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Enables overlap detection</p>
                    </div>
                  </div>

                  {fund.plan_type === 'Regular' && (
                    <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)' }}>
                      <p style={{ fontSize: 11, color: 'var(--amber)' }}>
                        ⚠ Regular plan costs ~0.5–1.5% more per year in expense ratio vs Direct. Consider switching to save significantly over long term.
                      </p>
                    </div>
                  )}

                  {/* ── Transaction Log ── */}
                  <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Clock size={13} style={{ color: 'var(--indigo)' }} /> Transaction History
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                          {fund.transactions?.length > 0
                            ? `${fund.transactions.length} ${fund.transactions.length === 1 ? 'transaction' : 'transactions'} · XIRR computed from actual cash flows`
                            : 'Log actual buys/sells for accurate XIRR instead of estimated SIPs'}
                        </p>
                      </div>
                      <button
                        onClick={() => setTxnForm(txnForm?.fundCode === fund.scheme_code ? null : { fundCode: fund.scheme_code, ...EMPTY_TXN })}
                        style={{
                          padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                          background: 'rgba(99,102,241,0.1)', color: 'var(--indigo)', display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <Plus size={12} /> Add Transaction
                      </button>
                    </div>

                    {/* Add transaction form */}
                    {txnForm?.fundCode === fund.scheme_code && (
                      <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 12 }}>
                        <p className="label-upper" style={{ marginBottom: 10 }}>New Transaction</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                          <div>
                            <label className="label-upper" style={{ display: 'block', marginBottom: 5 }}>Date</label>
                            <input type="date" className="input-field"
                              value={txnForm.date}
                              min={fund.purchase_date || '2000-01-01'}
                              max={new Date().toISOString().slice(0, 10)}
                              onChange={e => setTxnForm(prev => ({ ...prev, date: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label-upper" style={{ display: 'block', marginBottom: 5 }}>Amount (₹)</label>
                            <input type="number" className="input-field" placeholder="e.g. 5000"
                              value={txnForm.amount}
                              onChange={e => setTxnForm(prev => ({ ...prev, amount: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label-upper" style={{ display: 'block', marginBottom: 5 }}>Type</label>
                            <select className="select-field"
                              value={txnForm.type}
                              onChange={e => setTxnForm(prev => ({ ...prev, type: e.target.value }))}>
                              <option value="sip">SIP (monthly buy)</option>
                              <option value="buy">Lumpsum Buy</option>
                              <option value="sell">Sell / Redemption</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => {
                                if (!txnForm.amount || Number(txnForm.amount) <= 0) return;
                                addTransaction(fund.scheme_code, txnForm);
                              }}
                              style={{ padding: '9px 14px', borderRadius: 8, background: 'var(--grad)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                            >
                              <CheckCircle2 size={12} /> Save
                            </button>
                            <button onClick={() => setTxnForm(null)}
                              style={{ padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
                          NAV on the transaction date will be fetched automatically from AMFI data. Buys are negative cash flows; sells are positive.
                        </p>
                      </div>
                    )}

                    {/* Transaction list */}
                    {fund.transactions?.length > 0 ? (() => {
                      const sorted = [...fund.transactions].sort((a, b) => a.date.localeCompare(b.date));
                      const COLLAPSE_AFTER = 8;
                      const isExpanded = !!showAllTxns[fund.scheme_code];
                      const visible = isExpanded ? sorted : sorted.slice(-COLLAPSE_AFTER);
                      const hiddenCount = sorted.length - visible.length;
                      return (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '8px 14px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date</th>
                              <th style={{ textAlign: 'right', padding: '8px 14px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount</th>
                              <th style={{ textAlign: 'left', padding: '8px 14px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</th>
                              <th style={{ textAlign: 'center', padding: '8px 14px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10 }} aria-label="Actions"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {hiddenCount > 0 && (
                              <tr>
                                <td colSpan={4} style={{ padding: '6px 14px', textAlign: 'center' }}>
                                  <button onClick={() => setShowAllTxns(prev => ({ ...prev, [fund.scheme_code]: true }))}
                                    style={{ background: 'none', border: 'none', color: 'var(--indigo)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                    Show {hiddenCount} earlier transaction{hiddenCount === 1 ? '' : 's'}
                                  </button>
                                </td>
                              </tr>
                            )}
                            {visible.map((txn) => {
                              const isEditing = editingTxn?.txnId === txn.id && editingTxn?.fundCode === fund.scheme_code;
                              if (isEditing) {
                                return (
                                  <tr key={txn.id} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.04)' }}>
                                    <td style={{ padding: '6px 10px' }}>
                                      <input type="date" value={editingTxn.date}
                                        onChange={e => setEditingTxn(prev => ({ ...prev, date: e.target.value }))}
                                        style={{ width: '100%', padding: '4px 6px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-1)', color: 'var(--text-1)' }} />
                                    </td>
                                    <td style={{ padding: '6px 10px' }}>
                                      <input type="number" value={editingTxn.amount}
                                        onChange={e => setEditingTxn(prev => ({ ...prev, amount: e.target.value }))}
                                        style={{ width: '100%', padding: '4px 6px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-1)', color: 'var(--text-1)', textAlign: 'right' }} />
                                    </td>
                                    <td style={{ padding: '6px 10px' }}>
                                      <select value={editingTxn.type}
                                        onChange={e => setEditingTxn(prev => ({ ...prev, type: e.target.value }))}
                                        style={{ width: '100%', padding: '4px 6px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-1)', color: 'var(--text-1)' }}>
                                        <option value="sip">SIP</option>
                                        <option value="buy">Buy</option>
                                        <option value="sell">Sell</option>
                                      </select>
                                    </td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      <button onClick={saveEditedTransaction}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', padding: 4 }}>
                                        <Check size={12} />
                                      </button>
                                      <button onClick={() => setEditingTxn(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                                        <X size={12} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              }
                              return (
                              <tr key={txn.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 14px', color: 'var(--text-2)', fontFamily: 'monospace' }}>{txn.date}</td>
                                <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700,
                                  color: txn.type === 'sell' ? 'var(--green)' : 'var(--red)' }}>
                                  {txn.type === 'sell' ? '+' : '-'}₹{Number(txn.amount).toLocaleString('en-IN')}
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                                    background: txn.type === 'sell' ? 'var(--green-bg)' : txn.type === 'sip' ? 'rgba(99,102,241,0.1)' : 'var(--blue-bg)',
                                    color: txn.type === 'sell' ? 'var(--green)' : txn.type === 'sip' ? 'var(--indigo)' : 'var(--blue)',
                                  }}>
                                    {txn.type === 'sip' ? 'SIP' : txn.type === 'sell' ? 'Sell' : 'Buy'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <button onClick={() => setEditingTxn({ fundCode: fund.scheme_code, txnId: txn.id, date: txn.date, amount: txn.amount, type: txn.type })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6 }}>
                                    <Pencil size={11} />
                                  </button>
                                  <button onClick={() => removeTransaction(fund.scheme_code, txn.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6 }}>
                                    <Trash2 size={11} />
                                  </button>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{ padding: '8px 14px', background: 'rgba(52,211,153,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <CheckCircle2 size={12} style={{ color: 'var(--green)' }} />
                            <p style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                              XIRR and portfolio value will be computed from these actual transactions
                            </p>
                          </span>
                          {isExpanded && sorted.length > COLLAPSE_AFTER && (
                            <button onClick={() => setShowAllTxns(prev => ({ ...prev, [fund.scheme_code]: false }))}
                              style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                              Collapse
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })() : (
                      <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        No transactions logged yet. Without them, XIRR is estimated from the SIP amount and start date above.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {portfolio.length === 0 && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Briefcase size={40} style={{ margin: '0 auto 14px', opacity: 0.25, display: 'block' }} />
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>No funds added yet.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>Search for a fund above or use the Fund Browser to explore categories.</p>
          <a href="/funds" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13, textDecoration: 'none' }}>
            Browse Funds <ArrowRight size={12} />
          </a>
        </div>
      )}
    </div>
  );
}
