import React, { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import { useMarket } from './context/MarketContext';
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
import BacktestPage from './components/BacktestPage';
import CryptoPage from './components/CryptoPage';
import CommoditiesPage from './components/CommoditiesPage';
import ForexPage from './components/ForexPage';
import EarningsCalendarPage from './components/EarningsCalendarPage';
import GlossaryPage from './components/GlossaryPage';
import EconomicCalendarPage from './components/EconomicCalendarPage';
import SectorHeatmapPage from './components/SectorHeatmapPage';
import TaxCalculatorPage from './components/TaxCalculatorPage';
import IpoPage from './components/IpoPage';
import DealsPage from './components/DealsPage';
import FiiDiiPage from './components/FiiDiiPage';
import MacroPage from './components/MacroPage';
import MutualFundPage from './components/MutualFundPage';
import EtfPage from './components/EtfPage';
import TrendingPage from './components/TrendingPage';
import { useAlertNotifications } from './hooks/useAlertNotifications';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function MarketHomePage() {
  const { setMarket } = useMarket();
  const location = useLocation();

  useEffect(() => {
    const match = location.pathname.match(/^\/(in|us)$/i);
    const m = match?.[1]?.toLowerCase();
    if (m === 'in' || m === 'us') {
      setMarket(m);
      showToast(`Switched to ${m === 'in' ? 'Indian' : 'US'} market`);
    }
  }, [location.pathname, setMarket]);

  return <HomePage />;
}

let toastTimeout = null;
function showToast(message) {
  // Remove existing toast
  const existing = document.getElementById('market-toast');
  if (existing) existing.remove();
  if (toastTimeout) clearTimeout(toastTimeout);

  const toast = document.createElement('div');
  toast.id = 'market-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
  toast.textContent = message;
  document.body.appendChild(toast);

  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function App() {
  useAlertNotifications();

  return (
    <div>
      <ScrollToTop />
      <Header />
      <Routes>
        <Route path="/in" element={<MarketHomePage />} />
        <Route path="/us" element={<MarketHomePage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/stock/:symbol" element={<StockDetailPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/scanner" element={<ScannerPage />} />
        <Route path="/calculator" element={<CalculatorPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/crypto" element={<CryptoPage />} />
        <Route path="/commodities" element={<CommoditiesPage />} />
        <Route path="/forex" element={<ForexPage />} />
        <Route path="/earnings-calendar" element={<EarningsCalendarPage />} />
        <Route path="/glossary" element={<GlossaryPage />} />
        <Route path="/economic-calendar" element={<EconomicCalendarPage />} />
        <Route path="/sector-heatmap" element={<SectorHeatmapPage />} />
        <Route path="/tax" element={<TaxCalculatorPage />} />
        <Route path="/ipo" element={<IpoPage />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/fii-dii" element={<FiiDiiPage />} />
        <Route path="/macro" element={<MacroPage />} />
        <Route path="/mutual-funds" element={<MutualFundPage />} />
        <Route path="/etf" element={<EtfPage />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  );
}

export default App;
