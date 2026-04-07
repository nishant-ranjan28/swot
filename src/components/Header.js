// src/components/Header.js
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/compare', label: 'Compare' },
  { to: '/screener', label: 'Screener' },
  { to: '/scanner', label: '52W Scanner' },
  { to: '/calculator', label: 'Calculators' },
  { to: '/news', label: 'News' },
];

function Header() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { market, setMarket } = useMarket();

  const isActive = (path) =>
    location.pathname === path ||
    (path === '/' && location.pathname.startsWith('/stock'));

  return (
    <header className="bg-gray-800 text-white shadow-md sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          {/* Logo + Market Toggle */}
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xl font-bold hover:text-gray-300 transition-colors">
              StockPulse
            </Link>
            {/* Market Toggle */}
            <div className="flex items-center bg-gray-700 rounded-full p-0.5">
              <button
                onClick={() => setMarket('in')}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors focus:outline-none ${
                  market === 'in' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                IN
              </button>
              <button
                onClick={() => setMarket('us')}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors focus:outline-none ${
                  market === 'us' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                US
              </button>
            </div>
          </div>

          {/* Desktop nav */}
          <div className="hidden lg:flex gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-2.5 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                  isActive(item.to) ? 'text-blue-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2 rounded hover:bg-gray-700 transition-colors focus:outline-none"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="lg:hidden mt-3 pb-2 border-t border-gray-700 pt-3 grid grid-cols-2 gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2 rounded text-sm transition-colors ${
                  isActive(item.to) ? 'text-blue-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}

export default Header;
