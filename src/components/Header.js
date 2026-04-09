// src/components/Header.js
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { useTheme } from '../context/ThemeContext';

// Primary nav — what users need daily
const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/screener', label: 'Screener' },
  { to: '/news', label: 'News' },
];

// More items — grouped by category, ordered by importance
const MORE_ITEMS = [
  // Research & Analysis
  { to: '/compare', label: 'Compare Stocks' },
  { to: '/scanner', label: '52W Scanner' },
  { to: '/sector-heatmap', label: 'Sector Heatmap' },
  { to: '/backtest', label: 'Backtest Strategy' },
  // Markets & Funds
  { to: '/mutual-funds', label: 'Mutual Funds' },
  { to: '/etf', label: 'ETF Screener' },
  { to: '/crypto', label: 'Crypto' },
  { to: '/commodities', label: 'Commodities' },
  { to: '/forex', label: 'Forex' },
  { to: '/macro', label: 'Macro Dashboard' },
  // Calendar & Events
  { to: '/earnings-calendar', label: 'Earnings Calendar' },
  { to: '/economic-calendar', label: 'Economic Calendar' },
  { to: '/ipo', label: 'IPO Tracker' },
  // Market Intelligence
  { to: '/trending', label: 'Trending & Sentiment' },
  { to: '/fii-dii', label: 'FII/DII Flows' },
  { to: '/deals', label: 'Insider Deals' },
  // Tools
  { to: '/calculator', label: 'Calculators' },
  { to: '/tax', label: 'Tax Calculator' },
  // Learn
  { to: '/glossary', label: 'Glossary' },
];

const ALL_ITEMS = [...NAV_ITEMS, ...MORE_ITEMS];

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { market } = useMarket();
  const { isDark, toggleTheme } = useTheme();
  const moreRef = useRef(null);

  const isActive = (path) =>
    location.pathname === path ||
    (path === '/' && location.pathname.startsWith('/stock'));

  // Close "More" dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close "More" dropdown on route change
  useEffect(() => {
    setMoreOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

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
                onClick={() => { if (market !== 'in') navigate('/in'); }}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors focus:outline-none ${
                  market === 'in' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                IN
              </button>
              <button
                onClick={() => { if (market !== 'us') navigate('/us'); }}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors focus:outline-none ${
                  market === 'us' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                US
              </button>
            </div>

            {/* Theme Toggle */}
            <button onClick={toggleTheme} className="p-1.5 rounded-full hover:bg-gray-700 transition-colors focus:outline-none" title={isDark ? 'Light mode' : 'Dark mode'} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? (
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">
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

            {/* More dropdown */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={`px-2.5 py-1.5 rounded text-sm whitespace-nowrap transition-colors flex items-center gap-1 ${
                  moreOpen || MORE_ITEMS.some(i => isActive(i.to))
                    ? 'text-blue-400 bg-gray-700'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                More
                <svg className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 max-h-[70vh] overflow-y-auto">
                  {MORE_ITEMS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`block px-4 py-2 text-sm transition-colors ${
                        isActive(item.to) ? 'text-blue-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
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

        {/* Mobile menu - shows ALL items */}
        {menuOpen && (
          <div className="lg:hidden mt-3 pb-2 border-t border-gray-700 pt-3 grid grid-cols-2 gap-1">
            {ALL_ITEMS.map((item) => (
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
