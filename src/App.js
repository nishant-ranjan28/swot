import React, { useEffect, useCallback, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import axios from 'axios';
import './App.css';
import NewsPage from './components/NewsPage';
import Header from './components/Header';
import HomePage from './components/HomePage';
import StockDetailPage from './components/StockDetail/StockDetailPage';

function App() {
  const location = useLocation();

  // Store reference to current TradingView widget for cleanup
  const currentTradingViewWidget = useRef(null);

  // Handle window resize for mobile responsiveness
  useEffect(() => {
    const handleResize = () => {
      if (currentTradingViewWidget.current && currentTradingViewWidget.current.iframe) {
        // Force TradingView to resize on mobile
        if (window.innerWidth < 768) {
          setTimeout(() => {
            if (currentTradingViewWidget.current && currentTradingViewWidget.current.iframe) {
              currentTradingViewWidget.current.iframe.style.height = '100%';
              currentTradingViewWidget.current.iframe.style.width = '100%';
            }
          }, 100);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
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

  // Helper to load TradingView script and return a promise
  const loadTradingViewScript = () => {
    return new Promise((resolve, reject) => {
      if (window.TradingView) {
        resolve();
        return;
      }

      const existingScript = document.getElementById('tradingview-widget-script');
      if (existingScript) {
        if (window.TradingView) {
          resolve();
        } else {
          existingScript.onload = () => resolve();
          existingScript.onerror = () => reject(new Error('Failed to load TradingView script'));
        }
        return;
      }

      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        console.log('TradingView script loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('Failed to load TradingView script');
        reject(new Error('Failed to load TradingView script'));
      };
      document.body.appendChild(script);
    });
  };

  const updateSwotWidget = (stock) => {
    const encodedStock = encodeURIComponent(stock).split('.')[0];
    const swotWidget = document.getElementById('swot-widget');
    if (swotWidget) {
      const newSrc = `https://trendlyne.com/web-widget/swot-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
      swotWidget.src = newSrc;
      swotWidget.onload = () => console.log(`SWOT widget loaded for ${encodedStock}`);
      swotWidget.onerror = (error) => console.error("SWOT widget failed to load for %s:", encodedStock, error);
    } else {
      console.error('SWOT widget element not found');
    }
  };

  const fetchStockPrice = useCallback((stockSymbol, div = null, stockName = null) => {
    axios.get(`/api/stocks/${stockSymbol}/quote`)
      .then((response) => {
        const price = response.data.price;
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
  }, []);

  const updateStockChart = useCallback(async (stockSymbol) => {
    const cleanSymbol = stockSymbol.split('.')[0];
    const stockChartContainer = document.getElementById('stock-chart-container');

    if (stockChartContainer) {
      // Clean up previous widget if it exists
      if (currentTradingViewWidget.current && typeof currentTradingViewWidget.current.remove === 'function') {
        try {
          currentTradingViewWidget.current.remove();
        } catch (error) {
          console.warn('Error removing previous TradingView widget:', error);
        }
        currentTradingViewWidget.current = null;
      }

      // Clear the container and show loading state
      stockChartContainer.innerHTML = `
        <div class="flex items-center justify-center h-full min-h-80">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading chart for ${cleanSymbol}...</p>
          </div>
        </div>
      `;

      // Update QVT widget with error handling
      const qvtWidget = document.getElementById('qvt-widget');
      if (qvtWidget) {
        qvtWidget.src = `https://trendlyne.com/web-widget/qvt-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
        qvtWidget.onload = () => console.log(`QVT widget loaded for ${cleanSymbol}`);
        qvtWidget.onerror = (error) => console.error(`QVT widget failed to load for ${cleanSymbol}:`, error);
      }

      // Update Checklist widget with error handling
      const checklistWidget = document.getElementById('checklist-widget');
      if (checklistWidget) {
        checklistWidget.src = `https://trendlyne.com/web-widget/checklist-widget/Poppins/${cleanSymbol}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
        checklistWidget.onload = () => console.log(`Checklist widget loaded for ${cleanSymbol}`);
        checklistWidget.onerror = (error) => console.error(`Checklist widget failed to load for ${cleanSymbol}:`, error);
      }

      // Re-render Trendlyne widgets if needed
      if (window.tl_widgets && typeof window.tl_widgets.render === 'function') {
        setTimeout(() => {
          window.tl_widgets.render();
        }, 100);
      }

      // Create a new TradingView widget after script is loaded
      try {
        await loadTradingViewScript();

        // Wait a bit for the script to be fully ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Clear loading state and create widget container
        stockChartContainer.innerHTML = '';

        const widgetContainer = document.createElement('div');
        widgetContainer.id = `tradingview_${cleanSymbol}_${Date.now()}`;
        widgetContainer.className = 'tradingview-widget-container';
        widgetContainer.style.height = '100%';
        widgetContainer.style.width = '100%';
        widgetContainer.style.position = 'relative';
        stockChartContainer.appendChild(widgetContainer);

        if (window.TradingView) {
          // Use only the clean symbol without exchange suffix for TradingView
          const tradingViewSymbol = cleanSymbol;

          // Get mobile status for optimization
          const isMobile = window.innerWidth < 768;

          // Store the widget instance for proper management
          currentTradingViewWidget.current = new window.TradingView.widget({
            autosize: true,
            symbol: tradingViewSymbol,
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
            height: '100%',
            // Mobile-specific optimizations
            hide_side_toolbar: isMobile,
            hide_top_toolbar: false,
            hide_legend: isMobile,
            studies: [],
            show_popup_button: !isMobile,
            popup_width: isMobile ? '100%' : '1000',
            popup_height: isMobile ? '100%' : '650',
            // Responsive settings
            overrides: {
              "paneProperties.background": "#ffffff",
              "paneProperties.vertGridProperties.color": "#e1e3e6",
              "paneProperties.horzGridProperties.color": "#e1e3e6",
              "symbolWatermarkProperties.transparency": 90,
              "scalesProperties.textColor": "#131722",
              ...(isMobile && {
                "paneProperties.topMargin": 10,
                "paneProperties.bottomMargin": 10,
                "paneProperties.leftAxisProperties.autoScale": true,
                "paneProperties.rightAxisProperties.autoScale": true,
              })
            },
            disabled_features: isMobile ? [
              "header_symbol_search",
              "header_compare",
              "header_undo_redo",
              "header_screenshot",
              "header_chart_type",
              "left_toolbar"
            ] : [],
            enabled_features: [
              "study_templates",
              ...(isMobile ? [] : ["left_toolbar"])
            ],
            onChartReady: () => {
              console.log(`TradingView chart loaded successfully for ${tradingViewSymbol}`);
              // Force resize after chart is ready
              if (isMobile) {
                setTimeout(() => {
                  if (currentTradingViewWidget.current && currentTradingViewWidget.current.iframe) {
                    currentTradingViewWidget.current.iframe.style.height = '100%';
                    currentTradingViewWidget.current.iframe.style.width = '100%';
                  }
                }, 1000);
              }
            },
            onSymbolChanged: (symbolData) => {
              console.log('TradingView symbol changed:', symbolData);
            }
          });
        } else {
          throw new Error('TradingView library not loaded');
        }
      } catch (error) {
        console.error('Error creating TradingView widget:', error);
        // Mobile-specific fallback with simpler chart
        const isMobile = window.innerWidth < 768;

        if (isMobile) {
          // For mobile, show a simpler TradingView widget
          stockChartContainer.innerHTML = `
            <div class="w-full h-full flex flex-col">
              <div class="tradingview-widget-container" style="height: 100%; width: 100%;">
                <div class="tradingview-widget-container__widget"></div>
                <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js" async>
                {
                  "symbol": "${cleanSymbol}",
                  "width": "100%",
                  "height": "100%",
                  "locale": "in",
                  "dateRange": "12M",
                  "colorTheme": "light",
                  "trendLineColor": "rgba(41, 98, 255, 1)",
                  "underLineColor": "rgba(41, 98, 255, 0.3)",
                  "underLineBottomColor": "rgba(41, 98, 255, 0)",
                  "isTransparent": false,
                  "autosize": true,
                  "largeChartUrl": ""
                }
                </script>
              </div>
            </div>
          `;
        } else {
          // Desktop fallback
          stockChartContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full min-h-96 text-gray-500 p-6">
              <div class="text-center max-w-md">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <h3 class="text-lg font-semibold mb-2 text-gray-700">Chart Temporarily Unavailable</h3>
                <p class="text-sm text-gray-600 mb-4">We're having trouble loading the chart for <strong>${cleanSymbol}</strong>. Please try refreshing the page or selecting a different stock.</p>
                <button onclick="window.location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                  Refresh Page
                </button>
              </div>
            </div>
          `;
        }
      }
    } else {
      console.error('Stock chart container not found');
    }
  }, []); // Wrapped in useCallback to stabilize reference

  useEffect(() => {
    if (location.pathname === '/') {
      fetchStockPrice('LTFOODS', null, 'LT Foods');
      updateStockChart('LTFOODS');
      loadTrendlyneScript();
    }
  }, [location, updateStockChart, fetchStockPrice]); // Dependencies updated

  return (
    <div>
      <Header />
      <Routes>
        <Route
          path="/"
          element={<HomePage />}
        />
        <Route path="/stock/:symbol" element={<StockDetailPage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  );
}

export default App;
