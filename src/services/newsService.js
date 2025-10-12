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
            // Fetch maximum articles to ensure we have plenty
            const [businessResponse, marketResponse, technologyResponse] = await Promise.all([
                fetch(`https://newsapi.org/v2/top-headlines?country=in&category=business&pageSize=20&apiKey=${this.apiKeys.newsapi}`),
                fetch(`https://newsapi.org/v2/everything?q=stock%20market%20OR%20cryptocurrency%20OR%20forex%20OR%20trading&language=en&sortBy=publishedAt&pageSize=20&apiKey=${this.apiKeys.newsapi}`),
                fetch(`https://newsapi.org/v2/top-headlines?country=in&category=technology&pageSize=15&apiKey=${this.apiKeys.newsapi}`)
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
                            source: { name: article.source.name + ' (NewsAPI Business)' }
                        }));
                    trendingArticles.push(...articles);
                }
            }

            // Process technology news for trending as well
            if (technologyResponse.ok) {
                const techData = await technologyResponse.json();
                if (techData.articles && techData.articles.length > 0) {
                    const articles = techData.articles
                        .filter(article =>
                            article.title &&
                            article.description &&
                            article.title !== '[Removed]' &&
                            article.description !== '[Removed]'
                        )
                        .map(article => ({
                            ...article,
                            source: { name: article.source.name + ' (NewsAPI Tech)' }
                        }));
                    trendingArticles.push(...articles);
                }
            }

            // Process market/trading news for market updates
            if (marketResponse.ok) {
                const marketData = await marketResponse.json();
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
                    trending: trendingArticles,
                    market: marketArticles
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
            // Fetch from multiple Guardian sections for maximum content
            const [businessResponse, economicsResponse, technologyResponse, worldResponse] = await Promise.all([
                fetch('https://content.guardianapis.com/search?section=business&page-size=15&show-fields=thumbnail,trailText&api-key=test'),
                fetch('https://content.guardianapis.com/search?tag=business/economics&page-size=15&show-fields=thumbnail,trailText&api-key=test'),
                fetch('https://content.guardianapis.com/search?section=technology&page-size=10&show-fields=thumbnail,trailText&api-key=test'),
                fetch('https://content.guardianapis.com/search?tag=world/markets&page-size=10&show-fields=thumbnail,trailText&api-key=test')
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

            // Process technology news for trending
            if (technologyResponse.ok) {
                const techData = await technologyResponse.json();
                if (techData.response && techData.response.results) {
                    const articles = techData.response.results.map(article => ({
                        title: article.webTitle,
                        description: article.fields?.trailText || 'Read more about this technology story...',
                        url: article.webUrl,
                        publishedAt: article.webPublicationDate,
                        source: { name: 'The Guardian Technology' },
                        image: article.fields?.thumbnail || `https://via.placeholder.com/400x200/8B5CF6/ffffff?text=Guardian+Tech`
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
                        description: article.fields?.trailText || 'Read more about this economic story...',
                        url: article.webUrl,
                        publishedAt: article.webPublicationDate,
                        source: { name: 'The Guardian Economics' },
                        image: article.fields?.thumbnail || `https://via.placeholder.com/400x200/0F766E/ffffff?text=Guardian+Economics`
                    }));
                    marketArticles.push(...articles);
                }
            }

            // Process world markets news for market
            if (worldResponse.ok) {
                const worldData = await worldResponse.json();
                if (worldData.response && worldData.response.results) {
                    const articles = worldData.response.results.map(article => ({
                        title: article.webTitle,
                        description: article.fields?.trailText || 'Read more about this global market story...',
                        url: article.webUrl,
                        publishedAt: article.webPublicationDate,
                        source: { name: 'The Guardian World Markets' },
                        image: article.fields?.thumbnail || `https://via.placeholder.com/400x200/DC2626/ffffff?text=Guardian+World`
                    }));
                    marketArticles.push(...articles);
                }
            }

            if (trendingArticles.length > 0 || marketArticles.length > 0) {
                return {
                    trending: trendingArticles,
                    market: marketArticles
                };
            }
        } catch (error) {
            console.log('Guardian API fetch failed:', error.message);
        }
        return null;
    }

    // Try to fetch from multiple RSS feeds for maximum diversity
    async fetchFromRSSFeed() {
        try {
            // Fetch from multiple RSS sources for maximum content
            const [bbcResponse, reutersResponse, cnbcResponse, forbesResponse] = await Promise.all([
                fetch('https://rss2json.com/api.json?rss_url=http://feeds.bbci.co.uk/news/business/rss.xml&count=15'),
                fetch('https://rss2json.com/api.json?rss_url=https://feeds.reuters.com/reuters/businessNews&count=15'),
                fetch('https://rss2json.com/api.json?rss_url=https://www.cnbc.com/id/10001147/device/rss/rss.html&count=10'),
                fetch('https://rss2json.com/api.json?rss_url=https://www.forbes.com/business/feed2/&count=10')
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

            // Process CNBC for trending
            if (cnbcResponse.ok) {
                const cnbcData = await cnbcResponse.json();
                if (cnbcData.items && cnbcData.items.length > 0) {
                    const articles = cnbcData.items.map(item => ({
                        title: item.title,
                        description: item.description?.replace(/<[^>]*>/g, '').substring(0, 150) + '...' || 'Read more about this business story...',
                        url: item.link,
                        publishedAt: item.pubDate,
                        source: { name: 'CNBC Business' },
                        image: item.thumbnail || `https://via.placeholder.com/400x200/0EA5E9/ffffff?text=CNBC+Business`
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

            // Process Forbes for market news
            if (forbesResponse.ok) {
                const forbesData = await forbesResponse.json();
                if (forbesData.items && forbesData.items.length > 0) {
                    const articles = forbesData.items.map(item => ({
                        title: item.title,
                        description: item.description?.replace(/<[^>]*>/g, '').substring(0, 150) + '...' || 'Read more about this Forbes story...',
                        url: item.link,
                        publishedAt: item.pubDate,
                        source: { name: 'Forbes Business' },
                        image: item.thumbnail || `https://via.placeholder.com/400x200/059669/ffffff?text=Forbes+Business`
                    }));
                    marketArticles.push(...articles);
                }
            }

            if (trendingArticles.length > 0 || marketArticles.length > 0) {
                return {
                    trending: trendingArticles,
                    market: marketArticles
                };
            }
        } catch (error) {
            console.log('RSS feed fetch failed:', error.message);
        }
        return null;
    }

    /**
     * Fetches news data from multiple API sources and combines them
     * Ensures minimum 5-6 articles per category from real API sources only
     * 
     * @returns {Promise<{trending: Article[], market: Article[]}>} News data object containing:
     *   - trending: Array of trending business news articles from multiple sources (min 5)
     *   - market: Array of market/financial news articles from multiple sources (min 5)
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
     * @throws {Error} When insufficient real news data is available
     * @note Requires minimum 5 articles per category, no hardcoded fallbacks
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
            allTrendingNews.push(...newsApiData.value.trending);
            allMarketNews.push(...newsApiData.value.market);
            successfulSources.push('NewsAPI');
        } else if (newsApiData.status === 'rejected') {
            console.warn('⚠️ NewsAPI failed:', newsApiData.reason);
        }

        // Process Guardian API results
        if (guardianData.status === 'fulfilled' && guardianData.value) {
            console.log('✅ Guardian API data received');
            allTrendingNews.push(...guardianData.value.trending);
            allMarketNews.push(...guardianData.value.market);
            successfulSources.push('Guardian');
        } else if (guardianData.status === 'rejected') {
            console.warn('⚠️ Guardian API failed:', guardianData.reason);
        }

        // Process RSS Feed results
        if (rssData.status === 'fulfilled' && rssData.value) {
            console.log('✅ RSS Feed data received');
            allTrendingNews.push(...rssData.value.trending);
            allMarketNews.push(...rssData.value.market);
            successfulSources.push('RSS/BBC/Reuters');
        } else if (rssData.status === 'rejected') {
            console.warn('⚠️ RSS feeds failed:', rssData.reason);
        }

        // Remove duplicates based on title
        const uniqueTrending = this.removeDuplicateArticles(allTrendingNews);
        const uniqueMarket = this.removeDuplicateArticles(allMarketNews);

        // Check if we have minimum required articles
        const minRequired = 5;
        if (uniqueTrending.length < minRequired || uniqueMarket.length < minRequired) {
            const errorMsg = `Insufficient news data: Got ${uniqueTrending.length} trending and ${uniqueMarket.length} market articles, need minimum ${minRequired} each.`;
            console.error('❌', errorMsg);
            console.log('📊 Available sources:', successfulSources.join(', ') || 'None');
            throw new Error(`${errorMsg} Please check your internet connection or try again later.`);
        }

        console.log(`✅ Successfully combined news from: ${successfulSources.join(', ')}`);
        console.log(`📰 Final count: ${uniqueTrending.length} trending, ${uniqueMarket.length} market articles`);

        return {
            trending: uniqueTrending.slice(0, 12), // Show more articles - up to 12
            market: uniqueMarket.slice(0, 12)      // Show more articles - up to 12
        };
    }

    /**
     * Remove duplicate articles based on title similarity
     * @param {Array} articles - Array of articles to deduplicate
     * @returns {Array} - Deduplicated array of articles
     */
    removeDuplicateArticles(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const titleKey = article.title.toLowerCase().trim();
            if (seen.has(titleKey)) {
                return false;
            }
            seen.add(titleKey);
            return true;
        });
    }
}

const newsService = new NewsService();
export default newsService;