import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, BarChart3, Brain, Flame,
  Settings2, TrendingUp, Target, Receipt, Search,
  LogIn, LogOut, User, Activity, Layers, FlaskConical,
  Banknote, GitCompare, Sliders, Clock,
} from 'lucide-react';
import { useAuth } from '../../contexts/auth';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
      { to: '/funds', icon: Search, label: 'Fund Browser' },
      { to: '/compare', icon: GitCompare, label: 'Compare Funds' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/time-machine', icon: Clock, label: 'Time Machine' },
      { to: '/forecast', icon: Brain, label: 'ML Forecast' },
      { to: '/simulation', icon: Flame, label: 'Simulation' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/optimizer', icon: Settings2, label: 'Optimizer' },
      { to: '/rebalance', icon: Sliders, label: 'Rebalance Sim' },
      { to: '/goal', icon: Target, label: 'Goal Planner' },
      { to: '/swp', icon: Banknote, label: 'SWP Calculator' },
      { to: '/tax', icon: Receipt, label: 'Tax Planning' },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { to: '/regime',             icon: Activity,      label: 'Regime Analysis' },
      { to: '/overlap',            icon: Layers,        label: 'Portfolio Overlap' },
      { to: '/factor-attribution', icon: FlaskConical,  label: 'Factor Attribution' },
    ],
  },
];

export default function Sidebar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside
      className="sidebar-root"
      style={{
        position: 'fixed',
        left: 0, top: 0,
        height: '100vh',
        width: 236,
        background: '#faf7f1',
        borderRight: '1px solid #ddd5c4',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* ── Logo ── */}
      <div
        className="sidebar-logo"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '22px 18px 18px',
          borderBottom: '1px solid #ddd5c4',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(139,118,53,0.14) 0%, rgba(160,138,62,0.14) 100%)',
          border: '1px solid rgba(139,118,53,0.25)',
          boxShadow: '0 2px 8px rgba(139,118,53,0.08)',
          flexShrink: 0,
        }}>
          <TrendingUp size={19} color="#8b7635" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-gradient" style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            Folio Klarity
          </h1>
          <p style={{ fontSize: 9.5, color: '#9a9283', marginTop: 2, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Analytics Pro
          </p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: gi < NAV_GROUPS.length - 1 ? 16 : 0 }}>
            <p className="nav-section-label">{group.label}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  {({ isActive }) => (
                    <>
                      {Icon && <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />}
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer / User Panel ── */}
      <div style={{ borderTop: '1px solid #ddd5c4' }}>
        {/* Live data indicator */}
        <div style={{ padding: '8px 18px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#4a7c59',
            display: 'inline-block', animation: 'pulseDot 2s ease-in-out infinite',
            boxShadow: '0 0 5px rgba(74,124,89,0.3)',
          }} />
          <span style={{ fontSize: 9, color: '#9a9283', fontWeight: 600, letterSpacing: '0.08em' }}>
            LIVE · MFAPI.in
          </span>
        </div>

        {/* Auth row */}
        {isLoggedIn ? (
          <div style={{ padding: '10px 14px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: 'rgba(139,118,53,0.1)',
              border: '1px solid rgba(139,118,53,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={14} color="#8b7635" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#2d2a24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </p>
              <p style={{ fontSize: 9, color: '#4a7c59', fontWeight: 600, marginTop: 1 }}>Synced to cloud</p>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              style={{
                background: 'rgba(181,64,58,0.06)', border: '1px solid rgba(181,64,58,0.18)',
                borderRadius: 7, padding: '5px 7px', cursor: 'pointer', color: '#b5403a', flexShrink: 0,
              }}
            >
              <LogOut size={12} />
            </button>
          </div>
        ) : (
          <div style={{ padding: '10px 14px 14px' }}>
            <NavLink to="/login"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 9,
                background: 'rgba(139,118,53,0.07)', border: '1px solid rgba(139,118,53,0.2)',
                color: '#8b7635', fontSize: 11, fontWeight: 700, textDecoration: 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,118,53,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,118,53,0.07)'; }}
            >
              <LogIn size={13} />
              Log in / Register
              <span style={{ marginLeft: 'auto', fontSize: 9, color: '#9a9283' }}>Save to cloud</span>
            </NavLink>
          </div>
        )}
      </div>
    </aside>
  );
}
