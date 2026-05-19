import { useState, useEffect } from 'react';
import { AuthContext } from './auth';
import { getMe } from '../services/api';
import { savePortfolio } from '../utils/portfolioStore';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  // `null` while we're checking the server on boot, then `true` once hydrated.
  // Other components can wait on this before performing writes that would
  // otherwise overwrite server data with stale localStorage.
  const [hydrated, setHydrated] = useState(false);

  const token = localStorage.getItem('auth_token') || null;

  // On app boot: if a token is present, fetch the canonical portfolio from the
  // server and write it to localStorage. Without this, a user whose
  // localStorage was cleared (or who refreshed on a different device) could
  // overwrite their server-side portfolio with the empty/stale local copy.
  useEffect(() => {
    let cancelled = false;
    if (!token) { setHydrated(true); return; }
    getMe()
      .then(r => {
        if (cancelled) return;
        const serverPortfolio = r.data?.portfolio;
        if (Array.isArray(serverPortfolio)) {
          savePortfolio(serverPortfolio);
          // Notify same-tab listeners (the `storage` event only fires on other tabs).
          window.dispatchEvent(new Event('portfolio-hydrated'));
        }
      })
      .catch(err => {
        // 401 → expired/invalid token. Drop credentials so we stop trying.
        if (err?.response?.status === 401) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          setUser(null);
        }
      })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
    // Run once on mount; token can only change via login/logout which already
    // manage state directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(username, newToken) {
    const u = { username };
    setUser(u);
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('auth_token', newToken);
    setHydrated(true);
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
    // Keep portfolio in localStorage so anonymous mode still has data
  }

  return (
    <AuthContext.Provider value={{ user, token, hydrated, login, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}
