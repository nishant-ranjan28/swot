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
    <div className="container">
      <div className="left-section">
        <div id="swot-header">
          <h2 id="swot-stock-name">Infosys</h2>
          <span id="swot-stock-price"></span>
        </div>
        <iframe
          className="trendlyne-widgets"
          id="swot-widget"
          src="https://trendlyne.com/web-widget/swot-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
          data-theme="light"
          width="100%"
          height="400px"
          frameBorder="0"
        ></iframe>
        <div className="widget-container">
          <iframe
            className="trendlyne-widgets"
            id="qvt-widget"
            src="https://trendlyne.com/web-widget/qvt-widget/Poppins/INFY/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
            data-theme="light"
            width="100%"
            height="400px"
            frameBorder="0"
          ></iframe>
        </div>
      </div>
      <div className="right-section">
        <StockSearch
          updateSwotWidget={updateSwotWidget}
          fetchStockPrice={fetchStockPrice}
          updateStockChart={updateStockChart}
        />
        <div id="stock-chart-container">
          <div id="stock-chart"></div>
        </div>
      </div>
      ...
      <footer style={{ padding: '1em', textAlign: 'center', marginTop: '2em', backgroundColor: '#f8f9fa' }}>
        Built for investors with Love by
        <a href="https://github.com/nishant-ranjan28" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '0.5em' }}>
          Nishant
        </a>
        <img src="image.png" alt="Trendlyne Logo" style={{ width: '1.5em', height: 'auto', verticalAlign: 'middle', marginLeft: '0.5em' }} />
      </footer>
      ...
    </div>
  );
}

export default App;