const stockSearchInput = document.getElementById("stock-search-input");
const suggestionsBox = document.getElementById("suggestions");
const swotWidget = document.getElementById("swot-widget");
const swotStockName = document.getElementById("swot-stock-name");
const swotStockPrice = document.getElementById("swot-stock-price");
const stockChartContainer = document.getElementById("stock-chart");

document.addEventListener("DOMContentLoaded", () => {
	// Fetch and display TCS stock price by default
	fetchStockPrice("TCS.NS", null, "TCS");
	updateStockChart("TCS.NS");
});

stockSearchInput.addEventListener("input", () => {
	const input = stockSearchInput.value.trim();
	suggestionsBox.innerHTML = ""; // Clear previous suggestions

	if (input.length === 0) {
		suggestionsBox.style.display = "none"; // Hide suggestions if input is empty
		swotStockName.textContent = "TCS"; // Reset to default stock name
		swotStockPrice.textContent = ""; // Clear stock price
		stockChartContainer.innerHTML = ""; // Clear stock chart
		return;
	}

	// Use a CORS proxy to fetch stock data from Yahoo Finance API
	fetch(
		`https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${input}&region=IN`)}`,
	)
		.then((response) => response.json())
		.then((data) => {
			const stocks = JSON.parse(data.contents).quotes || []; // Extract the quotes array
			const uniqueStocks = new Set(); // To track unique stock names

			for (const stock of stocks) {
				const stockName = stock.shortname; // Access the stock short name
				const stockSymbol = stock.symbol; // Access the stock symbol

				// Filter for Indian stocks (NSE or BSE)
				if (
					stockName &&
					!uniqueStocks.has(stockName) &&
					(stockSymbol.endsWith(".NS") || stockSymbol.endsWith(".BO"))
				) {
					uniqueStocks.add(stockName);
					const div = document.createElement("div");
					div.className = "suggestion-item";
					fetchStockPrice(stockSymbol, div, stockName);
					div.onclick = () => {
						stockSearchInput.value = stockName;
						suggestionsBox.style.display = "none";
						updateSwotWidget(stockSymbol);
						fetchStockPrice(stockSymbol, null, stockName);
						updateStockChart(stockSymbol);
					};
					suggestionsBox.appendChild(div);
				}
			}

			suggestionsBox.style.display = uniqueStocks.size > 0 ? "block" : "none";
		})
		.catch((error) => {
			console.error("Error fetching stock data:", error);
			suggestionsBox.style.display = "none";
		});
});

document.addEventListener("click", (e) => {
	if (!e.target.closest(".stock-search")) {
		suggestionsBox.style.display = "none"; // Hide suggestions when clicking outside
	}
});

function updateSwotWidget(stock) {
	// Encode the stock name for URL
	const encodedStock = encodeURIComponent(stock).split(".")[0];
	// Update the src of the SWOT widget
	swotWidget.src = `https://trendlyne.com/web-widget/swot-widget/Poppins/${encodedStock}/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E`;
}

function fetchStockPrice(stockSymbol, div = null, stockName = null) {
	// Use a CORS proxy to fetch stock price data from Yahoo Finance API
	fetch(
		`https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${stockSymbol}?region=IN&lang=en-IN&interval=1d&range=1d`)}`,
	)
		.then((response) => response.json())
		.then((data) => {
			const stockData = JSON.parse(data.contents);
			const price = stockData.chart.result[0].meta.regularMarketPrice;
			if (div && stockName) {
				div.textContent = `${stockName} - ₹${price}`;
			} else {
				swotStockName.textContent = stockName;
				swotStockPrice.textContent = `₹${price}`;
			}
		})
		.catch((error) => {
			console.error("Error fetching stock price:", error);
			if (div && stockName) {
				div.textContent = `${stockName} - Price not available`;
			} else {
				swotStockPrice.textContent = "Price not available";
			}
		});
}

function updateStockChart(stockSymbol) {
	// Clean up existing chart
	stockChartContainer.innerHTML = "";

	// Create new container
	const container = document.createElement("div");
	container.id = "tradingview_chart";
	container.style.height = "500px";
	stockChartContainer.appendChild(container);

	// Clean symbol (remove .NS or .BO)
	const cleanSymbol = stockSymbol.split(".")[0];

	try {
		new TradingView.widget({
			autosize: true,
			symbol: cleanSymbol,
			interval: "D",
			timezone: "Asia/Kolkata",
			theme: "Light",
			style: "1",
			locale: "in",
			toolbar_bg: "#f1f3f6",
			enable_publishing: false,
			allow_symbol_change: true,
			save_image: false,
			container_id: "tradingview_chart",
			hide_top_toolbar: false,
			hide_side_toolbar: false,
			withdateranges: true,
			details: true,
			hotlist: true,
			calendar: true,
			width: "100%",
			height: "100%",
		});
	} catch (error) {
		console.error("TradingView widget error:", error);
		stockChartContainer.innerHTML =
			"<p>Chart temporarily unavailable. Please try again later.</p>";
	}
}
