// src/components/StockDetail/FinancialsTab.js
import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';

const InfoRow = ({ label, value, highlight }) => (
  <div className={`flex justify-between items-center py-2 border-b border-gray-100 last:border-0 ${highlight ? 'bg-blue-50/50 px-2 rounded' : ''}`}>
    <span className="text-gray-600 text-sm">{label}</span>
    <span className="font-medium text-gray-900 text-sm">{value ?? 'N/A'}</span>
  </div>
);

const formatPercent = (val) => (val != null ? `${(val * 100).toFixed(2)}%` : 'N/A');
const formatRatio = (val) => (val != null ? val.toFixed(2) : 'N/A');
const formatCurrency = (num, cur = '₹') => {
  if (!num) return 'N/A';
  if (cur === '$') {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString('en-US')}`;
  }
  if (num >= 1e12) return `₹${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const FinancialsTab = ({ symbol }) => {
  const { data: financials, loading, error } = useStockData(`/api/stocks/${symbol}/financials`);
  const { data: statements, loading: stLoading } = useStockData(`/api/stocks/${symbol}/statements`);
  const { currency } = useMarket();
  const [statementType, setStatementType] = useState('income_statement');

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={() => window.location.reload()} className="text-blue-600 underline ml-2">Retry</button></div>;

  return (
    <div className="space-y-6">
      {/* Key Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Valuation</h3>
          <InfoRow label="P/E Ratio (TTM)" value={formatRatio(financials?.pe_ratio)} highlight />
          <InfoRow label="Forward P/E" value={formatRatio(financials?.forward_pe)} />
          <InfoRow label="PEG Ratio" value={formatRatio(financials?.peg_ratio)} />
          <InfoRow label="Price/Book" value={formatRatio(financials?.price_to_book)} />
          <InfoRow label="EPS (TTM)" value={financials?.eps ? `${currency}${financials.eps.toFixed(2)}` : 'N/A'} />
          <InfoRow label="Forward EPS" value={financials?.forward_eps ? `${currency}${financials.forward_eps.toFixed(2)}` : 'N/A'} />
          <InfoRow label="Book Value" value={financials?.book_value ? `${currency}${financials.book_value.toFixed(2)}` : 'N/A'} />
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Profitability & Growth</h3>
          <InfoRow label="Profit Margin" value={formatPercent(financials?.profit_margin)} highlight />
          <InfoRow label="Operating Margin" value={formatPercent(financials?.operating_margin)} />
          <InfoRow label="Gross Margin" value={formatPercent(financials?.gross_margin)} />
          <InfoRow label="ROE" value={formatPercent(financials?.return_on_equity)} />
          <InfoRow label="ROA" value={formatPercent(financials?.return_on_assets)} />
          <InfoRow label="Revenue" value={formatCurrency(financials?.revenue, currency)} />
          <InfoRow label="Revenue Growth" value={formatPercent(financials?.revenue_growth)} />
          <InfoRow label="Debt/Equity" value={formatRatio(financials?.debt_to_equity)} />
        </div>
      </div>

      {/* Financial Statements */}
      {statements && (
        <div>
          <div className="flex gap-2 mb-4">
            {['income_statement', 'balance_sheet', 'cash_flow'].map((type) => (
              <button
                key={type}
                onClick={() => setStatementType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statementType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>

          {stLoading ? (
            <TabSkeleton rows={8} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 text-gray-600 font-medium">Item</th>
                    {statements[statementType]?.map((col) => (
                      <th key={col.date} className="text-right p-2 text-gray-600 font-medium">
                        {col.date}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statements[statementType]?.[0] &&
                    Object.keys(statements[statementType][0])
                      .filter((key) => key !== 'date')
                      .slice(0, 15)
                      .map((key) => (
                        <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-2 text-gray-700">{key}</td>
                          {statements[statementType].map((col) => (
                            <td key={col.date} className="p-2 text-right text-gray-900">
                              {col[key] != null ? formatCurrency(col[key], currency) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinancialsTab;
