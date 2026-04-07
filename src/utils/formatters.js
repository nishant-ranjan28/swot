/**
 * Format large numbers with currency-appropriate units.
 * INR: Cr/L | USD: B/M/K
 */
export const formatNumber = (num, currency = '₹') => {
  if (num == null || isNaN(num)) return 'N/A';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (currency === '$') {
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
    return `${sign}$${abs.toLocaleString('en-US')}`;
  }
  if (abs >= 1e12) return `${sign}₹${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
};

/**
 * Format currency values (same as formatNumber but for financial statements).
 */
export const formatCurrency = formatNumber;

/**
 * Format a ratio/number with fixed decimals.
 */
export const formatVal = (val, suffix = '') => {
  if (val == null) return '-';
  return `${typeof val === 'number' ? val.toFixed(2) : val}${suffix}`;
};

/**
 * Format percentage from a decimal value (e.g., 0.18 -> "18.00%").
 */
export const formatPercent = (val) => (val != null ? `${(val * 100).toFixed(2)}%` : 'N/A');

/**
 * Format ratio with 2 decimals.
 */
export const formatRatio = (val) => (val != null ? val.toFixed(2) : 'N/A');

/**
 * Get locale string based on currency.
 */
export const getLocale = (currency) => currency === '$' ? 'en-US' : 'en-IN';
