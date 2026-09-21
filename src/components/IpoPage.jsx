import React, { useState } from 'react';
import { UPCOMING_IPOS, RECENT_LISTINGS } from '../data/ipoData';

function IpoPage() {
  const [activeTab, setActiveTab] = useState('upcoming');

  const listingGainPct = (issue, listing) => (((listing - issue) / issue) * 100).toFixed(1);
  const currentGainPct = (issue, cmp) => (((cmp - issue) / issue) * 100).toFixed(1);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">IPO Tracker</h1>
      <p className="text-gray-400 text-sm mb-6">Track upcoming IPOs and recent listing performance</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'upcoming'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Upcoming IPOs ({UPCOMING_IPOS.length})
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'recent'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Recent Listings ({RECENT_LISTINGS.length})
        </button>
      </div>

      {/* Upcoming IPOs */}
      {activeTab === 'upcoming' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {UPCOMING_IPOS.map((ipo, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-white font-semibold text-sm">{ipo.name}</h3>
                <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded">{ipo.sector}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Expected Date</span>
                  <span className="text-gray-200">{ipo.dates}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price Band</span>
                  <span className="text-gray-200">{ipo.priceRange}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lot Size</span>
                  <span className="text-gray-200">{ipo.lotSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Exchange</span>
                  <span className="text-gray-200">{ipo.exchange}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Listings */}
      {activeTab === 'recent' && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/50">
                  <th className="text-left text-gray-400 py-3 px-4">Company</th>
                  <th className="text-left text-gray-400 py-3 px-3">Sector</th>
                  <th className="text-center text-gray-400 py-3 px-3">List Date</th>
                  <th className="text-right text-gray-400 py-3 px-3">Issue Price</th>
                  <th className="text-right text-gray-400 py-3 px-3">List Price</th>
                  <th className="text-right text-gray-400 py-3 px-3">List Gain%</th>
                  <th className="text-right text-gray-400 py-3 px-3">CMP</th>
                  <th className="text-right text-gray-400 py-3 px-4">Current Gain%</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_LISTINGS.map((ipo, i) => {
                  const lg = listingGainPct(ipo.issuePrice, ipo.listingPrice);
                  const cg = currentGainPct(ipo.issuePrice, ipo.cmp);
                  return (
                    <tr key={i} className="border-t border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3 px-4 text-white font-medium">{ipo.name}</td>
                      <td className="py-3 px-3 text-gray-400">{ipo.sector}</td>
                      <td className="py-3 px-3 text-center text-gray-300">{ipo.listDate}</td>
                      <td className="py-3 px-3 text-right text-gray-300">{'\u20b9'}{ipo.issuePrice}</td>
                      <td className="py-3 px-3 text-right text-gray-300">{'\u20b9'}{ipo.listingPrice}</td>
                      <td className={`py-3 px-3 text-right font-medium ${parseFloat(lg) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(lg) >= 0 ? '+' : ''}{lg}%
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">{'\u20b9'}{ipo.cmp}</td>
                      <td className={`py-3 px-4 text-right font-medium ${parseFloat(cg) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(cg) >= 0 ? '+' : ''}{cg}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 mt-6">
        <p className="text-yellow-500 text-xs">
          Note: IPO data is manually curated and may not be real-time. Verify details from official sources (SEBI, stock exchanges) before making investment decisions.
        </p>
      </div>
    </div>
  );
}

export default IpoPage;
