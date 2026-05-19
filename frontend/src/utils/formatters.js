export const formatCurrency = (n) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n < 0) return '-₹' + formatCurrency(Math.abs(n)).slice(1);
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
  return '₹' + Math.round(n).toLocaleString('en-IN');
};

export const formatPercent = (n, decimals = 1) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
};

export const formatNumber = (n, decimals = 2) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: decimals });
};

export const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Singular/plural helper — pluralize('fund', 1) → 'fund', pluralize('fund', 3) → 'funds'
export const pluralize = (word, n, plural = null) => {
  return n === 1 ? word : (plural || word + 's');
};

export const getReturnColor = (value) => {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
};

export const CHART_COLORS = [
  '#6366f1', '#a78bfa', '#22c55e', '#eab308', '#ef4444',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6',
];
