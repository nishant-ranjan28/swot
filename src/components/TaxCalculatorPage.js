import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useMarket } from '../context/MarketContext';

const formatCurrency = (num, currency) => {
  if (num == null || isNaN(num)) return '-';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (currency === '₹') {
    if (abs >= 1e7) return `${sign}${currency}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${currency}${(abs / 1e5).toFixed(2)} L`;
    return `${sign}${currency}${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${sign}${currency}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DEFAULT_TAX_RATES = {
  in: { stcg: 15, ltcg: 10, ltcgExemption: 100000 },
  us: { stcg: 30, ltcg: 15, ltcgExemption: 0 },
};

const TaxCalculatorPage = () => {
  const [holdings] = useLocalStorage('stockpulse_portfolio', []);
  const { market, currency } = useMarket();
  const [liveData, setLiveData] = useState({});
  const [loading, setLoading] = useState(false);

  // Editable tax rates
  const [taxRates, setTaxRates] = useState(DEFAULT_TAX_RATES[market] || DEFAULT_TAX_RATES.in);

  // Reset tax rates when market changes
  useEffect(() => {
    setTaxRates(DEFAULT_TAX_RATES[market] || DEFAULT_TAX_RATES.in);
  }, [market]);

  const fetchPrices = useCallback(async () => {
    if (!holdings || holdings.length === 0) return;
    setLoading(true);
    try {
      const symbols = [...new Set(holdings.map(h => h.symbol))];
      const symbolsParam = symbols.join(',');
      const res = await api.get(`/api/stocks/batch?symbols=${encodeURIComponent(symbolsParam)}`);
      const quotes = res.data?.quotes || {};
      const map = {};
      symbols.forEach(sym => {
        const q = quotes[sym];
        if (q) {
          map[sym] = { price: q.price || 0, name: q.name || sym };
        }
      });
      setLiveData(map);
    } catch (err) {
      console.error('Error fetching prices for tax calc:', err);
    } finally {
      setLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Calculate holding data with tax info
  const holdingDetails = useMemo(() => {
    const today = new Date();
    return holdings.map(h => {
      const currentPrice = liveData[h.symbol]?.price || h.buyPrice;
      const buyDate = h.buyDate ? new Date(h.buyDate) : today;
      const holdingDays = Math.floor((today - buyDate) / (1000 * 60 * 60 * 24));
      const isLTCG = holdingDays >= 365;
      const gain = (currentPrice - h.buyPrice) * h.quantity;
      const gainPercent = h.buyPrice > 0 ? ((currentPrice - h.buyPrice) / h.buyPrice) * 100 : 0;

      return {
        ...h,
        currentPrice,
        holdingDays,
        isLTCG,
        gain,
        gainPercent,
        type: isLTCG ? 'LTCG' : 'STCG',
      };
    });
  }, [holdings, liveData]);

  // Tax summary
  const taxSummary = useMemo(() => {
    const stcgGains = holdingDetails
      .filter(h => !h.isLTCG && h.gain > 0)
      .reduce((s, h) => s + h.gain, 0);
    const stcgLosses = holdingDetails
      .filter(h => !h.isLTCG && h.gain < 0)
      .reduce((s, h) => s + h.gain, 0);
    const ltcgGains = holdingDetails
      .filter(h => h.isLTCG && h.gain > 0)
      .reduce((s, h) => s + h.gain, 0);
    const ltcgLosses = holdingDetails
      .filter(h => h.isLTCG && h.gain < 0)
      .reduce((s, h) => s + h.gain, 0);

    const totalGains = stcgGains + ltcgGains;
    const totalLosses = stcgLosses + ltcgLosses;
    const netGain = totalGains + totalLosses;

    // Net STCG / LTCG after offsetting losses
    const netSTCG = Math.max(0, stcgGains + stcgLosses);
    const netLTCG = Math.max(0, ltcgGains + ltcgLosses);

    // Tax calculations
    const stcgTax = netSTCG * (taxRates.stcg / 100);
    const taxableLTCG = Math.max(0, netLTCG - (taxRates.ltcgExemption || 0));
    const ltcgTax = taxableLTCG * (taxRates.ltcg / 100);
    const totalTax = stcgTax + ltcgTax;

    return {
      stcgGains, stcgLosses, ltcgGains, ltcgLosses,
      totalGains, totalLosses, netGain,
      netSTCG, netLTCG,
      stcgTax, ltcgTax, taxableLTCG, totalTax,
    };
  }, [holdingDetails, taxRates]);

  // Tax-loss harvesting candidates
  const harvestCandidates = useMemo(() => {
    return holdingDetails
      .filter(h => h.gain < 0)
      .sort((a, b) => a.gain - b.gain);
  }, [holdingDetails]);

  const plColor = val => val >= 0 ? 'text-green-600' : 'text-red-600';
  const plBg = val => val >= 0 ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capital Gains Tax Calculator</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estimate your tax liability on portfolio holdings ({market === 'in' ? 'India' : 'US'} tax rules)
          </p>
        </div>

        {holdings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <div className="text-gray-300 text-5xl mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg font-medium">No holdings to calculate tax on.</p>
            <p className="text-gray-400 text-sm mt-1">
              Add holdings in your <Link to="/portfolio" className="text-blue-600 hover:underline">Portfolio</Link> first.
            </p>
          </div>
        ) : (
          <>
            {/* Tax Rate Settings */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Tax Rate Settings ({market === 'in' ? 'India' : 'US'})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">STCG Rate (%)</label>
                  <input
                    type="number"
                    value={taxRates.stcg}
                    onChange={e => setTaxRates(prev => ({ ...prev, stcg: parseFloat(e.target.value) || 0 }))}
                    min="0" max="100" step="0.5"
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {market === 'in' ? 'Default: 15% for equity' : 'Default: 30% (ordinary income)'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">LTCG Rate (%)</label>
                  <input
                    type="number"
                    value={taxRates.ltcg}
                    onChange={e => setTaxRates(prev => ({ ...prev, ltcg: parseFloat(e.target.value) || 0 }))}
                    min="0" max="100" step="0.5"
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {market === 'in' ? 'Default: 10% above exemption' : 'Default: 15%'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">LTCG Exemption ({currency})</label>
                  <input
                    type="number"
                    value={taxRates.ltcgExemption}
                    onChange={e => setTaxRates(prev => ({ ...prev, ltcgExemption: parseFloat(e.target.value) || 0 }))}
                    min="0" step="1000"
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {market === 'in' ? 'Default: ₹1,00,000 per year' : 'Default: $0'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTaxRates(DEFAULT_TAX_RATES[market] || DEFAULT_TAX_RATES.in)}
                className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium focus:outline-none"
              >
                Reset to defaults
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className={`rounded-xl border border-gray-200 p-4 shadow-sm ${plBg(taxSummary.netGain)}`}>
                <div className="text-xs text-gray-500 mb-1">Total Unrealized Gains</div>
                <div className={`text-lg sm:text-xl font-bold ${plColor(taxSummary.netGain)}`}>
                  {loading ? '...' : formatCurrency(taxSummary.netGain, currency)}
                </div>
              </div>
              <div className="bg-orange-50 rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">STCG ({`<`}1yr)</div>
                <div className={`text-lg sm:text-xl font-bold ${plColor(taxSummary.netSTCG)}`}>
                  {loading ? '...' : formatCurrency(taxSummary.netSTCG, currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Tax: {formatCurrency(taxSummary.stcgTax, currency)}
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">LTCG ({'>'}=1yr)</div>
                <div className={`text-lg sm:text-xl font-bold ${plColor(taxSummary.netLTCG)}`}>
                  {loading ? '...' : formatCurrency(taxSummary.netLTCG, currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Taxable: {formatCurrency(taxSummary.taxableLTCG, currency)}
                </div>
              </div>
              <div className="bg-red-50 rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Estimated Tax</div>
                <div className="text-lg sm:text-xl font-bold text-red-700">
                  {loading ? '...' : formatCurrency(taxSummary.totalTax, currency)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  STCG: {formatCurrency(taxSummary.stcgTax, currency)} + LTCG: {formatCurrency(taxSummary.ltcgTax, currency)}
                </div>
              </div>
            </div>

            {/* Per-Holding Breakdown Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Per-Holding Breakdown</h2>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <th className="text-left px-4 py-3 font-medium">Stock</th>
                      <th className="text-right px-3 py-3 font-medium">Buy Date</th>
                      <th className="text-right px-3 py-3 font-medium">Holding</th>
                      <th className="text-right px-3 py-3 font-medium">Buy Price</th>
                      <th className="text-right px-3 py-3 font-medium">CMP</th>
                      <th className="text-right px-3 py-3 font-medium">Qty</th>
                      <th className="text-right px-3 py-3 font-medium">Gain/Loss</th>
                      <th className="text-center px-3 py-3 font-medium">Type</th>
                      <th className="text-right px-3 py-3 font-medium">Est. Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {holdingDetails.map((h, idx) => {
                      const taxRate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                      const estTax = h.gain > 0 ? h.gain * (taxRate / 100) : 0;

                      return (
                        <tr key={h.id || idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link to={`/stock/${h.symbol}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                              {h.name}
                            </Link>
                            <div className="text-xs text-gray-400">{h.symbol}</div>
                          </td>
                          <td className="text-right px-3 py-3 text-gray-600 text-xs">
                            {h.buyDate || 'N/A'}
                          </td>
                          <td className="text-right px-3 py-3 text-gray-600 text-xs">
                            {h.holdingDays} days
                          </td>
                          <td className="text-right px-3 py-3 text-gray-700">
                            {currency}{h.buyPrice.toFixed(2)}
                          </td>
                          <td className="text-right px-3 py-3 font-medium text-gray-900">
                            {loading ? '...' : `${currency}${h.currentPrice.toFixed(2)}`}
                          </td>
                          <td className="text-right px-3 py-3 text-gray-700">{h.quantity}</td>
                          <td className="text-right px-3 py-3">
                            <div className={`font-medium ${plColor(h.gain)}`}>
                              {loading ? '...' : formatCurrency(h.gain, currency)}
                            </div>
                            <div className={`text-xs ${plColor(h.gainPercent)}`}>
                              {loading ? '' : `${h.gainPercent >= 0 ? '+' : ''}${h.gainPercent.toFixed(2)}%`}
                            </div>
                          </td>
                          <td className="text-center px-3 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              h.isLTCG ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {h.type}
                            </span>
                          </td>
                          <td className="text-right px-3 py-3 text-gray-700 font-medium">
                            {loading ? '...' : h.gain > 0 ? formatCurrency(estTax, currency) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3 p-4">
                {holdingDetails.map((h, idx) => {
                  const taxRate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                  const estTax = h.gain > 0 ? h.gain * (taxRate / 100) : 0;

                  return (
                    <div key={h.id || idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <Link to={`/stock/${h.symbol}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                            {h.name}
                          </Link>
                          <div className="text-xs text-gray-400">{h.symbol}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          h.isLTCG ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {h.type} ({h.holdingDays}d)
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">Buy</span>
                          <div className="text-gray-800 font-medium">{currency}{h.buyPrice.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">CMP</span>
                          <div className="text-gray-900 font-medium">{loading ? '...' : `${currency}${h.currentPrice.toFixed(2)}`}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Gain/Loss</span>
                          <div className={`font-medium ${plColor(h.gain)}`}>
                            {loading ? '...' : formatCurrency(h.gain, currency)}
                          </div>
                        </div>
                      </div>
                      {h.gain > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200 text-xs">
                          <span className="text-gray-400">Est. Tax:</span>
                          <span className="ml-1 font-medium text-red-700">{formatCurrency(estTax, currency)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tax-Loss Harvesting */}
            {harvestCandidates.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">Tax-Loss Harvesting Opportunities</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    These holdings have unrealized losses that could be booked to offset gains and reduce tax liability.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-red-50 text-gray-500 text-xs uppercase">
                        <th className="text-left px-4 py-3 font-medium">Stock</th>
                        <th className="text-right px-3 py-3 font-medium">Unrealized Loss</th>
                        <th className="text-right px-3 py-3 font-medium">Loss %</th>
                        <th className="text-center px-3 py-3 font-medium">Type</th>
                        <th className="text-right px-3 py-3 font-medium">Potential Tax Saving</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {harvestCandidates.map((h, idx) => {
                        const taxRate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                        const potentialSaving = Math.abs(h.gain) * (taxRate / 100);

                        return (
                          <tr key={h.id || idx} className="hover:bg-red-50/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link to={`/stock/${h.symbol}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                                {h.name}
                              </Link>
                              <div className="text-xs text-gray-400">{h.symbol}</div>
                            </td>
                            <td className="text-right px-3 py-3 text-red-600 font-medium">
                              {formatCurrency(h.gain, currency)}
                            </td>
                            <td className="text-right px-3 py-3 text-red-600 text-xs">
                              {h.gainPercent.toFixed(2)}%
                            </td>
                            <td className="text-center px-3 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                h.isLTCG ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                              }`}>
                                {h.type}
                              </span>
                            </td>
                            <td className="text-right px-3 py-3 text-green-600 font-medium">
                              {formatCurrency(potentialSaving, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Total potential tax saving: <span className="font-semibold text-green-700">
                      {formatCurrency(
                        harvestCandidates.reduce((s, h) => {
                          const rate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                          return s + Math.abs(h.gain) * (rate / 100);
                        }, 0),
                        currency
                      )}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">Disclaimer</p>
                  <p className="text-xs text-amber-700 mt-1">
                    This is an estimate based on simplified tax rules. Actual tax liability may differ based on your specific
                    financial situation, exemptions, surcharges, cess, and other factors. Please consult a qualified tax
                    professional before making any tax-related decisions.
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {market === 'in'
                      ? 'India: STCG at 15% (Section 111A), LTCG at 10% above ₹1L exemption (Section 112A) for listed equity.'
                      : 'US: Simplified rates shown. Actual rates depend on income bracket and filing status.'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TaxCalculatorPage;
