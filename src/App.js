/* global TradingView */
import React, { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import './App.css';
import StockSearch from './components/StockSearch';
import Header from './components/Header';
import NewsPage from './components/NewsPage';
import HomePage from './components/HomePage';

function App() {
  useEffect(() => {
    fetchStockPrice('LTFOODS.NS', null, 'LT Foods');
    updateStockChart('LTFOODS.NS');
    loadTrendlyneScript();
  }, []);

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
    const stockChartContainer = document.getElementById(
      'stock-chart-container',
    );
    if (!stockChartContainer) {
      console.error('stock-chart-container element not found');
      return;
    }
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
    <div>
      <Header />
      <StockSearch />
      <div id="swot-widget"></div>
      <div id="qvt-widget"></div>
      <div id="technical-widget"></div>
      <div id="checklist-widget"></div>
      <div id="stock-chart-container"></div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  );
}

export default App;
