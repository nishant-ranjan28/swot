const stockSearchInput = document.getElementById("stock-search-input");
const suggestionsBox = document.getElementById("suggestions");
const swotWidget = document.getElementById("swot-widget");

stockSearchInput.addEventListener("input", () => {
	const input = stockSearchInput.value.trim();
	suggestionsBox.innerHTML = ""; // Clear previous suggestions

	if (input.length === 0) {
		suggestionsBox.style.display = "none"; // Hide suggestions if input is empty
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
					div.textContent = stockName;
					div.className = "suggestion-item";
					div.onclick = () => {
						stockSearchInput.value = stockName;
						suggestionsBox.style.display = "none";
						updateSwotWidget(stockSymbol);
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
