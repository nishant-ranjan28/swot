/* global TradingView */
import React, { useEffect } from 'react';
import './App.css';
import StockSearch from './components/StockSearch';

function App() {
  useEffect(() => {
    const loadTradingViewWidgets = () => {
      // Load Financial Data Widget
      appendTradingViewScript(
        'tradingview-widget-container-financial',
        'tradingview-financial-widget-script',
        'https://s3.tradingview.com/external-embedding/embed-widget-financials.js',
        {
          isTransparent: false,
          largeChartUrl: '',
          displayMode: 'compact',
          width: '100%', // Ensures widget fills the container's width
          height: '500',
          colorTheme: 'light',
          symbol: 'NSE:CARTRADE',
          locale: 'en',
        }
      );

      // Load Market Quotes Widget
      appendTradingViewScript(
        'tradingview-widget-container-market-quotes',
        'tradingview-market-quotes-widget-script',
        'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js',
        {
          width: "100%", // Ensures widget fills the container's width
          height: 550,
          symbolsGroups: [
            {
              name: "Indices",
              originalName: "Indices",
              symbols: [
                { name: "FOREXCOM:SPXUSD", displayName: "S&P 500 Index" },
                { name: "FOREXCOM:NSXUSD", displayName: "US 100 Cash CFD" },
                { name: "FOREXCOM:DJI", displayName: "Dow Jones Industrial Average Index" },
                { name: "INDEX:NKY", displayName: "Japan 225" },
                { name: "INDEX:DEU40", displayName: "DAX Index" },
                { name: "FOREXCOM:UKXGBP", displayName: "FTSE 100 Index" },
                { name: "BSE:SENSEX", displayName: "SENSEX" }
              ]
            },
            {
              name: "Futures",
              originalName: "Futures",
              symbols: [
                { name: "CME_MINI:ES1!", displayName: "S&P 500" },
                { name: "CME:6E1!", displayName: "Euro" },
                { name: "COMEX:GC1!", displayName: "Gold" },
                { name: "NYMEX:CL1!", displayName: "WTI Crude Oil" },
                { name: "NYMEX:NG1!", displayName: "Gas" },
                { name: "CBOT:ZC1!", displayName: "Corn" }
              ]
            },
            {
              name: "Bonds",
              originalName: "Bonds",
              symbols: [
                { name: "CBOT:ZB1!", displayName: "T-Bond" },
                { name: "CBOT:UB1!", displayName: "Ultra T-Bond" },
                { name: "EUREX:FGBL1!", displayName: "Euro Bund" },
                { name: "EUREX:FBTP1!", displayName: "Euro BTP" },
                { name: "EUREX:FGBM1!", displayName: "Euro BOBL" }
              ]
            },
            {
              name: "Forex",
              originalName: "Forex",
              symbols: [
                { name: "FX:EURUSD", displayName: "EUR to USD" },
                { name: "FX:GBPUSD", displayName: "GBP to USD" },
                { name: "FX:USDJPY", displayName: "USD to JPY" },
                { name: "FX:USDCHF", displayName: "USD to CHF" },
                { name: "FX:AUDUSD", displayName: "AUD to USD" },
                { name: "FX:USDCAD", displayName: "USD to CAD" }
              ]
            }
          ],
          showSymbolLogo: true,
          isTransparent: false,
          colorTheme: "light",
          locale: "en",
          largeChartUrl: "",
          backgroundColor: "#ffffff"
        }
      );
    };

    fetchStockPrice('LTFOODS.NS', null, 'LT Foods');
    updateStockChart('LTFOODS.NS');
    loadTrendlyneScript();
    loadTradingViewWidgets();
  }, []);

  const loadTrendlyneScript = () => {
    const existingScript = document.getElementById('trendlyne-widgets-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'trendlyne-widgets-script';
      script.src = 'https://cdn-static.trendlyne.com/static/js/webwidgets/tl-widgets.js';
      script.async = true;
      document.body.appendChild(script);
    }
  };

  const appendTradingViewScript = (containerId, scriptId, scriptSrc, config) => {
    const existingScript = document.getElementById(scriptId);
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'text/javascript';
      script.src = scriptSrc;
      script.async = true;
      script.innerHTML = JSON.stringify(config);
      document.getElementById(containerId).appendChild(script);
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

        {/* Financial Data Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg mt-6 flex flex-row">
          {/* Financial Data Widget */}
          <div className="flex-1 mr-3">
            <div id="tradingview-widget-container-financial" className="tradingview-widget-container" style={{ height: '500px' }}>
              <div className="tradingview-widget-container__widget"></div>
              <div className="tradingview-widget-copyright">
                <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
                  <span className="blue-text">Track all markets on TradingView</span>
                </a>
              </div>
            </div>
          </div>

          {/* Market Quotes Widget */}
          <div className="flex-1 ml-3">
            <div id="tradingview-widget-container-market-quotes" className="tradingview-widget-container" style={{ height: '550px' }}>
              <div className="tradingview-widget-container__widget"></div>
              <div className="tradingview-widget-copyright">
                <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
                  <span className="blue-text">Track all markets on TradingView</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;