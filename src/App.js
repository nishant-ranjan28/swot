/* global TradingView */
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import StockSearch from './components/StockSearch';
import NewsPage from './components/NewsPage';
import Header from './components/Header';

function App() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/') {
      fetchStockPrice('LTFOODS.NS', null, 'LT Foods');
      updateStockChart('LTFOODS.NS');
      loadTrendlyneScript();
    }
  }, [location]);

  const loadTrendlyneScript = () => {
    const existingScript = document.getElementById('trendlyne-widgets-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'trendlyne-widgets-script';
      script.src =
        'https://cdn-static.trendlyne.com/static/js/webwidgets/tl-widgets.js';
      script.async = true;
      document.body.appendChild(script);
    }
  };

  // Helper to load TradingView script and return a promise
  const loadTradingViewScript = () => {
    return new Promise((resolve) => {
      if (window.TradingView) {
        resolve();
        return;
      }
      const existingScript = document.getElementById('tradingview-widget-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'tradingview-widget-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = resolve;
        document.body.appendChild(script);
      } else {
        existingScript.onload = resolve;
      }
    });
  };

  const updateSwotWidget = (stock) => {
    const encodedStock = encodeURIComponent(stock).split('.')[0];
    const swotWidget = document.getElementById('swot-widget');
    if (swotWidget) {
      swotWidget.src = `https://trendlyne.com/web-widget/swot-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
    }
  };

  const fetchStockPrice = (stockSymbol, div = null, stockName = null) => {
    fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(
        `https://query1.finance.yahoo.com/v8/finance/chart/${stockSymbol}?region=IN&lang=en-IN&interval=1d&range=1d`,
      )}`,
    )
      .then((response) => response.json())
      .then((data) => {
        const stockData = JSON.parse(data.contents);
        const price = stockData.chart.result[0].meta.regularMarketPrice;
        if (div && stockName) {
          div.textContent = `${stockName} - ₹${price}`;
        }
      })
      .catch((error) => {
        console.error('Error fetching stock price:', error);
        if (div && stockName) {
          div.textContent = `${stockName} - Price not available`;
        }
      });
  };

  // Store reference to current TradingView widget for cleanup
  let currentTradingViewWidget = null;

  const updateStockChart = async (stockSymbol) => {
    const cleanSymbol = stockSymbol.split('.')[0];
    const stockChartContainer = document.getElementById('stock-chart-container');
    if (stockChartContainer) {
      stockChartContainer.innerHTML = '';

      // Clean up previous widget if it exists
      if (currentTradingViewWidget && typeof currentTradingViewWidget.remove === 'function') {
        currentTradingViewWidget.remove();
        currentTradingViewWidget = null;
      }

      // Update QVT widget
      const qvtWidget = document.getElementById('qvt-widget');
      if (qvtWidget) {
        qvtWidget.src = `https://trendlyne.com/web-widget/qvt-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
      }

      // Update Checklist widget
      const checklistWidget = document.getElementById('checklist-widget');
      if (checklistWidget) {
        checklistWidget.src = `https://trendlyne.com/web-widget/checklist-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
      }

      // Re-render Trendlyne widgets if needed
      if (window.tl_widgets && typeof window.tl_widgets.render === 'function') {
        window.tl_widgets.render();
      }

      // Create a new TradingView widget after script is loaded
      await loadTradingViewScript();
      const widgetContainer = document.createElement('div');
      widgetContainer.id = `tradingview_${cleanSymbol}`;
      widgetContainer.className = 'tradingview-widget-container';
      widgetContainer.style.height = '600px';
      stockChartContainer.appendChild(widgetContainer);

      if (window.TradingView) {
        // Store the widget instance for proper management
        currentTradingViewWidget = new window.TradingView.widget({
          autosize: true,
          symbol: cleanSymbol,
          interval: 'D',
          timezone: 'Asia/Kolkata',
          theme: 'light',
          style: '1',
          locale: 'in',
          toolbar_bg: '#f1f3f6',
          enable_publishing: false,
          allow_symbol_change: true,
          save_image: false,
          container_id: widgetContainer.id,
          width: '100%',
          height: '600',
          onChartReady: () => {
            console.log(`TradingView chart loaded for ${cleanSymbol}`);
          }
        });
      }
    } else {
      console.error('Stock chart container not found');
    }
  };

  const HomePage = ({
    updateSwotWidget,
    fetchStockPrice,
    updateStockChart,
  }) => {
    // --- Begin: Add logic to auto-load stock from URL param ---
    const [initialized, setInitialized] = useState(false);
    const searchSymbol = new URLSearchParams(location.search).get('search');
    useEffect(() => {
      if (searchSymbol && !initialized) {
        updateSwotWidget(searchSymbol);
        fetchStockPrice(searchSymbol);
        // Delay updateStockChart to ensure widgets are present in DOM
        setTimeout(() => {
          updateStockChart(searchSymbol);
        }, 100);
        setInitialized(true);
      }
    }, [searchSymbol, initialized, updateSwotWidget, fetchStockPrice, updateStockChart]);
    // --- End: Add logic to auto-load stock from URL param ---

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <main className="flex-1 flex flex-col p-6 gap-6">
          {/* Top Part: StockSearch */}
          <div className="flex gap-6 items-center">
            <div className="w-full">
              <StockSearch
                updateSwotWidget={updateSwotWidget}
                fetchStockPrice={fetchStockPrice}
                updateStockChart={updateStockChart}
                className="w-full"
              />
            </div>
          </div>

          {/* Widgets */}
          <div className="flex flex-wrap gap-6">
            {/* SWOT Analysis */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="swot-widget"
                src="https://trendlyne.com/web-widget/swot-widget/Poppins/LTFOODS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                title="SWOT Analysis for LT Foods"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* QVT Widget */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="qvt-widget"
                src="https://trendlyne.com/web-widget/qvt-widget/Poppins/LTFOODS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                title="QVT Widget for LT Foods"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* Checklist Widget */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="checklist-widget"
                src="https://trendlyne.com/web-widget/checklist-widget/Poppins/TATAMOTORS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                title="Checklist Widget for TATA Motors"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>
          </div>

          {/* Bottom: TradingView Chart */}
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <div
              id="stock-chart-container"
              className="h-full p-4 bg-gray-100 rounded-lg shadow-inner"
            >
              <div id="stock-chart"></div>
            </div>
          </div>
        </main>
      </div>
    );
  };

  HomePage.propTypes = {
    updateSwotWidget: PropTypes.func.isRequired,
    fetchStockPrice: PropTypes.func.isRequired,
    updateStockChart: PropTypes.func.isRequired,
  };

  return (
    <div>
      <Header />
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              updateSwotWidget={updateSwotWidget}
              fetchStockPrice={fetchStockPrice}
              updateStockChart={updateStockChart}
            />
          }
        />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  );
}

export default App;
