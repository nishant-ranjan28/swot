export const SEEN_FLAG_KEY = (market) => `stockpulse_portfolio_seen_${market}`;

const demoRow = (row) => ({ ...row, id: `demo-${row.symbol}`, isDemo: true });

export const SAMPLE_HOLDINGS_IN = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', quantity: 50, buyPrice: 1280.0, buyDate: '2025-01-15' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', quantity: 25, buyPrice: 3450.0, buyDate: '2024-11-22' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', quantity: 75, buyPrice: 1620.0, buyDate: '2025-03-10' },
  { symbol: 'ITC.NS', name: 'ITC', quantity: 200, buyPrice: 425.0, buyDate: '2025-04-18' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', quantity: 60, buyPrice: 1850.0, buyDate: '2025-02-05' },
].map(demoRow);

export const SAMPLE_HOLDINGS_US = [
  { symbol: 'AAPL', name: 'Apple', quantity: 30, buyPrice: 175.0, buyDate: '2024-09-12' },
  { symbol: 'MSFT', name: 'Microsoft', quantity: 20, buyPrice: 380.0, buyDate: '2024-12-03' },
  { symbol: 'NVDA', name: 'NVIDIA', quantity: 15, buyPrice: 110.0, buyDate: '2025-01-20' },
  { symbol: 'AMZN', name: 'Amazon', quantity: 25, buyPrice: 220.0, buyDate: '2025-02-14' },
  { symbol: 'GOOGL', name: 'Alphabet', quantity: 20, buyPrice: 195.0, buyDate: '2025-03-25' },
].map(demoRow);

export const getSampleHoldings = (market) =>
  market === 'us' ? SAMPLE_HOLDINGS_US : SAMPLE_HOLDINGS_IN;
