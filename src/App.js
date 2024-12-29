/* global TradingView */
import React, { useEffect } from 'react';
import './App.css';
import StockSearch from './components/StockSearch';

function App() {
  useEffect(() => {
    fetchStockPrice('INFY.NS', null, 'Infosys');
    updateStockChart('INFY.NS');
  }, []);

  const updateSwotWidget = (stock) => {
    const encodedStock = encodeURIComponent(stock).split('.')[0];
    document.getElementById('swot-widget').src = `https://trendlyne.com/web-widget/swot-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
    document.getElementById('qvt-widget').src = `https://trendlyne.com/web-widget/qvt-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
  };

  const fetchStockPrice = (stockSymbol, div = null, stockName = null) => {
    fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${stockSymbol}?region=IN&lang=en-IN&interval=1d&range=1d`)}`)
      .then(response => response.json())
      .then(data => {
        const stockData = JSON.parse(data.contents);
        const price = stockData.chart.result[0].meta.regularMarketPrice;
        if (div && stockName) {
          div.textContent = `${stockName} - ₹${price}`;
        } else {
          document.getElementById('swot-stock-name').textContent = stockName;
          document.getElementById('swot-stock-price').textContent = `₹${price}`;
        }
      })
      .catch(error => {
        console.error('Error fetching stock price:', error);
        if (div && stockName) {
          div.textContent = `${stockName} - Price not available`;
        } else {
          document.getElementById('swot-stock-price').textContent = 'Price not available';
        }
      });
  };

  const updateStockChart = (stockSymbol) => {
    const cleanSymbol = stockSymbol.split('.')[0];
    const stockChartContainer = document.getElementById('stock-chart-container');
    stockChartContainer.innerHTML = '';

    const widgetContainer = document.createElement('div');
    const widgetId = `tradingview_${cleanSymbol}`;
    widgetContainer.id = widgetId;
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
      container_id: widgetId,
      width: '100%',
      height: '600',
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-4 flex flex-col md:flex-row gap-4">
      <div className="flex-1">
        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow">
          <h2 id="swot-stock-name" className="text-2xl font-bold text-gray-800">Infosys</h2>
          <span id="swot-stock-price" className="text-xl text-green-600"></span>
        </div>
        <iframe
          className="w-full h-96 border-none rounded-lg mt-4 shadow"
          id="swot-widget"
          src="https://trendlyne.com/web-widget/swot-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
          data-theme="light"
          frameBorder="0"
        ></iframe>
        <div className="mt-4 w-full">
          <iframe
            className="w-full h-96 border-none rounded-lg shadow"
            id="qvt-widget"
            src="https://trendlyne.com/web-widget/qvt-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
            data-theme="light"
            frameBorder="0"
          ></iframe>
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <StockSearch
          updateSwotWidget={updateSwotWidget}
          fetchStockPrice={fetchStockPrice}
          updateStockChart={updateStockChart}
        />
        <div id="stock-chart-container" className="mt-8 bg-white rounded-lg shadow overflow-hidden">
          <div id="stock-chart"></div>
        </div>
      </div>
      <footer className="p-4 text-center mt-8 bg-gray-100 rounded-lg shadow">
        Built for investors with Love by
        <a href="https://github.com/nishant-ranjan28" target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-500 font-bold">
          Nishant
        </a>
        <img src="image.png" alt="Trendlyne Logo" className="ml-2 w-6 h-auto inline-block" />
      </footer>
    </div>
  );
}

export default App;