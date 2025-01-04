import React, { useEffect, useState } from 'react';

const Forecast = ({ stockSymbol }) => {
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchForecast = async () => {
            try {
                const API_KEY = process.env.REACT_APP_MARKETSTACK_API_KEY;
                const formattedSymbol = `${stockSymbol}.XNSE`; // Adjust the symbol format for Indian stocks
                const response = await fetch(
                    `https://api.marketstack.com/v1/eod?access_key=${API_KEY}&symbols=${formattedSymbol}`
                );
                const data = await response.json();

                if (data.error) {
                    setError(data.error.message);
                } else {
                    setForecastData(data);
                }
            } catch (err) {
                console.error('Error fetching forecast data:', err);
                setError('Failed to fetch forecast data.');
            } finally {
                setLoading(false);
            }
        };

        fetchForecast();
    }, [stockSymbol]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>{error}</div>;

    return (
        <div>
            <h1>Forecast Data for {stockSymbol}</h1>
            <pre>{JSON.stringify(forecastData, null, 2)}</pre>
        </div>
    );
};

export default Forecast;