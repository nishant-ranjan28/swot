import React, { useState, useEffect } from 'react';

const StockSearch = ({ updateSwotWidget, fetchStockPrice, updateStockChart }) => {
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
                    return { name: stock.shortname, symbol: stock.symbol };
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
        updateSwotWidget(suggestion.symbol);
        fetchStockPrice(suggestion.symbol);
        updateStockChart(suggestion.symbol);
        setSuggestions([]);
    };

    return (
        <div>
            <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Search for stocks..."
            />
            <ul>
                {suggestions.map((suggestion, index) => (
                    <li key={index} onClick={() => handleSuggestionClick(suggestion)}>
                        {suggestion.name} ({suggestion.symbol})
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default StockSearch;