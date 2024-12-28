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
        <div>
            <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Search for stocks..."
                style={{ width: '100%', padding: '0.5em', marginBottom: '0.5em' }}
            />
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc' }}>
                {suggestions.map((suggestion, index) => (
                    <li key={index} onClick={() => handleSuggestionClick(suggestion)} style={{ padding: '0.5em', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                        <strong>{suggestion.name}</strong> ({suggestion.symbol}) - ${suggestion.price}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default StockSearch;