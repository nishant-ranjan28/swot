import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const StockSearch = ({
  updateSwotWidget,
  fetchStockPrice,
  updateStockChart,
  updateSelectedStock,
  className,
}) => {
  const params = new URLSearchParams(window.location.search);
  const [input, setInput] = useState(params.get('search') || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const dropdownRef = useRef(null);
  const isSelecting = useRef(false); // Ref to track selection

  const handleInputChange = (e) => {
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

  useEffect(() => {
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

    const fetchStocks = async () => {
      try {
        const response = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${input}&region=IN`,
          )}`,
        );
        const data = await response.json();
        const stocks = JSON.parse(data.contents).quotes || [];

        // Limit the number of suggestions to 5 to optimize API calls
        const limitedStocks = stocks.slice(0, 5);

        // Fetch prices for each limited stock
        const stocksWithPrices = await Promise.all(
          limitedStocks.map(async (stock) => {
            if (
              stock.symbol &&
              (stock.symbol.endsWith('.NS') || stock.symbol.endsWith('.BO'))
            ) {
              try {
                const priceResponse = await fetch(
                  `https://api.allorigins.win/get?url=${encodeURIComponent(
                    `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?region=IN&lang=en-IN&interval=1d&range=1d`,
                  )}`,
                );
                const priceData = await priceResponse.json();
                const parsedPriceData = JSON.parse(priceData.contents);
                const price =
                  parsedPriceData.chart.result[0].meta.regularMarketPrice ||
                  'N/A';

                return {
                  name: stock.shortname,
                  symbol: stock.symbol,
                  price: price,
                };
              } catch (priceError) {
                console.error(
                  `Error fetching price for ${stock.symbol}:`,
                  priceError,
                );
                return {
                  name: stock.shortname,
                  symbol: stock.symbol,
                  price: 'N/A',
                };
              }
            } else {
              return null;
            }
          }),
        );

        // Filter out any null results
        const validStocks = stocksWithPrices.filter((stock) => stock !== null);

        setSuggestions(validStocks);
        setIsDropdownVisible(true);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    };

    fetchStocks();
  }, [input]);

  // Clears the search field
  const clearSearch = () => {
    setInput('');
    setSuggestions([]);
    setIsDropdownVisible(false);
  };

  // Invoke parent callbacks when a suggestion is selected
  const handleSuggestionClick = (stock) => {
    isSelecting.current = true; // Set selecting flag
    setInput(stock.symbol);
    setIsDropdownVisible(false); // Hide dropdown when a stock is selected
    if (updateSwotWidget) {
      updateSwotWidget(stock.symbol);
    }
    if (fetchStockPrice) {
      fetchStockPrice(stock.symbol, null, stock.name);
    }
    if (updateStockChart) {
      updateStockChart(stock.symbol);
    }
    if (updateSelectedStock) {
      updateSelectedStock(stock.symbol);
    }
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
        <input
          type="text"
          className="w-full border rounded p-2 pr-8"
          placeholder="Enter stock symbol..."
          value={input}
          onChange={handleInputChange}
          autoFocus={false}
          autoComplete="off"
        />
        {input && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
            aria-label="Clear search"
          >
            ×
          </button>
        )}

        {isDropdownVisible && suggestions.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded w-full max-h-64 overflow-auto mt-1">
            {suggestions.map((stock) => (
              <li
                key={stock.symbol}
                className="p-2 cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                onClick={() => {
                  handleSuggestionClick(stock);
                  pushToURL(stock.symbol);
                }}
              >
                <span>
                  {stock.name} ({stock.symbol})
                </span>
                <span className="text-green-600 font-semibold">
                  ₹{stock.price}
                </span>
              </li>
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
};

export default StockSearch;
