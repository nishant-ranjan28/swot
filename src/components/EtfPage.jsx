import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import PriceChart from './PriceChart';

function EtfPage() {
  const { market } = useMarket();
  const [etfs, setEtfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);

  // Overlap
  const [overlapMode, setOverlapMode] = useState(false);
  const [overlapEtf1, setOverlapEtf1] = useState('');
  const [overlapEtf2, setOverlapEtf2] = useState('');
  const [overlapResult, setOverlapResult] = useState(null);
  const [loadingOverlap, setLoadingOverlap] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedEtf(null);
    setHoldings(null);
    api.get(`/api/stocks/etfs?market=${market}`)
      .then(res => setEtfs(res.data.etfs || []))
      .catch(() => setError('Failed to load ETF data'))
      .finally(() => setLoading(false));
  }, [market]);

  const selectEtf = (etf) => {
    setSelectedEtf(etf);
    setLoadingHoldings(true);
    setHoldings(null);
    api.get(`/api/stocks/etf/${encodeURIComponent(etf.symbol)}/holdings`)
      .then(res => setHoldings(res.data))
      .catch(() => setHoldings(null))
      .finally(() => setLoadingHoldings(false));
  };

  const checkOverlap = () => {
    if (!overlapEtf1 || !overlapEtf2 || overlapEtf1 === overlapEtf2) return;
    setLoadingOverlap(true);
    setOverlapResult(null);
    api.get(`/api/stocks/etf/overlap?symbols=${encodeURIComponent(overlapEtf1)},${encodeURIComponent(overlapEtf2)}`)
      .then(res => setOverlapResult(res.data))
      .catch(() => setOverlapResult(null))
      .finally(() => setLoadingOverlap(false));
  };

  const currency = market === 'in' ? '₹' : '$';

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ETF Screener</h1>
          <p className="text-sm text-gray-500 mt-1">
            Popular {market === 'in' ? 'Indian' : 'US'} ETFs with holdings & overlap analysis
          </p>
        </div>
        <button
          onClick={() => { setOverlapMode(!overlapMode); setSelectedEtf(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            overlapMode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {overlapMode ? 'Back to ETFs' : 'Overlap Checker'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Overlap Checker */}
      {overlapMode && (
        <div className="mb-6 space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">ETF Overlap Checker</h2>
            <p className="text-sm text-gray-500 mb-4">
              Compare holdings of two ETFs to find common positions
            </p>
            {market === 'in' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-700">
                Holdings and overlap data is only available for US ETFs. Switch to US market to use this feature.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">ETF 1</label>
                <select
                  value={overlapEtf1}
                  onChange={e => setOverlapEtf1(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select ETF</option>
                  {etfs.map(e => (
                    <option key={e.symbol} value={e.symbol}>{e.symbol} - {e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">ETF 2</label>
                <select
                  value={overlapEtf2}
                  onChange={e => setOverlapEtf2(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select ETF</option>
                  {etfs.map(e => (
                    <option key={e.symbol} value={e.symbol}>{e.symbol} - {e.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={checkOverlap}
                disabled={!overlapEtf1 || !overlapEtf2 || overlapEtf1 === overlapEtf2 || loadingOverlap}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {loadingOverlap ? 'Analyzing...' : 'Check Overlap'}
              </button>
            </div>
          </div>

          {overlapResult && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Overlap Results</h3>
                <span className="text-sm font-bold text-purple-600">
                  {overlapResult.overlap_count || 0} common holdings
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">{overlapResult.etf1?.symbol}</div>
                  <div className="font-bold text-gray-900">{overlapResult.etf1_total || 0} holdings</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Common</div>
                  <div className="font-bold text-purple-700">{overlapResult.overlap_count || 0}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">{overlapResult.etf2?.symbol}</div>
                  <div className="font-bold text-gray-900">{overlapResult.etf2_total || 0} holdings</div>
                </div>
              </div>
              {overlapResult.common_holdings?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Common Holdings</h4>
                  <div className="flex flex-wrap gap-2">
                    {overlapResult.common_holdings.map((h, i) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(!overlapResult.common_holdings || overlapResult.common_holdings.length === 0) && (
                <p className="text-gray-400 text-sm text-center">No common holdings found (holdings data may be limited)</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ETF Detail */}
      {selectedEtf && !overlapMode && (
        <div className="mb-6 space-y-4">
          <button
            onClick={() => { setSelectedEtf(null); setHoldings(null); }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            &larr; Back to all ETFs
          </button>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedEtf.name}</h2>
                <Link to={`/stock/${selectedEtf.symbol}`} className="text-sm text-blue-600 hover:underline">
                  {selectedEtf.symbol}
                </Link>
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{selectedEtf.category}</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {currency}{selectedEtf.price?.toFixed(2) || 'N/A'}
                </div>
                <div className={`text-sm font-medium ${(selectedEtf.change_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(selectedEtf.change_percent || 0) >= 0 ? '+' : ''}{selectedEtf.change_percent?.toFixed(2) || '0'}%
                </div>
              </div>
            </div>
          </div>

          {/* Price Chart */}
          <PriceChart symbol={selectedEtf.symbol} title={`${selectedEtf.name} Price Chart`} decimals={2} />

          {/* Holdings */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Fund Details & Holdings</h3>
            {loadingHoldings ? (
              <div className="animate-pulse space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded w-3/4" />)}
              </div>
            ) : holdings ? (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {holdings.total_assets && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Total Assets</div>
                      <div className="font-bold text-gray-900 text-sm">
                        {holdings.total_assets >= 1e9
                          ? `${currency}${(holdings.total_assets / 1e9).toFixed(2)}B`
                          : holdings.total_assets >= 1e6
                            ? `${currency}${(holdings.total_assets / 1e6).toFixed(1)}M`
                            : `${currency}${holdings.total_assets?.toLocaleString()}`}
                      </div>
                    </div>
                  )}
                  {holdings.expense_ratio != null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Expense Ratio</div>
                      <div className="font-bold text-gray-900 text-sm">{(holdings.expense_ratio * 100).toFixed(2)}%</div>
                    </div>
                  )}
                  {holdings.ytd_return != null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">YTD Return</div>
                      <div className={`font-bold text-sm ${holdings.ytd_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(holdings.ytd_return * 100).toFixed(2)}%
                      </div>
                    </div>
                  )}
                  {holdings.three_year_return != null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">3Y Return</div>
                      <div className={`font-bold text-sm ${holdings.three_year_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(holdings.three_year_return * 100).toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>

                {holdings.top_holdings?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Top Holdings</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                            <th className="text-left px-3 py-2 font-medium">Symbol</th>
                            <th className="text-left px-3 py-2 font-medium">Name</th>
                            <th className="text-right px-3 py-2 font-medium">Weight</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {holdings.top_holdings.map((h, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <Link to={`/stock/${h.symbol}`} className="text-blue-600 hover:text-blue-800 font-medium">
                                  {h.symbol || '-'}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-900">{h.name || '-'}</td>
                              <td className="px-3 py-2 text-right text-gray-600 font-medium">
                                {h.weight != null ? `${h.weight}%` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {(!holdings.top_holdings || holdings.top_holdings.length === 0) && (
                  <p className="text-gray-400 text-sm text-center py-4">
                Holdings data not available for this ETF.
                {market === 'in' && ' Indian ETF holdings are not provided by Yahoo Finance.'}
              </p>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">Failed to load holdings data</p>
            )}
          </div>
        </div>
      )}

      {/* ETF Grid */}
      {!selectedEtf && !overlapMode && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-32" />
              ))}
            </div>
          ) : etfs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {etfs.map(etf => {
                const isPositive = (etf.change_percent || 0) >= 0;
                return (
                  <button
                    key={etf.symbol}
                    type="button"
                    onClick={() => selectEtf(etf)}
                    className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-bold text-gray-900">{etf.symbol.replace('.NS', '')}</div>
                        <div className="text-xs text-gray-500 line-clamp-1">{etf.name}</div>
                      </div>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{etf.category}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-lg font-bold text-gray-900">
                        {etf.price ? `${currency}${etf.price.toFixed(2)}` : 'N/A'}
                      </span>
                      <span className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{etf.change_percent?.toFixed(2) || '0'}%
                      </span>
                    </div>
                    {etf.volume && (
                      <div className="text-xs text-gray-400 mt-1">
                        Vol: {(etf.volume / 1000).toFixed(0)}K
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">No ETF data available</div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <div className="mt-8 text-xs text-gray-400 text-center">
        Data sourced from Yahoo Finance. ETF prices and holdings may be delayed. Not financial advice.
      </div>
    </div>
  );
}

export default EtfPage;
