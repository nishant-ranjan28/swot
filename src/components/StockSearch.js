import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import api from '../api';
import { useMarket } from '../context/MarketContext';

const StockSearch = ({
  updateSwotWidget,
  fetchStockPrice,
  updateStockChart,
  updateSelectedStock,
  className,
  onSelect,
}) => {
  const navigate = useNavigate();
  const { market, currency } = useMarket();
  const params = new URLSearchParams(window.location.search);
  const [input, setInput] = useState(params.get('search') || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const dropdownRef = useRef(null);
  const isSelecting = useRef(false); // Ref to track selection
  const isFirstLoad = useRef(true); // Track if the component is mounting for the first time
  const debounceTimeout = useRef();
  // Track if the user has typed after initial load
  const [userTyped, setUserTyped] = useState(false);

  const handleInputChange = (e) => {
    setUserTyped(true);
    const newQuery = e.target.value;
    setInput(newQuery);
    pushToURL(newQuery);
  };

  const pushToURL = (val) => {
    const params = new URLSearchParams(window.location.search);
    if (val) {
      params.set('search', val); // Set the search query
    } else {
      params.delete('search'); // Remove the search query if it's empty
    }
    window.history.pushState(null, '', `?${params.toString()}`);
  };

  // Only show dropdown if user has typed after initial load
  useEffect(() => {
    // Use window.location.search directly to avoid 'params' as a dependency
    if (!userTyped) {
      setIsDropdownVisible(false);
      return;
    }
    setIsDropdownVisible(suggestions.length > 0);
  }, [userTyped, suggestions.length]); // removed 'input' from deps, not needed

  useEffect(() => {
    if (isFirstLoad.current) {
      setIsDropdownVisible(false);
      setSuggestions([]);
      isFirstLoad.current = false;
    }
  }, []);

  // Prevent showing dropdown if input is pre-filled from URL and user hasn't typed
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (!userTyped && urlParams.get('search') && input === urlParams.get('search')) {
      setIsDropdownVisible(false);
      setSuggestions([]);
    }
  }, [input, userTyped]);

  useEffect(() => {
    if (isFirstLoad.current) return;
    const urlSearch = new URLSearchParams(window.location.search).get('search');
    if (!userTyped && urlSearch && input === urlSearch) {
      setIsDropdownVisible(false);
      setSuggestions([]);
      return;
    }
    if (input.trim().length === 0) {
      setSuggestions([]);
      setIsDropdownVisible(false);
      return;
    }

    // If the input change was due to selection, don't fetch suggestions
    if (isSelecting.current) {
      isSelecting.current = false;
      return;
    }

    // Debounce logic
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      fetchStocks();
    }, 500);

    async function fetchStocks() {
      try {
        const response = await api.get(`/api/stocks/search?q=${encodeURIComponent(input)}&market=${market}`);
        const stocks = response.data.results || [];
        const limitedStocks = stocks.slice(0, 5);

        const stocksWithPrices = await Promise.all(
          limitedStocks.map(async (stock) => {
            try {
              const priceResponse = await api.get(`/api/stocks/${stock.symbol}/quote`);
              return {
                name: stock.name,
                symbol: stock.symbol,
                price: priceResponse.data.price || 'N/A',
              };
            } catch {
              return { name: stock.name, symbol: stock.symbol, price: 'N/A' };
            }
          })
        );

        setSuggestions(stocksWithPrices);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    }

    // Cleanup
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [input, userTyped, market]);

  // Clears the search field
  const clearSearch = () => {
    setInput('');
    setSuggestions([]);
    setIsDropdownVisible(false);
  };

  // Invoke parent callbacks when a suggestion is selected
  const handleSuggestionClick = (stock) => {
    isSelecting.current = true;
    setInput(stock.symbol);
    setIsDropdownVisible(false);

    // Navigation mode (detail page) - if onSelect provided, use it
    if (onSelect) {
      onSelect(stock);
      return;
    }

    // Dashboard mode - update widgets AND navigate to detail page
    try {
      if (updateSwotWidget) updateSwotWidget(stock.symbol);
      if (fetchStockPrice) fetchStockPrice(stock.symbol, null, stock.name);
      if (updateSelectedStock) updateSelectedStock(stock.symbol);
      if (updateStockChart) setTimeout(() => updateStockChart(stock.symbol), 300);
    } catch (error) {
      console.error('Error updating widgets:', error);
    }

    // Navigate to stock detail page
    navigate(`/stock/${stock.symbol}`);
  };

  // Close dropdown if user clicks outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={className}>
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-3 pr-10 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder={market === 'us' ? 'Search for stocks (e.g., Apple, MSFT, GOOGL)...' : 'Search for stocks (e.g., Reliance, TCS, HDFC)...'}
            value={input}
            onChange={handleInputChange}
            autoFocus={false}
            autoComplete="off"
          />
          {input && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {isDropdownVisible && suggestions.length > 0 && (
          <ul className="absolute z-50 bg-white border border-gray-200 rounded-lg w-full max-h-64 overflow-auto mt-2 shadow-lg">
            {suggestions.map((stock) => (
              <button
                key={stock.symbol}
                className="p-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center w-full text-left border-b border-gray-100 last:border-b-0 transition-colors"
                onClick={() => {
                  handleSuggestionClick(stock);
                  pushToURL(stock.symbol);
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="font-medium text-gray-900">{stock.name}</span>
                  <span className="text-sm text-gray-500">({stock.symbol})</span>
                </div>
                <span className="text-green-600 font-semibold whitespace-nowrap ml-2">
                  {currency}{stock.price}
                </span>
              </button>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
StockSearch.propTypes = {
  updateSwotWidget: PropTypes.func,
  fetchStockPrice: PropTypes.func,
  updateStockChart: PropTypes.func,
  updateSelectedStock: PropTypes.func,
  className: PropTypes.string,
  onSelect: PropTypes.func,
};

export default StockSearch;
