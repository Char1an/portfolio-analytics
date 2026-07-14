const STORAGE_KEY = 'portfolio_funds_v2';

export const DEFAULT_FUNDS = [
  {
    scheme_code: '125354',
    name: 'Nippon India Small Cap Fund - Direct Growth',
    category: 'Small Cap',
    monthly_sip: 6000,
    investment_amount: 48081,
    purchase_date: '2021-01-01',
    plan_type: 'Direct',
  },
  {
    scheme_code: '122639',
    name: 'Parag Parikh Flexi Cap Fund - Direct Growth',
    category: 'Flexi Cap',
    monthly_sip: 5000,
    investment_amount: 18561,
    purchase_date: '2022-04-01',
    plan_type: 'Direct',
  },
  {
    scheme_code: '127042',
    name: 'Motilal Oswal Midcap Fund - Direct Growth',
    category: 'Mid Cap',
    monthly_sip: 5000,
    investment_amount: 5000,
    purchase_date: '2023-08-01',
    plan_type: 'Direct',
  },
];

// One-time migrations for portfolios stored in localStorage by older builds.
// Each entry: predicate → replacement. Runs silently on every loadPortfolio()
// so users on stale data don't have to hit Reset manually.
const SCHEME_MIGRATIONS = {
  // '149934' was mislabeled as Motilal Oswal Midcap in an earlier demo
  // portfolio; it's actually HDFC FMP 1162D (a debt FMP that matured
  // May 2025). Replace it with the real Motilal Oswal Midcap scheme.
  '149934': { scheme_code: '127042', name: 'Motilal Oswal Midcap Fund - Direct Growth', category: 'Mid Cap' },
};

function migratePortfolio(funds) {
  let changed = false;
  const migrated = funds.map(f => {
    const patch = SCHEME_MIGRATIONS[f.scheme_code];
    if (!patch) return f;
    changed = true;
    return { ...f, ...patch };
  });
  return { funds: migrated, changed };
}

export function loadPortfolio() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const { funds, changed } = migratePortfolio(parsed);
        // Persist migrated version so the migration only runs once.
        if (changed) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(funds)); } catch {}
        }
        return funds;
      }
    }
  } catch {
    // Ignore storage/JSON errors and fall back to an empty portfolio.
  }
  // New users start with an empty portfolio. Sample funds are opt-in via the
  // "Reset to sample portfolio" button in Portfolio Builder (uses DEFAULT_FUNDS).
  return [];
}

export function savePortfolio(funds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(funds));
    window.dispatchEvent(new Event('portfolio-updated'));
  } catch {
    // Ignore quota/private-mode errors.
  }
}

/**
 * Silently sync portfolio to server if the user is logged in.
 * Fires-and-forgets — does not block the UI.
 */
export function syncPortfolioToServer(funds) {
  const token = localStorage.getItem('auth_token');
  if (!token) return;
  import('../services/api').then(({ savePortfolioServer }) => {
    savePortfolioServer(funds).catch(() => {/* silent — offline or token expired */});
  });
}
