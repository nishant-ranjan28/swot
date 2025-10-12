// News service to handle API calls with fallback options
class NewsService {
    constructor() {
        const newsApiKey = process.env.REACT_APP_NEWSAPI_KEY;
        if (!newsApiKey) {
            console.warn('REACT_APP_NEWSAPI_KEY environment variable is not set. Falling back to "demo" key (limited functionality).');
        }
        this.apiKeys = {
            newsapi: newsApiKey || 'demo' // Use env var or fallback to 'demo'
        };
    }

    // Try to fetch from NewsAPI (CORS-friendly for development)
    async fetchFromNewsAPI() {
        try {
            // Fetch both business and technology for trending, and everything with keywords for market
            const [businessResponse, technologyResponse] = await Promise.all([
                fetch(`https://newsapi.org/v2/top-headlines?country=in&category=business&pageSize=10&apiKey=${this.apiKeys.newsapi}`),
                fetch(`https://newsapi.org/v2/everything?q=stock%20market%20OR%20cryptocurrency%20OR%20forex%20OR%20trading&language=en&sortBy=publishedAt&pageSize=10&apiKey=${this.apiKeys.newsapi}`)
            ]);

            const trendingArticles = [];
            const marketArticles = [];

            // Process business news for trending
            if (businessResponse.ok) {
                const businessData = await businessResponse.json();
                if (businessData.articles && businessData.articles.length > 0) {
                    const articles = businessData.articles
                        .filter(article =>
                            article.title &&
                            article.description &&
                            article.title !== '[Removed]' &&
                            article.description !== '[Removed]'
                        )
                        .map(article => ({
                            ...article,
                            source: { name: article.source.name + ' (NewsAPI)' }
                        }));
                    trendingArticles.push(...articles);
                }
            }

            // Process market/trading news for market updates
            if (technologyResponse.ok) {
                const marketData = await technologyResponse.json();
                if (marketData.articles && marketData.articles.length > 0) {
                    const articles = marketData.articles
                        .filter(article =>
                            article.title &&
                            article.description &&
                            article.title !== '[Removed]' &&
                            article.description !== '[Removed]'
                        )
                        .map(article => ({
                            ...article,
                            source: { name: article.source.name + ' (NewsAPI Markets)' }
                        }));
                    marketArticles.push(...articles);
                }
            }

            if (trendingArticles.length > 0 || marketArticles.length > 0) {
                return {
                    trending: trendingArticles.slice(0, 6),
                    market: marketArticles.slice(0, 6)
                };
            }
        } catch (error) {
            console.log('NewsAPI fetch failed:', error.message);
        }
        return null;
    }

    // Alternative API: Try Guardian API (free, no API key needed for basic use)
    async fetchFromGuardianAPI() {
        try {
            // Fetch different categories for trending vs market news
            const [businessResponse, economicsResponse] = await Promise.all([
                fetch('https://content.guardianapis.com/search?section=business&page-size=6&show-fields=thumbnail,trailText&api-key=test'),
                fetch('https://content.guardianapis.com/search?tag=business/economics&page-size=6&show-fields=thumbnail,trailText&api-key=test')
            ]);

            const trendingArticles = [];
            const marketArticles = [];

            // Process business news for trending
            if (businessResponse.ok) {
                const businessData = await businessResponse.json();
                if (businessData.response && businessData.response.results) {
                    const articles = businessData.response.results.map(article => ({
                        title: article.webTitle,
                        description: article.fields?.trailText || 'Read more about this business story...',
                        url: article.webUrl,
                        publishedAt: article.webPublicationDate,
                        source: { name: 'The Guardian Business' },
                        image: article.fields?.thumbnail || `https://via.placeholder.com/400x200/FF6B35/ffffff?text=Guardian+Business`
                    }));
                    trendingArticles.push(...articles);
                }
            }

            // Process economics news for market
            if (economicsResponse.ok) {
                const economicsData = await economicsResponse.json();
                if (economicsData.response && economicsData.response.results) {
                    const articles = economicsData.response.results.map(article => ({
                        title: article.webTitle,
                        description: article.fields?.trailText || 'Read more about this market story...',
                        url: article.webUrl,
                        publishedAt: article.webPublicationDate,
                        source: { name: 'The Guardian Economics' },
                        image: article.fields?.thumbnail || `https://via.placeholder.com/400x200/0F766E/ffffff?text=Guardian+Economics`
                    }));
                    marketArticles.push(...articles);
                }
            }

            if (trendingArticles.length > 0 || marketArticles.length > 0) {
                return {
                    trending: trendingArticles.slice(0, 6),
                    market: marketArticles.slice(0, 6)
                };
            }
        } catch (error) {
            console.log('Guardian API fetch failed:', error.message);
        }
        return null;
    }

