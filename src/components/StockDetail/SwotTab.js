import React, { useEffect } from 'react';

const SwotTab = ({ symbol }) => {
  // Extract clean symbol (remove .NS / .BO suffix)
  const cleanSymbol = symbol?.split('.')[0] || '';

  // Load Trendlyne widget script
  useEffect(() => {
    const existingScript = document.getElementById('trendlyne-widgets-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'trendlyne-widgets-script';
      script.src = 'https://cdn-static.trendlyne.com/static/js/webwidgets/tl-widgets.js';
      script.async = true;
      document.body.appendChild(script);
    } else if (window.tl_widgets && typeof window.tl_widgets.render === 'function') {
      setTimeout(() => window.tl_widgets.render(), 200);
    }
  }, [cleanSymbol]);

  const widgetBase = `posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;

  return (
    <div className="space-y-6">
      {/* SWOT Analysis */}
      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">SWOT Analysis</h3>
        <iframe
          className="w-full rounded-lg border border-gray-200"
          style={{ minHeight: '400px' }}
          src={`https://trendlyne.com/web-widget/swot-widget/Poppins/${cleanSymbol}/?${widgetBase}`}
          title={`SWOT Analysis for ${cleanSymbol}`}
          frameBorder="0"
        ></iframe>
      </div>

      {/* QVT Score */}
      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">QVT Score</h3>
        <p className="text-xs text-gray-500 mb-2">Quality, Valuation & Technicals rating</p>
        <iframe
          className="w-full rounded-lg border border-gray-200"
          style={{ minHeight: '400px' }}
          src={`https://trendlyne.com/web-widget/qvt-widget/Poppins/${cleanSymbol}/?${widgetBase}`}
          title={`QVT Score for ${cleanSymbol}`}
          frameBorder="0"
        ></iframe>
      </div>

      {/* Stock Checklist */}
      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">Stock Checklist</h3>
        <p className="text-xs text-gray-500 mb-2">Key health criteria pass/fail check</p>
        <iframe
          className="w-full rounded-lg border border-gray-200"
          style={{ minHeight: '400px' }}
          src={`https://trendlyne.com/web-widget/checklist-widget/Poppins/${cleanSymbol}/?${widgetBase}`}
          title={`Checklist for ${cleanSymbol}`}
          frameBorder="0"
        ></iframe>
      </div>
    </div>
  );
};

export default SwotTab;
