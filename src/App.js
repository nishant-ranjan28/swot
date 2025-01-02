/* global TradingView */
import React, { useEffect } from 'react';
import './App.css';
import StockSearch from './components/StockSearch';

function App() {
  useEffect(() => {
    fetchStockPrice('INFY.NS', null, 'Infosys');
    updateStockChart('INFY.NS');
    loadTrendlyneScript();
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

  const updateSwotWidget = (stock) => {
    const encodedStock = encodeURIComponent(stock).split('.')[0];
    const swotWidget = document.getElementById('swot-widget');
    const qvtWidget = document.getElementById('qvt-widget');
    if (swotWidget) {
      swotWidget.src = `https://trendlyne.com/web-widget/swot-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
    }
    if (qvtWidget) {
      qvtWidget.src = `https://trendlyne.com/web-widget/qvt-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
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
          document.getElementById('stock-name-display').textContent = stockName;
          document.getElementById('stock-price-display').textContent = `₹${price}`;
        }
      })
      .catch((error) => {
        console.error('Error fetching stock price:', error);
        if (div && stockName) {
          div.textContent = `${stockName} - Price not available`;
        } else {
          document.getElementById('stock-price-display').textContent = 'Price not available';
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

    // Update Technical Analysis widget (now an iframe)
    const technicalWidget = document.getElementById('technical-widget');
    if (technicalWidget) {
      technicalWidget.src = `https://trendlyne.com/web-widget/technical-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
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
        {/* Top: Stock Search */}
        <div className="flex flex-col gap-6">
          <div className="flex gap-6 items-center">
            <StockSearch
              updateSwotWidget={updateSwotWidget}
              fetchStockPrice={fetchStockPrice}
              updateStockChart={updateStockChart}
              className="flex-1"
            />
            <div className="flex-1 text-2xl font-semibold text-gray-800">
              <span id="stock-name-display"></span> - <span id="stock-price-display"></span>
            </div>
          </div>

          {/* Widgets */}
          <div className="flex flex-wrap gap-6">
            {/* SWOT Analysis */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="swot-widget"
                src="https://trendlyne.com/web-widget/swot-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* QVT Widget */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="qvt-widget"
                src="https://trendlyne.com/web-widget/qvt-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* Technical Analysis Widget (iframe) */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="technical-widget"
                src="https://trendlyne.com/web-widget/technical-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* Checklist Widget (iframe) */}
            <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[300px]">
              <iframe
                className="w-full h-96 rounded-lg shadow-md"
                id="checklist-widget"
                src="https://trendlyne.com/web-widget/checklist-widget/Poppins/TATAMOTORS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>
          </div>
        </div>

        {/* Bottom: TradingView Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <div id="stock-chart-container" className="h-full p-4 bg-gray-100 rounded-lg shadow-inner">
            <div id="stock-chart"></div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;