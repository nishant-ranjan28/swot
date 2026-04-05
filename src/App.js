import React, { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import NewsPage from './components/NewsPage';
import Header from './components/Header';
import HomePage from './components/HomePage';
import StockDetailPage from './components/StockDetail/StockDetailPage';
import ScreenerPage from './components/ScreenerPage';
import ScannerPage from './components/ScannerPage';
import CalculatorPage from './components/CalculatorPage';
import WatchlistPage from './components/WatchlistPage';
import PortfolioPage from './components/PortfolioPage';
import ComparePage from './components/ComparePage';
import { useAlertNotifications } from './hooks/useAlertNotifications';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  useAlertNotifications();

  return (
    <div>
      <ScrollToTop />
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stock/:symbol" element={<StockDetailPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/scanner" element={<ScannerPage />} />
        <Route path="/calculator" element={<CalculatorPage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  );
}

export default App;
