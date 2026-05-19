import { useState, useEffect } from 'react';
import { Search, Plus, CheckCircle, Globe, TrendingUp, Shield, Landmark, BarChart3, Leaf, Gem, BookOpen, ExternalLink } from 'lucide-react';
import { getSchemes, getFundReturns } from '../services/api';
import { savePortfolio, syncPortfolioToServer } from '../utils/portfolioStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { formatPercent, formatDate } from '../utils/formatters';

const CATEGORY_META = {
  'All':             { icon: BarChart3,  color: '#818cf8', desc: 'All mutual fund categories' },
  'Large Cap':       { icon: TrendingUp, color: '#60a5fa', desc: 'Top 100 companies by market cap — lower risk, stable growth' },
  'Large & Mid Cap': { icon: TrendingUp, color: '#818cf8', desc: 'Blend of blue-chips and emerging leaders' },
  'Multi Cap':       { icon: BarChart3,  color: '#a78bfa', desc: 'Mandatory 25% each in large, mid & small cap — well-rounded' },
  'Mid Cap':         { icon: BarChart3,  color: '#a78bfa', desc: 'Companies ranked 101–250 — higher growth potential' },
  'Small Cap':       { icon: BarChart3,  color: '#f87171', desc: 'Companies ranked 251+ — highest risk and reward' },
  'Flexi Cap':       { icon: Leaf,       color: '#34d399', desc: 'Fund manager can freely allocate across cap sizes' },
  'Value & Contra':  { icon: BookOpen,   color: '#f59e0b', desc: 'Undervalued stocks or contrarian approach — long-term potential' },
  'International':   { icon: Globe,      color: '#fbbf24', desc: 'Exposure to US, global equity markets (NASDAQ, S&P 500)' },
  'Gold & Silver':   { icon: Gem,        color: '#f59e0b', desc: 'Metal-backed funds — gold ETF, silver ETF, commodity FoF' },
  'ELSS':            { icon: Shield,     color: '#34d399', desc: 'Tax-saving equity funds with 3-year lock-in (Sec 80C)' },
  'Thematic':        { icon: TrendingUp, color: '#f87171', desc: 'Sector / thematic bets — tech, defence, digital, infra' },
  'Debt':            { icon: Landmark,   color: '#60a5fa', desc: 'Fixed income — bonds, T-bills, short-term debt instruments' },
  'Index Funds':     { icon: BarChart3,  color: '#818cf8', desc: 'Passive funds tracking Nifty 50, Sensex and other indices' },
  'ETFs':            { icon: BarChart3,  color: '#a78bfa', desc: 'Exchange-Traded Funds — buy/sell on exchange like stocks' },
  'Hybrid':          { icon: BarChart3,  color: '#f87171', desc: 'Mix of equity and debt — balanced risk-return profile' },
};

const RISK_MAP = {
  'Large Cap':       { level: 'Low-Medium',  color: '#60a5fa' },
  'Large & Mid Cap': { level: 'Medium',      color: '#818cf8' },
  'Multi Cap':       { level: 'Medium',      color: '#a78bfa' },
  'Mid Cap':         { level: 'Medium-High', color: '#a78bfa' },
  'Small Cap':       { level: 'High',        color: '#f87171' },
  'Flexi Cap':       { level: 'Medium',      color: '#34d399' },
  'Value & Contra':  { level: 'Medium-High', color: '#f59e0b' },
  'International':   { level: 'Medium-High', color: '#fbbf24' },
  'Gold & Silver':   { level: 'Medium',      color: '#f59e0b' },
  'ELSS':            { level: 'Medium-High', color: '#34d399' },
  'Thematic':        { level: 'High',        color: '#f87171' },
  'Debt':            { level: 'Low',         color: '#60a5fa' },
  'Index Funds':     { level: 'Medium',      color: '#818cf8' },
  'ETFs':            { level: 'Medium',      color: '#a78bfa' },
  'Hybrid':          { level: 'Low-Medium',  color: '#f87171' },
};

const CATEGORIES = [
  'All', 'Large Cap', 'Large & Mid Cap', 'Multi Cap', 'Mid Cap', 'Small Cap',
  'Flexi Cap', 'Value & Contra', 'International', 'Gold & Silver', 'ELSS',
  'Thematic', 'Debt', 'Index Funds', 'ETFs', 'Hybrid',
];

