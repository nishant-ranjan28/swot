import React, { useEffect, useState } from 'react';

const Forecast = ({ stockSymbol }) => {
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchForecast = async () => {
            try {
                const API_KEY = 'csh379pr01qu99bfpuq0csh379pr01qu99bfpuqg'; // Replace with your actual API key
                const response = await fetch(
                    `https://finnhub.io/api/v1/quote?symbol=${stockSymbol}&token=${API_KEY}`
                );
                const data = await response.json();

                if (data) {
                    setForecastData(data);
                } else {
                    setError('No forecast data available.');
                }
            } catch (err) {
                console.error('Error fetching forecast data:', err);
                setError('Failed to fetch forecast data.');
            } finally {
                setLoading(false);
            }
        };

        if (stockSymbol) {
            fetchForecast();
        }
    }, [stockSymbol]);

    if (loading) return <div>Loading forecast data...</div>;
    if (error) return <div>{error}</div>;

    return (
        <div className="forecast">
            <h2>Forecast for {stockSymbol}</h2>
            {forecastData && (
                <div>
                    <p>Current Price: ₹{forecastData.c}</p>
                    <p>High Price of the Day: ₹{forecastData.h}</p>
                    <p>Low Price of the Day: ₹{forecastData.l}</p>
                    <p>Previous Close: ₹{forecastData.pc}</p>
                </div>
            )}
        </div>
    );
};

export default Forecast;