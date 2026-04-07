import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';

const OptionsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/options`);
  const { currency } = useMarket();
  const [view, setView] = useState('calls'); // 'calls' | 'puts' | 'both'

  const isIndian = symbol?.endsWith('.NS') || symbol?.endsWith('.BO');

  if (loading) return <TabSkeleton rows={8} />;
  if (error || !data || (!data.calls?.length && !data.puts?.length)) {
    return (
      <div className="text-center py-10">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {isIndian ? (
          <>
            <h3 className="text-base font-semibold text-gray-700 mb-1">Options data not available for Indian stocks</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Yahoo Finance does not provide options chain data for NSE/BSE listed stocks.
              Options data is available for US-listed stocks (e.g., AAPL, MSFT, TSLA).
            </p>
            <p className="text-xs text-gray-400 mt-3">
              Try switching to the US market and searching for a US stock to view options.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-gray-700 mb-1">No options data available</h3>
            <p className="text-sm text-gray-500">This stock may not have listed options, or data is temporarily unavailable.</p>
            {error && <button onClick={refetch} className="mt-2 text-sm text-blue-600 underline focus:outline-none">Retry</button>}
          </>
        )}
      </div>
    );
  }

  const locale = currency === '$' ? 'en-US' : 'en-IN';
  const fmtPrice = (val) => val != null ? `${currency}${val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
  const fmtNum = (val) => val != null ? val.toLocaleString(locale) : '-';

  const pcr = data.pcr ?? 0;
  const pcrLabel = pcr > 1 ? 'Bearish' : pcr < 0.7 ? 'Bullish' : 'Neutral';
  const pcrColor = pcr > 1 ? 'text-red-600' : pcr < 0.7 ? 'text-green-600' : 'text-yellow-600';
  const pcrBg = pcr > 1 ? 'bg-red-50 border-red-200' : pcr < 0.7 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200';

  const totalOI = (data.total_call_oi || 0) + (data.total_put_oi || 0);
  const callPct = totalOI > 0 ? Math.round((data.total_call_oi / totalOI) * 100) : 50;
  const putPct = 100 - callPct;

  const currentPrice = data.current_price || 0;

  const renderTable = (options, type) => {
    if (!options || options.length === 0) {
      return <div className="text-gray-400 text-center py-4">No {type} data.</div>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
              <th className="px-3 py-2 text-left">Strike</th>
              <th className="px-3 py-2 text-right">Last</th>
              <th className="px-3 py-2 text-right">Bid</th>
              <th className="px-3 py-2 text-right">Ask</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">OI</th>
              <th className="px-3 py-2 text-right">IV%</th>
              <th className="px-3 py-2 text-center">ITM</th>
            </tr>
          </thead>
          <tbody>
            {options.map((opt, idx) => {
              const isNearPrice = currentPrice > 0 &&
                Math.abs(opt.strike - currentPrice) / currentPrice < 0.005;
              const itmBg = opt.in_the_money ? 'bg-blue-50/60' : '';
              const priceLine = isNearPrice ? 'border-t-2 border-blue-500' : '';

              return (
                <tr
                  key={`${type}-${idx}`}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${itmBg} ${priceLine}`}
                >
                  <td className="px-3 py-2 font-medium text-gray-900">{fmtPrice(opt.strike)}</td>
                  <td className="px-3 py-2 text-right">{fmtPrice(opt.last_price)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmtPrice(opt.bid)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmtPrice(opt.ask)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(opt.volume)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(opt.open_interest)}</td>
                  <td className="px-3 py-2 text-right">{opt.implied_vol != null ? `${opt.implied_vol}%` : '-'}</td>
                  <td className="px-3 py-2 text-center">
                    {opt.in_the_money ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="In the Money" />
                    ) : (
                      <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="Out of the Money" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header: Expiration + PCR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">Expiration Date</div>
          <div className="flex flex-wrap gap-2">
            {data.expirations?.map((exp) => (
              <span
                key={exp}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  exp === data.selected_expiration
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {exp}
              </span>
            ))}
          </div>
        </div>
        <div className={`border rounded-lg px-4 py-2 text-center ${pcrBg}`}>
          <div className="text-xs text-gray-500">Put-Call Ratio</div>
          <div className={`text-2xl font-bold ${pcrColor}`}>{pcr.toFixed(2)}</div>
          <div className={`text-xs font-semibold ${pcrColor}`}>{pcrLabel}</div>
        </div>
      </div>

      {/* OI Comparison Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Call OI: {fmtNum(data.total_call_oi)}</span>
          <span>Put OI: {fmtNum(data.total_put_oi)}</span>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${callPct}%` }}
            title={`Calls: ${callPct}%`}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${putPct}%` }}
            title={`Puts: ${putPct}%`}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>Calls {callPct}%</span>
          <span>Puts {putPct}%</span>
        </div>
      </div>

      {/* Current Price */}
      {currentPrice > 0 && (
        <div className="text-sm text-gray-600">
          Current Price: <span className="font-semibold text-gray-900">{fmtPrice(currentPrice)}</span>
          <span className="text-xs text-blue-500 ml-2">(blue line in table marks nearest strike)</span>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { id: 'calls', label: 'Calls' },
          { id: 'puts', label: 'Puts' },
          { id: 'both', label: 'Both' },
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setView(btn.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === btn.id
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Options Tables */}
      {(view === 'calls' || view === 'both') && (
        <div>
          <h3 className="text-md font-semibold text-green-700 mb-2">
            Calls ({data.calls?.length || 0})
          </h3>
          {renderTable(data.calls, 'calls')}
        </div>
      )}

      {(view === 'puts' || view === 'both') && (
        <div>
          <h3 className="text-md font-semibold text-red-700 mb-2">
            Puts ({data.puts?.length || 0})
          </h3>
          {renderTable(data.puts, 'puts')}
        </div>
      )}
    </div>
  );
};

export default OptionsTab;
