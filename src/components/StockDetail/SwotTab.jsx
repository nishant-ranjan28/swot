import React, { useEffect } from 'react';
import GeneratedSwot from './GeneratedSwot';
import SectionCard from '@/components/common/SectionCard';

const SwotTab = ({ symbol }) => {
  const cleanSymbol = symbol?.split('.')[0] || '';
  const isIndian = symbol?.endsWith('.NS') || symbol?.endsWith('.BO');

  // Load Trendlyne widget script for Indian stocks
  useEffect(() => {
    if (!isIndian) return;
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
  }, [cleanSymbol, isIndian]);

  // US stocks or non-Indian → use generated SWOT
  if (!isIndian) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">SWOT Analysis</h2>
          <p className="text-xs text-muted-foreground">
            AI-generated from fundamentals, technicals, and analyst data
          </p>
        </div>
        <GeneratedSwot symbol={symbol} />
      </div>
    );
  }

  // Indian stocks → use Trendlyne widgets
  const widgetBase = `posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;

  return (
    <div className="space-y-6">
      {/* SWOT Analysis */}
      <SectionCard title="SWOT Analysis">
        <iframe
          className="w-full rounded-lg border border-border"
          style={{ minHeight: '400px' }}
          src={`https://trendlyne.com/web-widget/swot-widget/Poppins/${cleanSymbol}/?${widgetBase}`}
          title={`SWOT Analysis for ${cleanSymbol}`}
          frameBorder="0"
        ></iframe>
      </SectionCard>

      {/* QVT Score */}
      <SectionCard title="QVT Score" description="Quality, Valuation & Technicals rating">
        <iframe
          className="w-full rounded-lg border border-border"
          style={{ minHeight: '400px' }}
          src={`https://trendlyne.com/web-widget/qvt-widget/Poppins/${cleanSymbol}/?${widgetBase}`}
          title={`QVT Score for ${cleanSymbol}`}
          frameBorder="0"
        ></iframe>
      </SectionCard>

      {/* Stock Checklist */}
      <SectionCard title="Stock Checklist" description="Key health criteria pass/fail check">
        <iframe
          className="w-full rounded-lg border border-border"
          style={{ minHeight: '400px' }}
          src={`https://trendlyne.com/web-widget/checklist-widget/Poppins/${cleanSymbol}/?${widgetBase}`}
          title={`Checklist for ${cleanSymbol}`}
          frameBorder="0"
        ></iframe>
      </SectionCard>
    </div>
  );
};

export default SwotTab;
