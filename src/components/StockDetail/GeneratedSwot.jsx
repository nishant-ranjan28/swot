import React, { useState, useEffect } from 'react';
import api from '../../api';

const SWOT_COLORS = {
  S: { bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-800', icon: '💪' },
  W: { bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-800', icon: '⚠️' },
  O: { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-800', icon: '🚀' },
  T: { bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-800', icon: '🔻' },
};

function generateSwot(financials, technical, overview, analysts) {
  const strengths = [];
  const weaknesses = [];
  const opportunities = [];
  const threats = [];

  // --- FUNDAMENTAL ANALYSIS ---
  const pe = financials?.pe_ratio;
  const forwardPe = financials?.forward_pe;
  const roe = financials?.return_on_equity;
  const roa = financials?.return_on_assets;
  const profitMargin = financials?.profit_margin;
  const grossMargin = financials?.gross_margin;
  const debtToEquity = financials?.debt_to_equity;
  const revenueGrowth = financials?.revenue_growth;
  const earningsGrowth = financials?.earnings_growth;
  const dividendYield = financials?.dividend_yield;

  // ROE
  if (roe != null) {
    if (roe > 0.15) strengths.push(`Strong Return on Equity (${(roe * 100).toFixed(1)}%) indicates efficient use of shareholder capital`);
    else if (roe < 0.05) weaknesses.push(`Low Return on Equity (${(roe * 100).toFixed(1)}%) suggests poor capital efficiency`);
  }

  // Profit Margins
  if (profitMargin != null) {
    if (profitMargin > 0.15) strengths.push(`Healthy profit margin (${(profitMargin * 100).toFixed(1)}%) shows strong pricing power`);
    else if (profitMargin < 0) weaknesses.push(`Negative profit margin (${(profitMargin * 100).toFixed(1)}%) — company is unprofitable`);
    else if (profitMargin < 0.05) weaknesses.push(`Thin profit margin (${(profitMargin * 100).toFixed(1)}%) leaves little room for error`);
  }

  if (grossMargin != null && grossMargin > 0.40) {
    strengths.push(`High gross margin (${(grossMargin * 100).toFixed(1)}%) indicates competitive moat`);
  }

  // Debt
  if (debtToEquity != null) {
    const de = debtToEquity > 10 ? debtToEquity / 100 : debtToEquity;
    if (de < 0.3) strengths.push(`Very low debt (D/E: ${de.toFixed(2)}) provides financial flexibility`);
    else if (de > 2.5) threats.push(`Dangerous debt levels (D/E: ${de.toFixed(2)}) — risk of financial distress`);
    else if (de > 1.5) weaknesses.push(`High debt levels (D/E: ${de.toFixed(2)}) increase financial risk`);
  }

  // Revenue Growth
  if (revenueGrowth != null) {
    if (revenueGrowth > 0.15) strengths.push(`Strong revenue growth (${(revenueGrowth * 100).toFixed(1)}%) shows expanding business`);
    else if (revenueGrowth > 0.05) opportunities.push(`Moderate revenue growth (${(revenueGrowth * 100).toFixed(1)}%) with room to accelerate`);
    else if (revenueGrowth < 0) threats.push(`Declining revenue (${(revenueGrowth * 100).toFixed(1)}%) — business may be contracting`);
  }

  // Earnings Growth
  if (earningsGrowth != null) {
    if (earningsGrowth > 0.15) opportunities.push(`Strong earnings growth (${(earningsGrowth * 100).toFixed(1)}%) could drive future stock appreciation`);
    else if (earningsGrowth < -0.10) threats.push(`Declining earnings (${(earningsGrowth * 100).toFixed(1)}%) — profitability under pressure`);
  }

  // Valuation
  if (pe != null) {
    if (pe < 15 && pe > 0) strengths.push(`Attractively valued with P/E of ${pe.toFixed(1)} (below market average)`);
    else if (pe > 40) weaknesses.push(`Expensive valuation with P/E of ${pe.toFixed(1)} — expectations are high`);
  }

  if (forwardPe != null && pe != null && forwardPe < pe * 0.8) {
    opportunities.push(`Forward P/E (${forwardPe.toFixed(1)}) significantly lower than trailing P/E — earnings expected to grow`);
  }

  // Dividend
  if (dividendYield != null && dividendYield > 0.02) {
    strengths.push(`Pays dividend yield of ${(dividendYield * 100).toFixed(2)}% — provides income to investors`);
  }

  // ROA
  if (roa != null && roa > 0.10) {
    strengths.push(`High return on assets (${(roa * 100).toFixed(1)}%) shows efficient asset utilization`);
  }

  // --- TECHNICAL ANALYSIS ---
  const rsi = technical?.oscillators?.rsi;
  const trendShort = technical?.trend?.short_term;
  const trendLong = technical?.trend?.long_term;
  const volatility = technical?.volatility;
  const buyPct = technical?.buy_percentage;

  if (rsi != null) {
    if (rsi < 30) opportunities.push(`RSI at ${rsi.toFixed(0)} — technically oversold, potential bounce opportunity`);
    else if (rsi > 70) threats.push(`RSI at ${rsi.toFixed(0)} — technically overbought, pullback risk`);
  }

  if (trendShort === 'Bullish' && trendLong === 'Bullish') {
    strengths.push('Trading above both short-term and long-term moving averages — strong uptrend');
  } else if (trendShort === 'Bearish' && trendLong === 'Bearish') {
    weaknesses.push('Trading below both short-term and long-term moving averages — downtrend');
  }

  if (buyPct != null) {
    if (buyPct >= 70) strengths.push(`Strong technical signals — ${buyPct.toFixed(0)}% of indicators are bullish`);
    else if (buyPct <= 30) weaknesses.push(`Weak technical signals — only ${buyPct.toFixed(0)}% of indicators are bullish`);
  }

  if (volatility != null && volatility > 40) {
    threats.push(`High volatility (${volatility.toFixed(1)}% annualized) — expect large price swings`);
  }

  // --- ANALYSTS ---
  const recommendation = analysts?.recommendation;
  const targetMean = analysts?.target_mean_price;
  const numAnalysts = analysts?.number_of_analysts;

  if (recommendation) {
    if (['strong_buy', 'buy'].includes(recommendation)) {
      opportunities.push(`Analyst consensus is "${recommendation.replace('_', ' ')}" ${numAnalysts ? `(${numAnalysts} analysts)` : ''}`);
    } else if (['sell', 'strong_sell'].includes(recommendation)) {
      threats.push(`Analyst consensus is "${recommendation.replace('_', ' ')}" — market expects underperformance`);
    }
  }

  if (targetMean && overview?.market_cap) {
    // We don't have current price directly but can derive upside from target
    const currentPrice = financials?.eps && pe ? financials.eps * pe : null;
    if (currentPrice && targetMean > currentPrice * 1.15) {
      opportunities.push(`Analyst target price suggests ${((targetMean / currentPrice - 1) * 100).toFixed(0)}% upside potential`);
    }
  }

  // --- COMPANY ---
  if (overview?.employees && overview.employees > 100000) {
    strengths.push(`Large workforce (${(overview.employees / 1000).toFixed(0)}K employees) — established market presence`);
  }

  // Ensure at least 1 item per category
  if (strengths.length === 0) strengths.push('Insufficient data to identify clear strengths');
  if (weaknesses.length === 0) weaknesses.push('No significant weaknesses identified from available data');
  if (opportunities.length === 0) opportunities.push('Monitor for emerging growth catalysts');
  if (threats.length === 0) threats.push('Standard market and sector risks apply');

  return { strengths, weaknesses, opportunities, threats };
}

const GeneratedSwot = ({ symbol }) => {
  const [swot, setSwot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/stocks/${symbol}/financials`).catch(() => ({ data: null })),
      api.get(`/api/stocks/${symbol}/technical`).catch(() => ({ data: null })),
      api.get(`/api/stocks/${symbol}/overview`).catch(() => ({ data: null })),
      api.get(`/api/stocks/${symbol}/analysts`).catch(() => ({ data: null })),
    ]).then(([finRes, techRes, ovRes, analRes]) => {
      const result = generateSwot(finRes.data, techRes.data, ovRes.data, analRes.data);
      setSwot(result);
    }).finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-48" />
        ))}
      </div>
    );
  }

  if (!swot) return <div className="text-gray-400 text-center py-8">Unable to generate SWOT analysis</div>;

  const sections = [
    { key: 'S', label: 'Strengths', items: swot.strengths },
    { key: 'W', label: 'Weaknesses', items: swot.weaknesses },
    { key: 'O', label: 'Opportunities', items: swot.opportunities },
    { key: 'T', label: 'Threats', items: swot.threats },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(({ key, label, items }) => {
          const colors = SWOT_COLORS[key];
          return (
            <div key={key} className={`${colors.bg} border ${colors.border} rounded-xl p-4`}>
              <h3 className={`text-sm font-bold ${colors.title} mb-3 flex items-center gap-2`}>
                <span>{colors.icon}</span> {label}
              </h3>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">&#8226;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 text-center mt-4">
        Auto-generated from financial data, technical indicators, and analyst ratings. Not investment advice.
      </p>
    </div>
  );
};

export default GeneratedSwot;
