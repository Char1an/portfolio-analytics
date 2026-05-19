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
    scheme_code: '149934',
    name: 'Motilal Oswal Midcap Fund - Direct Growth',
    category: 'Mid Cap',
    monthly_sip: 5000,
    investment_amount: 5000,
    purchase_date: '2023-01-01',
    plan_type: 'Direct',
  },
];

export function loadPortfolio() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
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
