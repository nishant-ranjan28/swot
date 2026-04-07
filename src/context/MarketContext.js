import React, { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const MarketContext = createContext(null);

export function MarketProvider({ children }) {
  const [market, setMarket] = useLocalStorage('stockpulse_market', 'in');

  const toggleMarket = () => setMarket(prev => prev === 'in' ? 'us' : 'in');
  const currency = market === 'in' ? '₹' : '$';
  const marketLabel = market === 'in' ? 'India' : 'USA';

  return (
    <MarketContext.Provider value={{ market, setMarket, toggleMarket, currency, marketLabel }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useMarket must be used within MarketProvider');
  return context;
}
