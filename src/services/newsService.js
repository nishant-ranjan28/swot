// News service to handle API calls with fallback options
class NewsService {
    constructor() {
        this.apiKeys = {
            newsapi: 'demo', // Replace with actual NewsAPI key
            gnews: process.env.REACT_APP_GNEWS_API_KEY_6
        };
    }

    // Sample news data as fallback
    getSampleNews() {
        const now = new Date();
        const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

        return {
            trending: [
                {
                    title: "Stock Market Reaches New Heights as Q2 Earnings Season Begins",
                    description: "Indian equity markets are showing strong momentum as major companies prepare to announce their second-quarter results. Banking and IT sectors are leading the rally with significant gains.",
                    url: "https://example.com/news/1",
                    publishedAt: now.toISOString(),
                    source: { name: "Business Today" },
                    image: "https://via.placeholder.com/400x200/4F46E5/ffffff?text=Market+Rally"
                },
                {
                    title: "RBI Policy Review: Interest Rates Expected to Remain Stable",
                    description: "The Reserve Bank of India is likely to maintain the current repo rate in its upcoming monetary policy review, focusing on inflation control and economic growth balance.",
                    url: "https://example.com/news/2",
                    publishedAt: anHourAgo.toISOString(),
                    source: { name: "Economic Times" },
                    image: "https://via.placeholder.com/400x200/059669/ffffff?text=RBI+Policy"
                },
                {
                    title: "Tech Sector Shows Resilience Amid Global Economic Uncertainty",
                    description: "Indian technology companies continue to demonstrate strong performance despite global headwinds, with several firms reporting robust order books and revenue growth.",
                    url: "https://example.com/news/3",
                    publishedAt: twoHoursAgo.toISOString(),
                    source: { name: "Tech News" },
                    image: "https://via.placeholder.com/400x200/DC2626/ffffff?text=Tech+Growth"
                }
            ],
            market: [
                {
                    title: "Gold Prices Hit Record High as Investors Seek Safe Haven",
                    description: "Gold prices have reached unprecedented levels as investors increasingly turn to precious metals amid global economic volatility and geopolitical tensions.",
                    url: "https://example.com/news/4",
                    publishedAt: now.toISOString(),
                    source: { name: "Commodity Watch" },
                    image: "https://via.placeholder.com/400x200/F59E0B/ffffff?text=Gold+Rally"
                },
                {
                    title: "Rupee Strengthens Against Dollar on FII Inflows",
                    description: "The Indian rupee has shown significant strength against the US dollar, supported by increased foreign institutional investor inflows and positive economic indicators.",
                    url: "https://example.com/news/5",
                    publishedAt: anHourAgo.toISOString(),
                    source: { name: "Currency News" },
                    image: "https://via.placeholder.com/400x200/8B5CF6/ffffff?text=Rupee+Strong"
                },
                {
                    title: "Oil Prices Fluctuate on Supply Concerns and Demand Outlook",
                    description: "Crude oil prices continue to show volatility as markets weigh supply disruption risks against concerns about global demand growth in the coming quarters.",
                    url: "https://example.com/news/6",
                    publishedAt: threeHoursAgo.toISOString(),
                    source: { name: "Energy Markets" },
                    image: "https://via.placeholder.com/400x200/EC4899/ffffff?text=Oil+Markets"
                }
            ]
        };
    }

    // Try to fetch from NewsAPI (CORS-friendly for development)
    async fetchFromNewsAPI() {
        try {
            const response = await fetch(
                `https://newsapi.org/v2/top-headlines?country=in&category=business&pageSize=20&apiKey=${this.apiKeys.newsapi}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.articles && data.articles.length > 0) {
                    const articles = data.articles.filter(article =>
                        article.title &&
                        article.description &&
                        article.title !== '[Removed]'
                    );

                    return {
                        trending: articles.slice(0, 6),
                        market: articles.slice(6, 12).length > 0 ? articles.slice(6, 12) : articles.slice(0, 6)
                    };
                }
            }
        } catch (error) {
            console.log('NewsAPI fetch failed:', error.message);
        }
        return null;
    }

    // Main method to get news with fallback
    async getNews() {
        try {
            // Try NewsAPI first
            const newsApiData = await this.fetchFromNewsAPI();
            if (newsApiData) {
                return newsApiData;
            }

            // Fallback to sample data
            console.log('Using sample news data due to API limitations');
            return this.getSampleNews();

        } catch (error) {
            console.error('Error in getNews:', error);
            // Return sample data as last resort
            return this.getSampleNews();
        }
    }
}

export default new NewsService();