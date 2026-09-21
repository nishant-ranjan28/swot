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
import OptionsTab from './OptionsTab';
import SwotTab from './SwotTab';
import ChartTab from './ChartTab';
import TechnicalTab from './TechnicalTab';
import FundamentalTab from './FundamentalTab';
import PredictionTab from './PredictionTab';
import { generateStockReport } from '../../utils/exportUtils';
import { FileDown } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import PriceChange from '@/components/common/PriceChange';
import ErrorState from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  { id: 'options', label: 'Options' },
  { id: 'prediction', label: 'AI Predict' },
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

  const handleTabKeyDown = (event) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextId = TABS[nextIndex].id;
    setActiveTab(nextId);
    document.getElementById(`tab-${nextId}`)?.focus();
  };

  const handleStockSelect = (stock) => {
    navigate(`/stock/${stock.symbol}`);
  };

  const quote = summary?.quote;
  const stockCurrency = quote?.currency === 'USD' ? '$' : '₹';

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
      case 'options':
        return <OptionsTab symbol={symbol} />;
      case 'prediction':
        return <PredictionTab symbol={symbol} />;
      case 'swot':
        return <SwotTab symbol={symbol} />;
      default:
        return <OverviewTab symbol={symbol} overview={summary?.overview} />;
    }
  };

  return (
    <PageContainer className="space-y-4 md:space-y-6">
      {/* Search Bar */}
      <div className="max-w-4xl mx-auto">
        <StockSearch onSelect={handleStockSelect} className="w-full" />
      </div>

      {!quote && <h1 className="sr-only">{symbol}</h1>}

      {/* Price Banner */}
      {quote && (
        <div className="sticky top-16 z-30 rounded-xl border border-border bg-card/95 p-4 backdrop-blur md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {quote.name || symbol}
              </h1>
              <Badge variant="outline">{symbol}</Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums text-foreground">
                  {stockCurrency}{quote.price?.toLocaleString(stockCurrency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}
                </div>
                <PriceChange
                  value={quote.change}
                  percent={quote.change_percent}
                  showIcon
                  className="text-sm font-medium"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => generateStockReport(quote, summary?.overview, summary?.financials, stockCurrency)}
                className="ml-2"
                title="Download PDF report"
              >
                <FileDown aria-hidden />
                PDF Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-border border-t-primary"></div>
        </div>
      )}

      {error && <ErrorState message={error} />}

      {/* Tabs */}
      {summary && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
            <div
              role="tablist"
              aria-label="Stock sections"
              className="flex min-w-max border-b border-border px-2"
              onKeyDown={handleTabKeyDown}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="stock-tabpanel"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm',
                    activeTab === tab.id
                      ? 'text-foreground font-medium after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div
            role="tabpanel"
            id="stock-tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="p-4 md:p-6"
          >
            {renderTab()}
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default StockDetailPage;
