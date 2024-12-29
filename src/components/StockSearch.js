import React, { useState, useEffect } from 'react';

const StockSearch = ({ updateSwotWidget, fetchStockPrice, updateStockChart, updateSelectedStock }) => {
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (input.trim().length === 0) {
            setSuggestions([]);
            return;
        }

        const fetchStocks = async () => {
            try {
                const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${input}&region=IN`)}`);
                const data = await response.json();
                const stocks = JSON.parse(data.contents).quotes || [];
                const uniqueStocks = new Set();

                const newSuggestions = stocks
                    .filter(stock => {
                        const stockName = stock.shortname;
                        const stockSymbol = stock.symbol;
                        return stockName && !uniqueStocks.has(stockName) && (stockSymbol.endsWith('.NS') || stockSymbol.endsWith('.BO'));
                    })
                    .map(stock => {
                        uniqueStocks.add(stock.shortname);
                        return {
                            name: stock.shortname,
                            symbol: stock.symbol,
                            price: stock.price ?? 'N/A' // Updated to use 'price' instead of 'regularMarketPrice'
                        };
                    });

                setSuggestions(newSuggestions);
            } catch (error) {
                console.error('Error fetching stock data:', error);
                setSuggestions([]);
            }
        };

        fetchStocks();
    }, [input]);

    const handleInputChange = (event) => {
        setInput(event.target.value);
    };

    const handleSuggestionClick = (suggestion) => {
        setInput(suggestion.name);
        updateSelectedStock && updateSelectedStock(suggestion);
        updateSwotWidget(suggestion.symbol);
        fetchStockPrice(suggestion.symbol, null, suggestion.name);
        updateStockChart(suggestion.symbol);
        setSuggestions([]);
    };

    // Function to format the price with commas and two decimal places
    const formatPrice = (price) => {
        if (price === 'N/A') return price;
        return price.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Search for stocks..."
                className="w-full p-3 border-2 border-gray-300 rounded-lg shadow focus:border-blue-500 outline-none transition duration-200"
            />
            {suggestions.length > 0 && (
                <ul className="absolute w-full bg-white border border-gray-300 rounded-lg max-h-60 overflow-y-auto mt-2 z-20">
                    {suggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="p-3 cursor-pointer hover:bg-gray-100 transition flex justify-between items-center"
                        >
                            <div>
                                <strong>{suggestion.name}</strong> ({suggestion.symbol})
                            </div>
                            <div className={`ml-4 text-sm ${suggestion.price === 'N/A' ? 'text-red-500' : 'text-green-600'}`}>
                                {formatPrice(suggestion.price)}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default StockSearch;