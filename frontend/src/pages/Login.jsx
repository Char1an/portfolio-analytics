import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, User, Lock, LogIn, UserPlus, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { registerUser, loginUser } from '../services/api';
import { useAuth } from '../contexts/auth';
import { savePortfolio } from '../utils/portfolioStore';

export default function Login() {
  const [mode, setMode]         = useState('login');   // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const { login }               = useAuth();
  const navigate                = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const fn   = mode === 'register' ? registerUser : loginUser;
      const resp = await fn({ username: username.trim(), password });
      const { token, username: uname, portfolio } = resp.data;

      // Write server portfolio to localStorage so all pages pick it up
      if (Array.isArray(portfolio) && portfolio.length > 0) {
        savePortfolio(portfolio);
      }

      login(uname, token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong — please try again');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #060c1e 0%, #060a18 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient blobs */}
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(99,102,241,0.07)', filter: 'blur(100px)', top: -200, left: -200, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(124,58,237,0.05)', filter: 'blur(80px)', bottom: -150, right: -150, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(139,92,246,0.22) 100%)',
            border: '1px solid rgba(99,102,241,0.35)',
            boxShadow: '0 0 30px rgba(99,102,241,0.2)',
          }}>
            <TrendingUp size={26} color="#818cf8" strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#e2e8f0' }}>
            Folio <span style={{ background: 'linear-gradient(135deg,#818cf8,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Klarity</span>
          </h1>
          <p style={{ fontSize: 11, color: '#3d4a6b', marginTop: 4, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Analytics Pro
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 20,
          padding: '32px 32px 28px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', background: 'rgba(99,102,241,0.07)', borderRadius: 12, padding: 4, marginBottom: 28 }}>
            {[['login', 'Log In', LogIn], ['register', 'Register', UserPlus]].map(([m, label, icon]) => {
              const Icon = icon;
              return (
                <button key={m} onClick={() => { setMode(m); setError(''); }}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, transition: 'all 0.18s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: mode === m ? 'linear-gradient(135deg,#6366f1,#7c3aed)' : 'transparent',
                    color: mode === m ? '#fff' : '#4a5580',
                    boxShadow: mode === m ? '0 2px 12px rgba(99,102,241,0.35)' : 'none',
                  }}
                >
                  {Icon && <Icon size={13} />} {label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#4a5580', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#3d4a6b' }} />
                <input
                  type="text" autoComplete="username" autoFocus
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. rahul_investor"
                  style={{
                    width: '100%', padding: '11px 14px 11px 38px', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.18)',
                    borderRadius: 10, color: '#e2e8f0', fontSize: 13, outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(99,102,241,0.18)'}
                />
              </div>
              {mode === 'register' && (
                <p style={{ fontSize: 10, color: '#3d4a6b', marginTop: 5 }}>3+ characters, letters/numbers/hyphens only</p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#4a5580', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#3d4a6b' }} />
                <input
                  type={showPw ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyUp={e => setCapsLock(e.getModifierState && e.getModifierState('CapsLock'))}
                  placeholder={mode === 'register' ? 'Choose a password (4+ chars)' : 'Your password'}
                  style={{
                    width: '100%', padding: '11px 40px 11px 38px', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.18)',
                    borderRadius: 10, color: '#e2e8f0', fontSize: 13, outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(99,102,241,0.18)'}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#3d4a6b', padding: 2 }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {capsLock && (
                <p style={{ fontSize: 10, color: '#f59e0b', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={10} /> Caps Lock is on
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', gap: 8, marginBottom: 16 }}>
                <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading || !username.trim() || !password}
              style={{
                width: '100%', padding: '12px', borderRadius: 11, border: 'none', cursor: loading ? 'wait' : 'pointer',
                background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '0.01em',
                boxShadow: '0 4px 18px rgba(99,102,241,0.4)',
                opacity: (!username.trim() || !password) ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.16s',
              }}
            >
              {loading
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spinRing 0.9s linear infinite' }} /> Processing…</>
                : mode === 'login' ? <><LogIn size={14} /> Log In</> : <><UserPlus size={14} /> Create Account</>
              }
            </button>
          </form>

          {/* Switch mode */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#3d4a6b', marginTop: 20 }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', fontWeight: 700, fontSize: 12, padding: 0 }}>
              {mode === 'login' ? 'Register' : 'Log In'}
            </button>
          </p>
        </div>

        {/* Anonymous mode notice */}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#2e3660', marginTop: 20, lineHeight: 1.6 }}>
          No account? Your portfolio is still saved locally in this browser.
          Create an account to sync across devices and share access.
        </p>
      </div>
    </div>
  );
}
