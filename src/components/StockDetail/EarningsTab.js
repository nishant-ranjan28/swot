import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import { formatNumber } from '../../utils/formatters';
import TabSkeleton from './TabSkeleton';

const EarningsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/earnings`);
  const { currency } = useMarket();
  const [showAnnual, setShowAnnual] = useState(false);

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No earnings data available.</div>;

  const m = data.metrics || {};

  const fmtPct = (val) => {
    if (val == null) return '-';
    const pct = val < 1 && val > -1 ? val * 100 : val;
    return <span className={pct >= 0 ? 'text-green-600' : 'text-red-600'}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>;
  };

  return (
    <div className="space-y-6">
      {/* Next Earnings + Upcoming */}
      {(data.earnings_date || data.upcoming?.length > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="text-sm text-blue-600 font-semibold">Next Earnings Date</div>
              <div className="text-xl font-bold text-blue-900">{data.earnings_date || 'TBD'}</div>
            </div>
            {data.upcoming?.[0]?.estimate && (
              <div className="text-right">
                <div className="text-xs text-blue-500">EPS Estimate</div>
                <div className="text-lg font-bold text-blue-800">{data.upcoming[0].estimate.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key EPS Metrics */}
      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">Earnings Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Trailing EPS', value: m.trailing_eps?.toFixed(2) },
            { label: 'Forward EPS', value: m.forward_eps?.toFixed(2) },
            { label: 'P/E Ratio', value: m.pe_ratio?.toFixed(2) },
            { label: 'Forward P/E', value: m.forward_pe?.toFixed(2) },
            { label: 'PEG Ratio', value: m.peg_ratio?.toFixed(2) },
            { label: 'Revenue/Share', value: m.revenue_per_share ? `${currency}${m.revenue_per_share.toFixed(2)}` : null },
            { label: 'Earnings Growth', value: m.earnings_growth != null ? fmtPct(m.earnings_growth) : null, raw: true },
            { label: 'Revenue Growth', value: m.revenue_growth != null ? fmtPct(m.revenue_growth) : null, raw: true },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">{item.label}</div>
              <div className="text-sm font-bold text-gray-900">{item.raw ? item.value : (item.value || '-')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue & Profitability Summary */}
      {(m.total_revenue || m.net_income || m.ebitda) && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Revenue & Profitability (TTM)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Revenue', value: m.total_revenue },
              { label: 'Net Income', value: m.net_income },
              { label: 'EBITDA', value: m.ebitda },
              { label: 'Gross Profit', value: m.gross_profits },
            ].filter(i => i.value).map((item) => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                <div className="text-sm font-bold text-gray-900">{formatNumber(item.value, currency)}</div>
              </div>
            ))}
          </div>
          {(m.profit_margins || m.ebitda_margins) && (
            <div className="flex gap-4 mt-2">
              {m.profit_margins != null && (
                <span className="text-xs text-gray-500">Profit Margin: <strong>{(m.profit_margins * 100).toFixed(1)}%</strong></span>
              )}
              {m.ebitda_margins != null && (
                <span className="text-xs text-gray-500">EBITDA Margin: <strong>{(m.ebitda_margins * 100).toFixed(1)}%</strong></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* EPS History */}
      {data.history?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-2">EPS History</h3>
          <p className="text-xs text-gray-500 mb-3">Earnings per share — estimate vs actual with surprise %</p>

          {/* EPS Beat/Miss visual */}
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {data.history.slice(0, 8).reverse().map((entry, idx) => {
              const beat = entry.actual != null && entry.estimate != null && entry.actual > entry.estimate;
              const miss = entry.actual != null && entry.estimate != null && entry.actual < entry.estimate;
              return (
                <div key={idx} className="flex flex-col items-center min-w-[60px]">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    beat ? 'bg-green-100 text-green-700' : miss ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {beat ? '✓' : miss ? '✗' : '-'}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{entry.date?.substring(0, 7)}</div>
                  {entry.surprise_percent != null && (
                    <div className={`text-[10px] font-semibold ${entry.surprise_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.surprise_percent >= 0 ? '+' : ''}{entry.surprise_percent.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* EPS Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Quarter</th>
                  <th className="text-right p-2 text-gray-600 font-medium">EPS Estimate</th>
                  <th className="text-right p-2 text-gray-600 font-medium">EPS Actual</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Surprise</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((entry, idx) => {
                  const beat = entry.actual != null && entry.estimate != null && entry.actual > entry.estimate;
                  const miss = entry.actual != null && entry.estimate != null && entry.actual < entry.estimate;
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 text-gray-700">{entry.date}</td>
                      <td className="p-2 text-right text-gray-600">{entry.estimate?.toFixed(2) ?? '-'}</td>
                      <td className={`p-2 text-right font-medium ${beat ? 'text-green-600' : miss ? 'text-red-600' : 'text-gray-900'}`}>
                        {entry.actual?.toFixed(2) ?? '-'}
                      </td>
                      <td className={`p-2 text-right ${(entry.surprise_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {entry.surprise_percent != null ? `${entry.surprise_percent >= 0 ? '+' : ''}${entry.surprise_percent.toFixed(2)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarterly Financial Results */}
      {data.quarterly?.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-md font-semibold text-gray-800">
              {showAnnual ? 'Annual' : 'Quarterly'} Results
            </h3>
            <div className="flex gap-1.5">
              <button onClick={() => setShowAnnual(false)}
                className={`px-3 py-1 rounded-lg text-xs font-medium focus:outline-none ${!showAnnual ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Quarterly
              </button>
              {data.annual?.length > 0 && (
                <button onClick={() => setShowAnnual(true)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium focus:outline-none ${showAnnual ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  Annual
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Period</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Revenue</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Net Income</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Op. Income</th>
                  <th className="text-right p-2 text-gray-600 font-medium">EBITDA</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Gross Profit</th>
                </tr>
              </thead>
              <tbody>
                {(showAnnual ? data.annual : data.quarterly)?.map((q, idx) => {
                  // Calculate QoQ/YoY growth for revenue
                  const prev = (showAnnual ? data.annual : data.quarterly)?.[idx + 1];
                  const revGrowth = prev?.revenue && q.revenue ? ((q.revenue - prev.revenue) / prev.revenue * 100) : null;
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 text-gray-700 whitespace-nowrap">
                        {q.date}
                        {revGrowth != null && (
                          <div className={`text-[10px] ${revGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            Rev {revGrowth >= 0 ? '+' : ''}{revGrowth.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right font-medium">{q.revenue ? formatNumber(q.revenue, currency) : '-'}</td>
                      <td className={`p-2 text-right font-medium ${(q.net_income || 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {q.net_income ? formatNumber(q.net_income, currency) : '-'}
                      </td>
                      <td className="p-2 text-right">{q.operating_income ? formatNumber(q.operating_income, currency) : '-'}</td>
                      <td className="p-2 text-right">{q.ebitda ? formatNumber(q.ebitda, currency) : '-'}</td>
                      <td className="p-2 text-right">{q.gross_profit ? formatNumber(q.gross_profit, currency) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Note:</span> Earnings data is sourced from Yahoo Finance and may have slight delays. Quarterly results are based on reported financial statements.
        </p>
      </div>
    </div>
  );
};

export default EarningsTab;
