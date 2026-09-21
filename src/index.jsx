import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import { StockProvider } from './context/StockContext';
import { MarketProvider } from './context/MarketContext';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <MarketProvider>
      <ThemeProvider>
        <StockProvider>
          <App />
        </StockProvider>
      </ThemeProvider>
    </MarketProvider>
  </Router>,
);
