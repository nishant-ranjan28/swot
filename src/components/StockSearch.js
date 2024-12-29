import React, { useState, useEffect } from 'react';

const StockSearch = ({ updateSwotWidget, fetchStockPrice, updateStockChart, updateSelectedStock }) => {
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (input.length === 0) {
            setSuggestions([]);
            return;
        }

        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${input}&region=IN`)}`)
            .then(response => response.json())
            .then(data => {
                const stocks = JSON.parse(data.contents).quotes || [];
                const uniqueStocks = new Set();

                const newSuggestions = stocks.filter(stock => {
                    const stockName = stock.shortname;
                    const stockSymbol = stock.symbol;
                    return stockName && !uniqueStocks.has(stockName) && (stockSymbol.endsWith('.NS') || stockSymbol.endsWith('.BO'));
                }).map(stock => {
                    uniqueStocks.add(stock.shortname);
                    return { name: stock.shortname, symbol: stock.symbol, price: stock.regularMarketPrice };
                });

                setSuggestions(newSuggestions);
            })
            .catch(error => {
                console.error('Error fetching stock data:', error);
                setSuggestions([]);
            });
    }, [input]);

    const handleInputChange = (event) => {
        setInput(event.target.value);
    };

    const handleSuggestionClick = (suggestion) => {
        setInput(suggestion.name);
        updateSelectedStock(suggestion);
        updateSwotWidget(suggestion.symbol);
        fetchStockPrice(suggestion.symbol);
        updateStockChart(suggestion.symbol);
        setSuggestions([]);
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Search for stocks..."
                className="w-full p-3 mb-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
            />
            <ul className="absolute w-full bg-white border border-gray-300 rounded-lg max-h-48 overflow-y-auto z-10">
                {suggestions.map((suggestion, index) => (
                    <li key={index} onClick={() => handleSuggestionClick(suggestion)} className="p-2 cursor-pointer hover:bg-gray-100">
                        <strong>{suggestion.name}</strong> ({suggestion.symbol}) - ${suggestion.price}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default StockSearch;