export default function FundBrowser() {
  const [schemes, setSchemes]       = useState([]);
  const [category, setCategory]     = useState('All');
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(true);
  const portfolio                    = usePortfolio();
  const [addedSet, setAddedSet]     = useState(new Set());
  const [fundStats, setFundStats]   = useState({});   // scheme_code → { current_nav, nav_date, return_1y, … }
  const [statsLoading, setStatsLoading] = useState(new Set()); // codes currently being fetched

  useEffect(() => {
    setAddedSet(new Set(portfolio.map(f => f.scheme_code)));
  }, [portfolio]);

  useEffect(() => {
    fetchSchemes(category);
  }, [category]);

  async function fetchSchemes(cat) {
    setLoading(true);
    try {
      const r = await getSchemes(cat === 'All' ? null : cat);
      const loaded = r.data.schemes || [];
      setSchemes(loaded);
      // Eagerly fetch returns for first 15 funds (they're cached after first hit)
      fetchReturnsBatch(loaded.slice(0, 15));
    } catch {
      setSchemes([]);
    }
    setLoading(false);
  }

  function fetchReturnsBatch(schemeBatch) {
    const toFetch = schemeBatch.filter(s => !(s.code in fundStats));
    if (toFetch.length === 0) return;
    setStatsLoading(prev => new Set([...prev, ...toFetch.map(s => s.code)]));
    Promise.all(
      toFetch.map(s =>
        getFundReturns(s.code)
          .then(r => ({ code: s.code, data: r.data }))
          .catch(() => ({ code: s.code, data: null }))
      )
    ).then(results => {
      setFundStats(prev => {
        const next = { ...prev };
        results.forEach(({ code, data }) => { next[code] = data; });
        return next;
      });
      setStatsLoading(prev => {
        const next = new Set(prev);
        results.forEach(({ code }) => next.delete(code));
        return next;
      });
    });
  }

  function addToPortfolio(scheme) {
    if (addedSet.has(scheme.code)) return;
    const updated = [...portfolio, {
      scheme_code:       scheme.code,
      name:              scheme.name,
      category:          scheme.category,
      monthly_sip:       5000,
      investment_amount: 0,
      purchase_date:     new Date().toISOString().slice(0, 10),
      plan_type:         scheme.name?.toLowerCase().includes('regular') ? 'Regular' : 'Direct',
    }];
    savePortfolio(updated);
    syncPortfolioToServer(updated);
    setAddedSet(new Set(updated.map(f => f.scheme_code)));
  }

  function removeFromPortfolio(scheme) {
    const updated = portfolio.filter(f => f.scheme_code !== scheme.code);
    savePortfolio(updated);
    syncPortfolioToServer(updated);
    setAddedSet(new Set(updated.map(f => f.scheme_code)));
  }

  const filtered = schemes.filter(s =>
    !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.house?.toLowerCase().includes(query.toLowerCase())
  );

  const catMeta = CATEGORY_META[category] || CATEGORY_META['All'];
  const CatIcon = catMeta.icon;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Fund Browser</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Discover and add funds by category — click any fund to add it to your portfolio
        </p>
      </div>

      {/* ── Category description ── */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${catMeta.color}18`, border: `1px solid ${catMeta.color}30`,
        }}>
          <CatIcon size={20} style={{ color: catMeta.color }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{category}</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{catMeta.desc}</p>
        </div>
        {category !== 'All' && RISK_MAP[category] && (
          <div style={{ textAlign: 'right' }}>
            <p className="label-upper">Risk Level</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: RISK_MAP[category].color, marginTop: 3 }}>
              {RISK_MAP[category].level}
            </p>
          </div>
        )}
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            style={{
              padding: '7px 14px',
              borderRadius: 20,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.16s',
              background: category === cat ? 'var(--grad)' : 'rgba(99,102,241,0.07)',
              color: category === cat ? '#fff' : 'var(--text-3)',
              boxShadow: category === cat ? '0 2px 10px rgba(99,102,241,0.35)' : 'none',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* ── Search within category ── */}
      <div style={{ position: 'relative', maxWidth: 420 }}>
        <input
          type="text"
          placeholder={`Search in ${category}…`}
          className="input-field"
          style={{ paddingLeft: 38 }}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        {query && (
          <button onClick={() => setQuery('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16, padding: '2px 8px', borderRadius: 6 }}
            title="Clear search">×</button>
        )}
      </div>

      {/* ── Fund Grid ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
          <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTop: '2px solid var(--indigo)', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', margin: '0 auto 14px' }} />
          Loading funds…
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {filtered.length} fund{filtered.length !== 1 ? 's' : ''} in <strong style={{ color: 'var(--text-2)' }}>{category}</strong>
            {addedSet.size > 0 && <span> · <span style={{ color: 'var(--green)' }}>{addedSet.size} in portfolio</span></span>}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {filtered.map((scheme, i) => {
              const inPortfolio = addedSet.has(scheme.code);
              const isDirect = !scheme.name?.toLowerCase().includes('regular');
              return (
                <div
                  key={`${scheme.code}-${i}`}
                  className="glass-card"
                  style={{
                    padding: '18px 20px',
                    border: inPortfolio ? '1px solid var(--green-border)' : '1px solid var(--border)',
                    background: inPortfolio ? 'rgba(52,211,153,0.03)' : undefined,
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                >
                  {/* Fund header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                      background: `${catMeta.color}15`,
                      color: catMeta.color,
                      border: `1px solid ${catMeta.color}25`,
                    }}>
                      {(scheme.house || scheme.name || '?')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.4 }}>
                        {scheme.name.replace(/\s*-\s*(Direct|Regular)\s*(Growth|Plan)?\s*/i, '').trim()}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                        {scheme.house} · Code: {scheme.code}
                      </p>
                    </div>
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge-blue" style={{ fontSize: 10 }}>{scheme.category}</span>
                    <span className={isDirect ? 'badge-green' : 'badge-yellow'} style={{ fontSize: 10 }}>
                      {isDirect ? 'Direct' : 'Regular'}
                    </span>
                    {RISK_MAP[scheme.category] && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99,
                        background: `${RISK_MAP[scheme.category].color}15`,
                        color: RISK_MAP[scheme.category].color,
                        border: `1px solid ${RISK_MAP[scheme.category].color}25`,
                      }}>
                        {RISK_MAP[scheme.category].level} Risk
                      </span>
                    )}
                  </div>

                  {/* NAV & Returns */}
                  {(() => {
                    const stats = fundStats[scheme.code];
                    const isLoadingStat = statsLoading.has(scheme.code);
                    if (isLoadingStat && !stats) {
                      // Skeleton loader
                      return (
                        <div style={{ padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ width: 90, height: 11, borderRadius: 4, background: 'rgba(99,102,241,0.1)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                            <div style={{ width: 60, height: 11, borderRadius: 4, background: 'rgba(99,102,241,0.07)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                          </div>
                          <div style={{ display: 'flex', gap: 16 }}>
                            {['1Y','3Y','5Y'].map(l => (
                              <div key={l} style={{ flex: 1 }}>
                                <div style={{ width: 20, height: 9, borderRadius: 3, background: 'rgba(99,102,241,0.07)', marginBottom: 4 }} />
                                <div style={{ width: 36, height: 13, borderRadius: 4, background: 'rgba(99,102,241,0.1)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    if (!stats) return null; // not yet queued to fetch
                    const retColor = v => v == null ? 'var(--text-3)' : v >= 0 ? 'var(--green)' : 'var(--red)';
                    return (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        {/* Current NAV */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 10, color: 'var(--text-3)', marginRight: 4 }}>NAV</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                              ₹{stats.current_nav?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>as of {formatDate(stats.nav_date)}</span>
                        </div>
                        {/* Period Returns */}
                        <div style={{ display: 'flex', gap: 0 }}>
                          {[['1Y', stats.return_1y], ['3Y', stats.return_3y], ['5Y', stats.return_5y]].map(([label, val], idx) => (
                            <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: idx < 2 ? '1px solid var(--border)' : 'none' }}>
                              <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>{label} CAGR</p>
                              <p style={{ fontSize: 13, fontWeight: 800, color: retColor(val), fontFamily: 'monospace' }}>
                                {val != null ? formatPercent(val, 1) : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                        {/* AUM disclaimer */}
                        <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
                          AUM & expense ratio not available from MFAPI —
                          <a href="https://www.amfiindia.com/nav-history" target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--indigo)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            AMFIIndia.com <ExternalLink size={8} />
                          </a>
                        </p>
                      </div>
                    );
                  })()}

                  {/* Add/Remove button */}
                  <button
                    onClick={() => inPortfolio ? removeFromPortfolio(scheme) : addToPortfolio(scheme)}
                    style={{
                      width: '100%', padding: '9px', borderRadius: 9,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: 'none', transition: 'all 0.16s',
                      background: inPortfolio ? 'var(--green-bg)' : 'var(--grad)',
                      color: inPortfolio ? 'var(--green)' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      boxShadow: inPortfolio ? 'none' : '0 2px 10px rgba(99,102,241,0.3)',
                    }}
                    title={inPortfolio ? 'Click to remove from portfolio' : 'Add this fund to your portfolio'}
                  >
                    {inPortfolio ? <><CheckCircle size={13} /> In Portfolio — Remove</> : <><Plus size={13} /> Add to Portfolio</>}
                  </button>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
              <BookOpen size={36} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
              <p>No funds found for "{query}" in {category}</p>
            </div>
          )}
        </>
      )}

      {/* ── Portfolio added notice ── */}
      {addedSet.size > 0 && (
        <div style={{ padding: '12px 18px', borderRadius: 10, background: 'var(--green-bg)', border: '1px solid var(--green-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            ✓ {addedSet.size} fund{addedSet.size !== 1 ? 's' : ''} in your portfolio — all changes auto-saved
          </p>
          <a href="/portfolio" style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            View Portfolio →
          </a>
        </div>
      )}
    </div>
  );
}
