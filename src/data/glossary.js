export const GLOSSARY = [
  // Fundamental
  { term: "P/E Ratio", category: "Fundamental", short: "Price to Earnings ratio", detail: "Measures stock price relative to annual earnings per share. A P/E of 20 means investors pay \u20b920 for every \u20b91 of earnings. Lower P/E may indicate undervaluation, but compare within the same sector." },
  { term: "EPS", category: "Fundamental", short: "Earnings Per Share", detail: "Net profit divided by total shares. Higher EPS = more profitable per share. Compare YoY growth and vs sector peers." },
  { term: "ROE", category: "Fundamental", short: "Return on Equity (%)", detail: "Net income / shareholder equity. Measures how efficiently a company uses shareholder money. Above 15% is generally good." },
  { term: "ROA", category: "Fundamental", short: "Return on Assets (%)", detail: "Net income / total assets. Indicates how efficiently a company uses its assets to generate profit. Higher is better; compare within the same industry." },
  { term: "ROCE", category: "Fundamental", short: "Return on Capital Employed (%)", detail: "EBIT / capital employed. Measures profitability relative to total capital used. Useful for comparing capital-intensive companies." },
  { term: "Market Cap", category: "Fundamental", short: "Total market value of a company", detail: "Calculated as share price \u00d7 total shares outstanding. Large Cap > \u20b920,000 Cr, Mid Cap \u20b95,000-20,000 Cr, Small Cap < \u20b95,000 Cr in India." },
  { term: "Dividend Yield", category: "Fundamental", short: "Annual dividend as % of stock price", detail: "Dividend per share / stock price \u00d7 100. A 3% yield means \u20b93 dividend per \u20b9100 invested. Compare with bank FD rates." },
  { term: "Book Value", category: "Fundamental", short: "Net asset value per share", detail: "Total assets minus total liabilities divided by shares outstanding. P/B ratio below 1 may suggest undervaluation." },
  { term: "Debt/Equity Ratio", category: "Fundamental", short: "Total debt relative to shareholder equity", detail: "High D/E means more leverage and higher risk. Below 1 is generally considered healthy for most sectors. Capital-intensive sectors may have higher ratios." },
  { term: "Current Ratio", category: "Fundamental", short: "Current assets / current liabilities", detail: "Measures short-term liquidity. Above 1.5 is healthy. Below 1 means the company may struggle to pay short-term obligations." },
  { term: "Free Cash Flow", category: "Fundamental", short: "Cash left after capital expenditure", detail: "Operating cash flow minus capex. Positive FCF means the company generates surplus cash for dividends, buybacks, or debt reduction." },
  { term: "Price-to-Book (P/B)", category: "Fundamental", short: "Share price / book value per share", detail: "P/B below 1 suggests stock may be undervalued relative to its assets. Banks and financial companies are often valued using P/B." },
  { term: "PEG Ratio", category: "Fundamental", short: "P/E divided by earnings growth rate", detail: "A PEG of 1 means fair value. Below 1 may be undervalued considering growth. Useful for comparing growth stocks." },
  { term: "Enterprise Value (EV)", category: "Fundamental", short: "Market cap + debt - cash", detail: "Represents the total takeover price of a company. EV/EBITDA is a popular valuation metric, especially for comparing companies with different capital structures." },
  { term: "Operating Margin", category: "Fundamental", short: "Operating income as % of revenue", detail: "Measures operational efficiency before interest and taxes. Higher margins indicate better cost control. Compare within the same industry." },
  { term: "Revenue Growth", category: "Fundamental", short: "Year-over-year increase in sales", detail: "Indicates how fast a company is growing its top line. Consistent double-digit growth is a positive signal for growth investors." },

  // Technical
  { term: "RSI", category: "Technical", short: "Relative Strength Index (0-100)", detail: "Momentum oscillator. RSI above 70 suggests overbought (may fall), below 30 suggests oversold (may rise). Used for timing entries/exits." },
  { term: "MACD", category: "Technical", short: "Moving Average Convergence Divergence", detail: "Shows relationship between two moving averages. Bullish when MACD line crosses above signal line. Histogram shows momentum strength." },
  { term: "Bollinger Bands", category: "Technical", short: "Volatility bands around moving average", detail: "Upper and lower bands are 2 standard deviations from 20-day SMA. Price near upper band = potentially overbought, near lower = oversold." },
  { term: "Support Level", category: "Technical", short: "Price floor where buying increases", detail: "A price level where demand is strong enough to prevent further decline. Traders often buy near support." },
  { term: "Resistance Level", category: "Technical", short: "Price ceiling where selling increases", detail: "A price level where supply is strong enough to prevent further rise. Traders often sell near resistance." },
  { term: "Golden Cross", category: "Technical", short: "50-day MA crosses above 200-day MA", detail: "Bullish signal indicating potential long-term uptrend. Opposite is Death Cross (bearish)." },
  { term: "Death Cross", category: "Technical", short: "50-day MA crosses below 200-day MA", detail: "Bearish signal indicating potential long-term downtrend. Opposite of the Golden Cross. Often triggers institutional selling." },
  { term: "Moving Average (SMA)", category: "Technical", short: "Average closing price over N days", detail: "50-day and 200-day SMAs are most common. Price above SMA is bullish. Used to identify trend direction and dynamic support/resistance." },
  { term: "EMA", category: "Technical", short: "Exponential Moving Average", detail: "Similar to SMA but gives more weight to recent prices. 12-day and 26-day EMAs are used in MACD calculation. More responsive to recent price changes." },
  { term: "Volume", category: "Technical", short: "Number of shares traded", detail: "High volume confirms price moves. Rising price with rising volume is bullish. Rising price with falling volume is suspicious." },
  { term: "Fibonacci Retracement", category: "Technical", short: "Key price levels based on Fibonacci ratios", detail: "Common levels: 23.6%, 38.2%, 50%, 61.8%. Used to predict potential support/resistance levels during pullbacks in a trend." },
  { term: "Delivery %", category: "Technical", short: "Percentage of shares actually delivered", detail: "High delivery % (above 50%) suggests genuine buying interest. Low delivery % means mostly intraday speculation. Available for Indian stocks on NSE/BSE." },
  { term: "ADX", category: "Technical", short: "Average Directional Index", detail: "Measures trend strength (not direction). ADX above 25 = strong trend. Below 20 = weak trend or sideways market. Used with +DI/-DI for direction." },
  { term: "Stochastic Oscillator", category: "Technical", short: "Momentum indicator (0-100)", detail: "Compares closing price to price range over a period. Above 80 = overbought, below 20 = oversold. Often used with RSI for confirmation." },

  // Options
  { term: "Put-Call Ratio", category: "Options", short: "Volume of puts vs calls", detail: "PCR > 1 = more puts (bearish sentiment). PCR < 0.7 = more calls (bullish). Used as contrarian indicator." },
  { term: "Open Interest", category: "Options", short: "Total outstanding option contracts", detail: "Rising OI with rising price = new money entering (bullish). Rising OI with falling price = bearish. Falling OI = positions closing." },
  { term: "Implied Volatility (IV)", category: "Options", short: "Market's forecast of stock volatility", detail: "Higher IV = more expensive options. IV crush happens after events like earnings. Compare with historical volatility for edge." },
  { term: "Theta Decay", category: "Options", short: "Time value erosion of options", detail: "Options lose value as expiry approaches. Theta accelerates in the last 30 days. Option sellers benefit from theta; buyers are hurt by it." },
  { term: "Strike Price", category: "Options", short: "Price at which option can be exercised", detail: "For calls, strike below market price = in-the-money (ITM). For puts, strike above market = ITM. ATM = at the money." },

  // Risk
  { term: "Beta", category: "Risk", short: "Stock volatility vs market", detail: "Beta of 1 = moves with market. Beta > 1 = more volatile. Beta < 1 = less volatile. Used to assess risk." },
  { term: "Sharpe Ratio", category: "Risk", short: "Risk-adjusted return metric", detail: "Excess return per unit of risk. Above 1 is acceptable, above 2 is very good, above 3 is excellent. Compares return vs risk-free rate." },
  { term: "VaR (Value at Risk)", category: "Risk", short: "Maximum expected loss at a confidence level", detail: "E.g., 1-day 95% VaR of 2% means there's only a 5% chance of losing more than 2% in a day. Used by institutions for risk management." },
  { term: "Max Drawdown", category: "Risk", short: "Largest peak-to-trough decline", detail: "Measures worst-case decline from a portfolio's peak. A 30% max drawdown means the portfolio fell 30% from its highest point before recovering." },
  { term: "Standard Deviation", category: "Risk", short: "Measure of price volatility", detail: "Higher standard deviation means more price swings. Used to calculate Bollinger Bands and assess overall risk of an investment." },

  // Mutual Funds
  { term: "NAV", category: "Mutual Funds", short: "Net Asset Value", detail: "Per-unit price of a mutual fund. Calculated daily as (total assets - liabilities) / total units. Used to buy/sell MF units." },
  { term: "Expense Ratio", category: "Mutual Funds", short: "Annual fee charged by the fund", detail: "Expressed as % of AUM. Lower is better. Direct plans have lower expense ratios than regular plans. Index funds typically have the lowest." },
  { term: "AUM", category: "Mutual Funds", short: "Assets Under Management", detail: "Total market value of investments managed by the fund. Larger AUM generally means more investor trust but may limit flexibility for small-cap funds." },

  // Investing
  { term: "SIP", category: "Investing", short: "Systematic Investment Plan", detail: "Investing a fixed amount at regular intervals (monthly). Rupee cost averaging reduces impact of volatility over time." },
  { term: "IPO", category: "Investing", short: "Initial Public Offering", detail: "When a private company first sells shares to the public. GMP (Grey Market Premium) indicates unofficial demand before listing." },
  { term: "GMP", category: "Investing", short: "Grey Market Premium", detail: "Unofficial premium at which IPO shares trade before listing. Positive GMP suggests expected listing gains. Not regulated by SEBI." },
  { term: "FII/DII", category: "Investing", short: "Foreign / Domestic Institutional Investors", detail: "FII buying is bullish for markets. DII buying provides stability during FII selling. Their daily activity data is tracked on NSE/BSE." },
  { term: "Insider Trading", category: "Investing", short: "Buying/selling by company insiders", detail: "Legal when disclosed (SAST regulations). Promoter buying is a bullish signal. Promoter selling or pledge increase is a red flag." },

  // Taxation
  { term: "STCG", category: "Taxation", short: "Short-Term Capital Gains", detail: "Tax on profits from selling equity held < 1 year. Taxed at 15% in India. Applies to stocks and equity mutual funds." },
  { term: "LTCG", category: "Taxation", short: "Long-Term Capital Gains", detail: "Tax on profits from selling equity held > 1 year. Taxed at 10% above \u20b91 lakh exemption in India." },
  { term: "STT", category: "Taxation", short: "Securities Transaction Tax", detail: "Tax levied on purchase/sale of securities on Indian exchanges. Deducted at source by the broker. Different rates for equity, F&O, and mutual funds." },

  // Market
  { term: "VIX", category: "Market", short: "Volatility Index (Fear Gauge)", detail: "Measures expected market volatility. High VIX (>25) = fear/uncertainty. Low VIX (<15) = complacency. India VIX tracks NIFTY options." },
  { term: "Circuit Breaker", category: "Market", short: "Trading halt at price limits", detail: "Individual stocks have upper/lower circuit limits (5%, 10%, 20%). Index-wide circuit breakers halt all trading at 10%, 15%, 20% drops." },
  { term: "Market Breadth", category: "Market", short: "Advances vs declines in the market", detail: "More advancing stocks than declining = healthy market. Narrow breadth (few stocks driving index) is a warning sign." },

  // Returns
  { term: "CAGR", category: "Returns", short: "Compound Annual Growth Rate", detail: "Annualized return over a period. More meaningful than absolute return for comparing investments across different time periods." },
  { term: "XIRR", category: "Returns", short: "Extended Internal Rate of Return", detail: "Calculates annualized return for irregular cash flows (like SIPs). More accurate than CAGR for investments with multiple transactions at different dates." },
  { term: "Absolute Return", category: "Returns", short: "Total percentage gain/loss", detail: "Simple (current value - invested) / invested \u00d7 100. Does not account for time. A 50% return in 1 year is very different from 50% in 10 years." },
];

export const CATEGORIES = ["All", "Fundamental", "Technical", "Options", "Risk", "Mutual Funds", "Investing", "Taxation", "Market", "Returns"];
