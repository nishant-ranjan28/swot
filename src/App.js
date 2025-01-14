/* global TradingView */
import React, { useEffect } from 'react';
import './App.css';
import StockSearch from './components/StockSearch';

function App() {
  useEffect(() => {
    fetchStockPrice('LTFOODS.NS', null, 'LT Foods');
    updateStockChart('LTFOODS.NS');
    loadTrendlyneScript();
    loadTradingViewWidget();
  }, []);

  const loadTrendlyneScript = () => {
    const existingScript = document.getElementById('trendlyne-widgets-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'trendlyne-widgets-script';
      script.src = 'https://cdn-static.trendlyne.com/static/js/webwidgets/tl-widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      document.body.appendChild(script);
    }
  };

  const loadTradingViewWidget = () => {
    const existingScript = document.getElementById('tradingview-widget-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
      script.async = true;
      script.innerHTML = JSON.stringify({
        isTransparent: false,
        largeChartUrl: '',
        displayMode: 'compact',
        width: '100%',
        height: '500', // Increased height
        colorTheme: 'dark',
        symbol: 'NSE:CARTRADE',
        locale: 'en',
      });
      document.getElementById('tradingview-widget-container').appendChild(script);
    }
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
        `https://query1.finance.yahoo.com/v8/finance/chart/${stockSymbol}?region=IN&lang=en-IN&interval=1d&range=1d`
      )}`
    )
      .then((response) => response.json())
      .then((data) => {
        const stockData = JSON.parse(data.contents);
        const price = stockData.chart.result[0].meta.regularMarketPrice;
        if (div && stockName) {
          div.textContent = `${stockName} - ₹${price}`;
        } else {
          // Removed references to 'stock-name-display' and 'stock-price-display'
        }
      })
      .catch((error) => {
        console.error('Error fetching stock price:', error);
        if (div && stockName) {
          div.textContent = `${stockName} - Price not available`;
        } else {
          // Removed references to 'stock-name-display' and 'stock-price-display'
        }
      });
  };

  const updateStockChart = (stockSymbol) => {
    const cleanSymbol = stockSymbol.split('.')[0];
    const stockChartContainer = document.getElementById('stock-chart-container');
    stockChartContainer.innerHTML = '';

    // Update QVT widget
    const qvtWidget = document.getElementById('qvt-widget');
    if (qvtWidget) {
      qvtWidget.src = `https://trendlyne.com/web-widget/qvt-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
    }

    // Update Technical Analysis widget (iframe)
    const technicalWidget = document.getElementById('technical-widget');
    if (technicalWidget) {
      technicalWidget.src = `https://trendlyne.com/web-widget/technical-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
    }

    // Update Checklist widget (iframe)
    const checklistWidget = document.getElementById('checklist-widget');
    if (checklistWidget) {
      checklistWidget.src = `https://trendlyne.com/web-widget/checklist-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
    }

    // Re-render Trendlyne widgets if needed
    if (window.tl_widgets && typeof window.tl_widgets.render === 'function') {
      window.tl_widgets.render();
    }

    // Create a new TradingView widget
    const widgetContainer = document.createElement('div');
    widgetContainer.id = `tradingview_${cleanSymbol}`;
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '600px';
    stockChartContainer.appendChild(widgetContainer);

    new TradingView.widget({
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
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 flex flex-col p-6 gap-6">
        {/* Top Part: Only the text box now (StockSearch), no stock price */}
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

        {/* Continue with other widgets below ... */}
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

          {/* Technical Analysis Widget */}
          <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
            <iframe
              className="w-full h-96 rounded-lg shadow-md"
              id="technical-widget"
              src="https://trendlyne.com/web-widget/technical-widget/Poppins/LTFOODS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
              title="Technical Analysis for LT Foods"
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
          <div id="stock-chart-container" className="h-full p-4 bg-gray-100 rounded-lg shadow-inner">
            <div id="stock-chart"></div>
          </div>
        </div>

        {/* New TradingView Widget Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg mt-6">
          <div id="tradingview-widget-container" className="tradingview-widget-container" style={{ height: '600px' }}>
            <div className="tradingview-widget-container__widget"></div>
            <div className="tradingview-widget-copyright">
              <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
                <span className="blue-text">Track all markets on TradingView</span>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;