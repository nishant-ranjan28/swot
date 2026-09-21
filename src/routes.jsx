// src/routes.jsx
import HomePage from './components/HomePage';
import StockDetailPage from './components/StockDetail/StockDetailPage';
import NewsPage from './components/NewsPage';
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

export const PAGE_ROUTES = [
  { path: '/', element: <HomePage /> },
  { path: '/stock/:symbol', element: <StockDetailPage /> },
  { path: '/watchlist', element: <WatchlistPage /> },
  { path: '/portfolio', element: <PortfolioPage /> },
  { path: '/compare', element: <ComparePage /> },
  { path: '/screener', element: <ScreenerPage /> },
  { path: '/scanner', element: <ScannerPage /> },
  { path: '/calculator', element: <CalculatorPage /> },
  { path: '/backtest', element: <BacktestPage /> },
  { path: '/crypto', element: <CryptoPage /> },
  { path: '/commodities', element: <CommoditiesPage /> },
  { path: '/forex', element: <ForexPage /> },
  { path: '/earnings-calendar', element: <EarningsCalendarPage /> },
  { path: '/glossary', element: <GlossaryPage /> },
  { path: '/economic-calendar', element: <EconomicCalendarPage /> },
  { path: '/sector-heatmap', element: <SectorHeatmapPage /> },
  { path: '/tax', element: <TaxCalculatorPage /> },
  { path: '/ipo', element: <IpoPage /> },
  { path: '/deals', element: <DealsPage /> },
  { path: '/fii-dii', element: <FiiDiiPage /> },
  { path: '/macro', element: <MacroPage /> },
  { path: '/mutual-funds', element: <MutualFundPage /> },
  { path: '/etf', element: <EtfPage /> },
  { path: '/trending', element: <TrendingPage /> },
  { path: '/news', element: <NewsPage /> },
];