    // Try to fetch from multiple RSS feeds for diversity
    async fetchFromRSSFeed() {
        try {
            // Fetch from different RSS sources for trending vs market news
            const [bbcResponse, reutersResponse] = await Promise.all([
                fetch('https://rss2json.com/api.json?rss_url=http://feeds.bbci.co.uk/news/business/rss.xml&count=6'),
                fetch('https://rss2json.com/api.json?rss_url=https://feeds.reuters.com/reuters/businessNews&count=6')
            ]);

            const trendingArticles = [];
            const marketArticles = [];

            // Process BBC Business for trending
            if (bbcResponse.ok) {
                const bbcData = await bbcResponse.json();
                if (bbcData.items && bbcData.items.length > 0) {
                    const articles = bbcData.items.map(item => ({
                        title: item.title,
                        description: item.description?.replace(/<[^>]*>/g, '').substring(0, 150) + '...' || 'Read more about this business story...',
                        url: item.link,
                        publishedAt: item.pubDate,
                        source: { name: 'BBC Business' },
                        image: item.thumbnail || `https://via.placeholder.com/400x200/B91C1C/ffffff?text=BBC+Business`
                    }));
                    trendingArticles.push(...articles);
                }
            }

            // Process Reuters for market news
            if (reutersResponse.ok) {
                const reutersData = await reutersResponse.json();
                if (reutersData.items && reutersData.items.length > 0) {
                    const articles = reutersData.items.map(item => ({
                        title: item.title,
                        description: item.description?.replace(/<[^>]*>/g, '').substring(0, 150) + '...' || 'Read more about this market story...',
                        url: item.link,
                        publishedAt: item.pubDate,
                        source: { name: 'Reuters Business' },
                        image: item.thumbnail || `https://via.placeholder.com/400x200/F97316/ffffff?text=Reuters+Markets`
                    }));
                    marketArticles.push(...articles);
                }
            }

            if (trendingArticles.length > 0 || marketArticles.length > 0) {
                return {
                    trending: trendingArticles.slice(0, 6),
                    market: marketArticles.slice(0, 6)
                };
            }
        } catch (error) {
            console.log('RSS feed fetch failed:', error.message);
        }
        return null;
    }

    /**
     * Fetches news data from multiple API sources and combines them
     * 
     * @returns {Promise<{trending: Article[], market: Article[]}>} News data object containing:
     *   - trending: Array of trending business news articles from multiple sources
     *   - market: Array of market/financial news articles from multiple sources
     * 
     * @typedef {Object} Article
     * @property {string} title - Article headline
     * @property {string} description - Article summary/description
     * @property {string} url - Link to full article
     * @property {string} publishedAt - ISO date string of publication
     * @property {Object} source - Source information
     * @property {string} source.name - Name of the news source
     * @property {string} [image] - Optional article image URL
     * 
     * @note Fetches from all available sources and combines them for diversity
     */
    async getNews() {
        console.log('🔄 Fetching news from multiple APIs simultaneously...');

        // Fetch from all sources in parallel
        const [newsApiData, guardianData, rssData] = await Promise.allSettled([
            this.fetchFromNewsAPI(),
            this.fetchFromGuardianAPI(),
            this.fetchFromRSSFeed()
        ]);

        const allTrendingNews = [];
        const allMarketNews = [];
        let successfulSources = [];

        // Process NewsAPI results
        if (newsApiData.status === 'fulfilled' && newsApiData.value) {
            console.log('✅ NewsAPI data received');
            allTrendingNews.push(...newsApiData.value.trending.slice(0, 2)); // Take 2 articles
            allMarketNews.push(...newsApiData.value.market.slice(0, 2)); // Take 2 articles
            successfulSources.push('NewsAPI');
        }

        // Process Guardian API results
        if (guardianData.status === 'fulfilled' && guardianData.value) {
            console.log('✅ Guardian API data received');
            allTrendingNews.push(...guardianData.value.trending.slice(0, 2)); // Take 2 articles
            allMarketNews.push(...guardianData.value.market.slice(0, 2)); // Take 2 articles
            successfulSources.push('Guardian');
        }

        // Process RSS Feed results
        if (rssData.status === 'fulfilled' && rssData.value) {
            console.log('✅ RSS Feed data received');
            allTrendingNews.push(...rssData.value.trending.slice(0, 2)); // Take 2 articles
            allMarketNews.push(...rssData.value.market.slice(0, 2)); // Take 2 articles
            successfulSources.push('RSS/BBC');
        }

        // Check if we have any data
        if (allTrendingNews.length === 0 && allMarketNews.length === 0) {
            console.error('❌ All API sources failed to provide news data');
            throw new Error('Unable to fetch news from any source. Please check your internet connection and try again.');
        }

        console.log(`✅ Successfully combined news from: ${successfulSources.join(', ')}`);
        console.log(`📰 Total articles: ${allTrendingNews.length} trending, ${allMarketNews.length} market`);

        return {
            trending: allTrendingNews.slice(0, 6), // Limit to 6 total
            market: allMarketNews.slice(0, 6)      // Limit to 6 total
        };
    }
}

const newsService = new NewsService();
export default newsService;