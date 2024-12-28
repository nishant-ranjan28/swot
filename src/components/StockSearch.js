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

    const handleSuggestionClick = (stock) => {
        setInput(stock.name);
        setSuggestions([]);
        updateSwotWidget(stock.symbol);
        fetchStockPrice(stock.symbol, null, stock.name);
        updateStockChart(stock.symbol);
    };

    return (
        <div className="stock-search">
            <label htmlFor="stock-search-input">Select Indian Market Stock</label>
            <input
                type="text"
                id="stock-search-input"
                placeholder="Enter Stock Name"
                value={input}
                onChange={(e) => setInput(e.target.value)}
            />
            {suggestions.length > 0 && (
                <div className="suggestions">
                    {suggestions.map(stock => (
                        <div key={stock.symbol} className="suggestion-item" onClick={() => handleSuggestionClick(stock)}>
                            {stock.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default StockSearch;