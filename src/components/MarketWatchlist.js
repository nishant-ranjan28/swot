// src/components/MarketWatchlist.js
import React, { useEffect } from 'react';

function MarketWatchlist() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: 'BSE:SENSEX', title: 'Sensex' },
        { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500 Index' },
        { proName: 'FOREXCOM:NSXUSD', title: 'US 100 Cash CFD' },
        { proName: 'FX_IDC:EURUSD', title: 'EUR to USD' },
        { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
        { proName: 'BITSTAMP:ETHUSD', title: 'Ethereum' },
      ],
      showSymbolLogo: true,
      isTransparent: false,
      displayMode: 'adaptive',
      colorTheme: 'light',
      locale: 'en',
    });
    document.getElementById('tradingview-widget-container').appendChild(script);

    const heatmapScript = document.createElement('script');
    heatmapScript.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    heatmapScript.async = true;
    heatmapScript.innerHTML = JSON.stringify({
      exchanges: [],
      dataSource: 'SENSEX',
      grouping: 'sector',
      blockSize: 'market_cap_basic',
      blockColor: 'change',
      locale: 'en',
      symbolUrl: '',
      colorTheme: 'light',
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: '100%',
      height: '400px',
    });
    document
      .getElementById('tradingview-heatmap-container')
      .appendChild(heatmapScript);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <main className="flex-1 flex flex-col p-6 gap-6 w-full max-w-6xl">
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <div
            id="tradingview-widget-container"
            className="tradingview-widget-container"
          >
            <div className="tradingview-widget-container__widget"></div>
            <div className="tradingview-widget-copyright">
              <a
                href="https://www.tradingview.com/"
                rel="noopener nofollow"
                target="_blank"
              >
                <span className="blue-text">
                  Track all markets on TradingView
                </span>
              </a>
            </div>
          </div>
          <div
            id="tradingview-heatmap-container"
            className="tradingview-widget-container mt-6"
          >
            <div className="tradingview-widget-container__widget"></div>
            <div className="tradingview-widget-copyright">
              <a
                href="https://www.tradingview.com/"
                rel="noopener nofollow"
                target="_blank"
              >
                <span className="blue-text">
                  Track all markets on TradingView
                </span>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default MarketWatchlist;
