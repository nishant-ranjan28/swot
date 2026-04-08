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
