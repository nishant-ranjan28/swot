import React, { useState, useEffect, useRef } from 'react';

const StockSearch = ({
  updateSwotWidget,
  fetchStockPrice,
  updateStockChart,
  updateSelectedStock,
  className,
}) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (input.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    const fetchStocks = async () => {
      try {
        const response = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${input}&region=IN`
          )}`
        );
        const data = await response.json();
        const stocks = JSON.parse(data.contents).quotes || [];
        const uniqueStocks = new Set();

        const newSuggestions = stocks
          .filter((stock) => {
            const stockName = stock.shortname;
            const stockSymbol = stock.symbol;
            return (
              stockName &&
              !uniqueStocks.has(stockName) &&
              (stockSymbol.endsWith('.NS') || stockSymbol.endsWith('.BO'))
            );
          })
          .map((stock) => {
            uniqueStocks.add(stock.shortname);
            return {
              name: stock.shortname,
              symbol: stock.symbol,
            };
          });

        setSuggestions(newSuggestions);
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
    setInput(stock.symbol);
    setIsDropdownVisible(false);
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

  const handleInputChange = (e) => {
    setInput(e.target.value);
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
        />
        {input && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
          >
            x
          </button>
        )}

        {isDropdownVisible && suggestions.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded w-full max-h-64 overflow-auto mt-1">
            {suggestions.map((stock, idx) => (
              <li
                key={idx}
                className="p-2 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSuggestionClick(stock)}
              >
                {stock.name} ({stock.symbol})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StockSearch;