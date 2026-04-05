import React, { useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useStockData } from '../../hooks/useStockData';
import StockSearch from '../StockSearch';
import OverviewTab from './OverviewTab';
import FinancialsTab from './FinancialsTab';
import DividendsTab from './DividendsTab';
import AnalystsTab from './AnalystsTab';
import HoldersTab from './HoldersTab';
import EarningsTab from './EarningsTab';
import SwotTab from './SwotTab';
import ChartTab from './ChartTab';
import TechnicalTab from './TechnicalTab';
import FundamentalTab from './FundamentalTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'chart', label: 'Chart' },
  { id: 'technical', label: 'Technical' },
  { id: 'fundamental', label: 'Fundamental' },
  { id: 'financials', label: 'Financials' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'analysts', label: 'Analysts' },
  { id: 'holders', label: 'Holders' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'swot', label: 'SWOT' },
];

const StockDetailPage = () => {
  const { symbol } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get('tab') || 'overview';

  // Scroll to top when navigating to a stock page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [symbol]);

  const { data: summary, loading, error } = useStockData(
    symbol ? `/api/stocks/${symbol}/summary` : null
  );

  const setActiveTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const handleStockSelect = (stock) => {
    navigate(`/stock/${stock.symbol}`);
  };

  const quote = summary?.quote;
  const changeColor = quote?.change >= 0 ? 'text-green-600' : 'text-red-600';
  const changeSign = quote?.change >= 0 ? '+' : '';

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab symbol={symbol} overview={summary?.overview} />;
      case 'chart':
        return <ChartTab symbol={symbol} />;
      case 'technical':
        return <TechnicalTab symbol={symbol} />;
      case 'fundamental':
        return <FundamentalTab symbol={symbol} />;
      case 'financials':
        return <FinancialsTab symbol={symbol} />;
      case 'dividends':
        return <DividendsTab symbol={symbol} />;
      case 'analysts':
        return <AnalystsTab symbol={symbol} />;
      case 'holders':
        return <HoldersTab symbol={symbol} />;
      case 'earnings':
        return <EarningsTab symbol={symbol} />;
      case 'swot':
        return <SwotTab symbol={symbol} />;
      default:
        return <OverviewTab symbol={symbol} overview={summary?.overview} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Search Bar */}
        <div className="max-w-4xl mx-auto">
          <StockSearch onSelect={handleStockSelect} className="w-full" />
        </div>

        {/* Price Banner */}
        {quote && (
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 sticky top-16 z-40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {quote.name || symbol}
                </h1>
                <span className="text-sm text-gray-500">{symbol}</span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">
                  {quote.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-lg font-semibold ${changeColor}`}>
                  {changeSign}{quote.change?.toFixed(2)} ({changeSign}{quote.change_percent?.toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {summary && (
          <>
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                <div className="flex min-w-max border-b border-gray-200">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none ${
                        activeTab === tab.id
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 md:p-6">
                {renderTab()}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default StockDetailPage;
