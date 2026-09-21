import React, { createContext, useContext, useReducer } from 'react';

const StockContext = createContext(null);

const initialState = {
  symbol: null,
  stockName: null,
  quote: null,
};

function stockReducer(state, action) {
  switch (action.type) {
    case 'SET_STOCK':
      return { ...state, symbol: action.payload.symbol, stockName: action.payload.name || state.stockName };
    case 'SET_QUOTE':
      return { ...state, quote: action.payload, stockName: action.payload.name || state.stockName };
    case 'CLEAR':
      return initialState;
    default:
      return state;
  }
}

export function StockProvider({ children }) {
  const [state, dispatch] = useReducer(stockReducer, initialState);
  return (
    <StockContext.Provider value={{ state, dispatch }}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
}
