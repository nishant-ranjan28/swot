import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Globe2, Newspaper, Plus, RefreshCw, Ship, X } from 'lucide-react';
import api from '@/api';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/context/ThemeContext';
import { useHoldings, useWatchlist } from '@/context/UserDataContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const REFRESH_INTERVAL = 15 * 60 * 1000;
const REGIONS = [
  { id: 'world', name: 'World', center: '20,0', zoom: 1 },
  { id: 'south-asia', name: 'South Asia', center: '20,78', zoom: 3 },
  { id: 'middle-east', name: 'Middle East', center: '27,45', zoom: 3 },
  { id: 'europe', name: 'Europe', center: '50,15', zoom: 3 },
  { id: 'east-asia', name: 'East Asia', center: '35,115', zoom: 3 },
  { id: 'north-america', name: 'North America', center: '40,-100', zoom: 2 },
  { id: 'africa', name: 'Africa', center: '-2,20', zoom: 2 },
];

const REGION_BY_ID = Object.fromEntries(REGIONS.map(region => [region.id, region]));
const TOPICS = [
  { id: 'all', label: 'All topics' },
  { id: 'geopolitics', label: 'Geopolitics' },
  { id: 'natural', label: 'Natural events' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'markets', label: 'Markets & commodities' },
];

const COMMODITIES = [
  { symbol: 'CL=F', name: 'Crude oil', unit: 'bbl', keywords: ['oil', 'crude', 'opec', 'petroleum', 'energy'] },
  { symbol: 'NG=F', name: 'Natural gas', unit: 'MMBtu', keywords: ['natural gas', 'lng', 'gas supply'] },
  { symbol: 'GC=F', name: 'Gold', unit: 'oz', keywords: ['gold', 'bullion', 'precious metal'] },
  { symbol: 'HG=F', name: 'Copper', unit: 'lb', keywords: ['copper', 'mining', 'critical mineral'] },
  { symbol: 'SI=F', name: 'Silver', unit: 'oz', keywords: ['silver'] },
];

const ROUTES = [
  { name: 'Strait of Hormuz', terms: ['strait of hormuz', 'hormuz'] },
  { name: 'Red Sea & Bab el-Mandeb', terms: ['red sea', 'bab el-mandeb', 'bab al-mandab'] },
  { name: 'Suez Canal', terms: ['suez canal', 'suez'] },
  { name: 'Panama Canal', terms: ['panama canal'] },
  { name: 'Strait of Malacca', terms: ['strait of malacca', 'malacca strait'] },
];

const SCENARIOS = [
  { id: 'oil', title: 'Oil supply disruption', symbol: 'CL=F', commodity: 'Crude oil', shock: 10, unit: 'bbl', keywords: ['oil', 'crude', 'opec', 'energy'] },
  { id: 'gas', title: 'Natural gas disruption', symbol: 'NG=F', commodity: 'Natural gas', shock: 10, unit: 'MMBtu', keywords: ['gas', 'lng', 'energy'] },
  { id: 'metals', title: 'Critical minerals disruption', symbol: 'HG=F', commodity: 'Copper', shock: 10, unit: 'lb', keywords: ['copper', 'mining', 'mineral'] },
  { id: 'safe-haven', title: 'Safe-haven demand', symbol: 'GC=F', commodity: 'Gold', shock: 5, unit: 'oz', keywords: ['gold', 'bullion', 'safe haven'] },
];

const articleKey = article => `${article.url || ''}|${article.title || ''}`;
const articleText = article => `${article.title || ''} ${article.summary || ''}`.toLowerCase();
const formatPublished = value => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const matchesAny = (text, terms) => terms.some(term => text.includes(term));

function ArticleList({ articles, emptyTitle = 'No matching headlines', emptyDescription = 'Try another region or topic.' }) {
  if (!articles.length) {
    return <EmptyState icon={Newspaper} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <ul className="divide-y divide-border">
      {articles.map(article => (
        <li key={articleKey(article)} className="py-3 first:pt-0 last:pb-0">
          <a
            href={article.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm leading-5 hover:underline underline-offset-4"
          >
            {article.title || 'Untitled headline'}
            {article.url && <ExternalLink className="ml-1.5 inline size-3 text-muted-foreground" aria-hidden="true" />}
          </a>
          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>{article.source || 'Google News'}</span>
            <span aria-hidden="true">·</span>
            <time>{formatPublished(article.published_at)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function GlobalRiskPage() {
  const { isDark } = useTheme();
  const [savedRegionIds, setSavedRegionIds] = useLocalStorage('worldmonitor_saved_regions', ['world']);
  const [selectedRegionId, setSelectedRegionId] = useLocalStorage('worldmonitor_selected_region', 'world');
  const [notificationsEnabled, setNotificationsEnabled] = useLocalStorage('global_risk_notifications_enabled', false);
  const [topic, setTopic] = useState('all');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [partialFeed, setPartialFeed] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [commodityQuotes, setCommodityQuotes] = useState({});
  const [selectedScenarioId, setSelectedScenarioId] = useState(SCENARIOS[0].id);
  const [shockPercent, setShockPercent] = useState(String(SCENARIOS[0].shock));
  const [scenarioQuote, setScenarioQuote] = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const initialFetchRef = useRef(true);
  const seenArticleKeysRef = useRef(new Set());
  const lastCheckedAtRef = useRef(Date.now());
  const [holdingsIn] = useHoldings('in');
  const [holdingsUs] = useHoldings('us');
  const [watchlistIn] = useWatchlist('in');
  const [watchlistUs] = useWatchlist('us');

  const savedRegions = (Array.isArray(savedRegionIds) ? savedRegionIds : ['world'])
    .filter((id, index, ids) => REGION_BY_ID[id] && ids.indexOf(id) === index);
  const selectedRegion = REGION_BY_ID[selectedRegionId] || REGION_BY_ID.world;
  const isSelectedRegionSaved = savedRegions.includes(selectedRegion.id);
  const selectedScenario = SCENARIOS.find(scenario => scenario.id === selectedScenarioId) || SCENARIOS[0];
  const mapParams = new URLSearchParams({
    layers: 'conflicts,earthquakes,weather',
    center: selectedRegion.center,
    zoom: String(selectedRegion.zoom),
    variant: 'full',
    theme: isDark ? 'dark' : 'light',
  });
  const mapUrl = `https://www.worldmonitor.app/embed?${mapParams.toString()}`;

  const fetchHeadlines = useCallback(async ({ notify = false } = {}) => {
    if (notify) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(['in', 'us'].map(market => api.get('/api/stocks/global-risk/news', {
        params: { region: selectedRegion.id, category: topic, market },
      })));
      const successful = results.filter(result => result.status === 'fulfilled');
      if (!successful.length) throw new Error('Both news requests failed');
      setPartialFeed(successful.length !== results.length);

      const unique = new Map();
      successful.forEach(result => {
        (result.value.data?.articles || []).forEach(article => {
          const key = articleKey(article);
          if (key !== '|' && !unique.has(key)) unique.set(key, article);
        });
      });
      const nextArticles = [...unique.values()].sort(
        (a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0),
      );

      if (initialFetchRef.current) {
        seenArticleKeysRef.current = new Set(nextArticles.map(articleKey));
        initialFetchRef.current = false;
      } else {
        const now = Date.now();
        const recentNew = nextArticles.filter(article => {
          const key = articleKey(article);
          const published = new Date(article.published_at || 0).getTime();
          const isNew = !seenArticleKeysRef.current.has(key);
          seenArticleKeysRef.current.add(key);
          return isNew && Number.isFinite(published) && published >= lastCheckedAtRef.current - 60_000 && published <= now;
        });
        if (notify && notificationsEnabled && window.Notification?.permission === 'granted') {
          recentNew.slice(0, 3).forEach(article => {
            try {
              new Notification(`Global Risk · ${selectedRegion.name}`, {
                body: article.title || 'A new regional headline is available.',
                icon: '/favicon.ico',
                tag: `global-risk-${articleKey(article)}`,
              });
            } catch { /* Browser may disallow notifications in this context. */ }
          });
        }
        lastCheckedAtRef.current = now;
      }
      setArticles(nextArticles);
    } catch {
      setError('Could not load global risk headlines. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notificationsEnabled, selectedRegion.id, selectedRegion.name, topic]);

  useEffect(() => {
    fetchHeadlines();
    const timer = window.setInterval(() => fetchHeadlines({ notify: true }), REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, [fetchHeadlines]);

  useEffect(() => {
    let active = true;
    Promise.all(COMMODITIES.map(commodity => api.get(`/api/stocks/${encodeURIComponent(commodity.symbol)}/quote`)
      .then(response => [commodity.symbol, response.data])
      .catch(() => [commodity.symbol, null])))
      .then(results => {
        if (active) setCommodityQuotes(Object.fromEntries(results));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setScenarioLoading(true);
    api.get(`/api/stocks/${encodeURIComponent(selectedScenario.symbol)}/quote`)
      .then(response => { if (active) setScenarioQuote(response.data); })
      .catch(() => { if (active) setScenarioQuote(null); })
      .finally(() => { if (active) setScenarioLoading(false); });
    return () => { active = false; };
  }, [selectedScenario.symbol]);

  const saveSelectedRegion = () => {
    setSavedRegionIds(current => [...new Set([...(Array.isArray(current) ? current : []), selectedRegion.id])]);
  };

  const removeSavedRegion = (regionId) => {
    const nextRegions = savedRegions.filter(id => id !== regionId);
    setSavedRegionIds(nextRegions);
    if (selectedRegionId === regionId) setSelectedRegionId(nextRegions[0] || 'world');
  };

  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      setNotificationMessage('Regional headline alerts are off.');
      return;
    }
    if (!('Notification' in window)) {
      setNotificationMessage('This browser does not support desktop notifications.');
      return;
    }
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== 'granted') {
      setNotificationMessage('Allow notifications in your browser settings to turn on alerts.');
      return;
    }
    seenArticleKeysRef.current = new Set(articles.map(articleKey));
    lastCheckedAtRef.current = Date.now();
    setNotificationsEnabled(true);
    setNotificationMessage(`Alerts enabled for new ${TOPICS.find(item => item.id === topic)?.label.toLowerCase()} headlines in ${selectedRegion.name} while this page is open.`);
  };

  const portfolioMatches = useMemo(() => {
    const holdings = [
      ...(holdingsIn || []).map(item => ({ ...item, trackedIn: 'Portfolio' })),
      ...(holdingsUs || []).map(item => ({ ...item, trackedIn: 'Portfolio' })),
      ...(watchlistIn || []).map(item => ({ ...item, trackedIn: 'Watchlist' })),
      ...(watchlistUs || []).map(item => ({ ...item, trackedIn: 'Watchlist' })),
    ];
    return articles.map(article => {
      const text = articleText(article);
      const matches = holdings.filter(holding => {
        const name = holding.name?.trim().toLowerCase();
        const symbol = holding.symbol?.replace(/\.(NS|BO)$/i, '').toLowerCase();
        return (name && name.length > 3 && text.includes(name)) || (symbol && symbol.length >= 5 && text.includes(symbol));
      });
      return matches.length ? { article, matches } : null;
    }).filter(Boolean);
  }, [articles, holdingsIn, holdingsUs, watchlistIn, watchlistUs]);

  const commodityMentions = useMemo(() => COMMODITIES.map(commodity => {
    const matches = articles.filter(article => matchesAny(articleText(article), commodity.keywords));
    const quote = commodityQuotes[commodity.symbol];
    return {
      ...commodity,
      count: matches.length,
      latest: matches[0] || null,
      price: quote?.price || quote?.regularMarketPrice || null,
      changePercent: quote?.change_percent ?? quote?.regularMarketChangePercent ?? null,
    };
  }), [articles, commodityQuotes]);

  const routeMentions = useMemo(() => ROUTES.map(route => ({
    ...route,
    matches: articles.filter(article => matchesAny(articleText(article), route.terms)),
  })), [articles]);

  const scenarioNews = useMemo(
    () => articles.filter(article => matchesAny(articleText(article), selectedScenario.keywords)).slice(0, 3),
    [articles, selectedScenario],
  );

  const currentScenarioPrice = scenarioQuote?.price || scenarioQuote?.regularMarketPrice;
  const parsedShock = Number(shockPercent);
  const validShock = Number.isFinite(parsedShock) && parsedShock >= -50 && parsedShock <= 50;
  const projectedScenarioPrice = validShock && currentScenarioPrice != null
    ? currentScenarioPrice * (1 + parsedShock / 100)
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Global Risk"
        description="Regional headlines, shipping signals, and market context for your portfolio."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fetchHeadlines({ notify: true })} disabled={refreshing || loading}>
              <RefreshCw className={`mr-2 size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh news
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="https://www.worldmonitor.app" target="_blank" rel="noreferrer">
                Open World Monitor <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        )}
      />

      <SectionCard
        title="Saved regions"
        description="Choose a region to recenter the map and filter its headlines. Saved on this device."
        action={(
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="global-risk-region">Choose a region</label>
            <select
              id="global-risk-region"
              value={selectedRegion.id}
              onChange={event => setSelectedRegionId(event.target.value)}
              className="h-9 max-w-36 rounded-md border border-input bg-background px-3 text-sm text-foreground sm:max-w-none"
            >
              {REGIONS.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
            <Button type="button" size="sm" onClick={saveSelectedRegion} disabled={isSelectedRegionSaved}>
              <Plus className="mr-1.5 size-4" aria-hidden="true" /> Save
            </Button>
          </div>
        )}
      >
        {savedRegions.length ? (
          <div className="flex flex-wrap gap-2">
            {savedRegions.map(regionId => {
              const region = REGION_BY_ID[regionId];
              const active = selectedRegion.id === regionId;
              return (
                <div key={regionId} className={`flex items-center rounded-md border ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                  <button type="button" onClick={() => setSelectedRegionId(regionId)} aria-pressed={active} className="rounded-l-md px-3 py-2 text-sm hover:bg-muted">
                    {region.name}
                  </button>
                  <button type="button" onClick={() => removeSavedRegion(regionId)} aria-label={`Remove ${region.name} from saved regions`} title={`Remove ${region.name}`} className="rounded-r-md p-2 text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">Save a region to keep it here for quick access.</p>}
      </SectionCard>

      <SectionCard title="Global events map" description={`${selectedRegion.name} · Conflicts, earthquakes, and weather`} contentClassName="p-0">
        <div className="overflow-hidden rounded-b-xl bg-muted">
          <iframe key={mapUrl} src={mapUrl} title="World Monitor map showing global conflicts, earthquakes, and weather" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="block h-[min(72vh,760px)] min-h-[420px] w-full border-0" allow="fullscreen" />
        </div>
      </SectionCard>

      <SectionCard
        title="Regional event and risk headlines"
        description="Recent Google News RSS coverage for the selected region. Headlines are signals, not independently verified events."
        action={<Badge variant="secondary">{articles.length} headlines</Badge>}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter headlines by topic" className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1">
            {TOPICS.map(item => (
              <button key={item.id} type="button" onClick={() => setTopic(item.id)} aria-pressed={topic === item.id} className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${topic === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <Button type="button" variant={notificationsEnabled ? 'secondary' : 'outline'} size="sm" onClick={toggleNotifications}>
            {notificationsEnabled ? 'Turn off region alerts' : 'Enable region alerts'}
          </Button>
        </div>
        {notificationMessage && <p role="status" className="mb-3 text-xs text-muted-foreground">{notificationMessage}</p>}
        {notificationsEnabled && <p className="mb-3 text-xs text-muted-foreground">Alerts check every 15 minutes while Global Risk is open in this browser.</p>}
        {partialFeed && <p role="status" className="mb-3 text-xs text-warning">One market news feed did not respond; these results may be incomplete.</p>}
        {error ? <ErrorState message={error} onRetry={() => fetchHeadlines()} /> : loading ? (
          <div className="space-y-4">{[0, 1, 2, 3].map(key => <Skeleton key={key} className="h-14 w-full" />)}</div>
        ) : <ArticleList articles={articles} emptyTitle="No headlines for this filter" emptyDescription="Try another topic or region, or refresh later." />}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Portfolio & watchlist matches" description="Direct company or ticker mentions in the regional feed; this does not estimate investment impact.">
          {portfolioMatches.length ? (
            <ul className="space-y-3">
              {portfolioMatches.slice(0, 8).map(({ article, matches }) => (
                <li key={articleKey(article)} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="mb-1 flex flex-wrap gap-1.5">{matches.map((holding, index) => <Badge key={`${holding.trackedIn}-${holding.symbol}-${index}`} variant="outline">{holding.name || holding.symbol} · {holding.trackedIn}</Badge>)}</div>
                  <a href={article.url || undefined} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">{article.title}</a>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No direct mentions of current holdings in this feed.</p>}
        </SectionCard>

        <SectionCard title="Commodity context" description="Current commodity quotes alongside headlines that mention the asset or related terms.">
          <div className="divide-y divide-border">
            {commodityMentions.map(commodity => (
              <div key={commodity.symbol} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{commodity.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{commodity.latest?.title || 'No matching headline'}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums">{commodity.price == null ? '—' : `$${Number(commodity.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</div>
                  <div className="text-xs text-muted-foreground">{commodity.count} mentions · per {commodity.unit}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Shipping route watch" description="Headline mentions only; StockPulse does not have live vessel, closure, or transit-status data here.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {routeMentions.map(route => (
            <div key={route.name} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Ship className="size-4 text-muted-foreground" aria-hidden="true" />{route.name}</div>
              <div className="text-xs text-muted-foreground">{route.matches.length} recent headline {route.matches.length === 1 ? 'mention' : 'mentions'}</div>
              {route.matches[0] && <a href={route.matches[0].url || undefined} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs hover:underline">{route.matches[0].title}</a>}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="What-if commodity scenarios" description="Apply a hypothetical percentage move to today’s quote. This is arithmetic, not a forecast or portfolio return estimate.">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div>
            <label htmlFor="global-risk-scenario" className="mb-1.5 block text-sm font-medium">Scenario</label>
            <select id="global-risk-scenario" value={selectedScenario.id} onChange={event => {
              const next = SCENARIOS.find(item => item.id === event.target.value) || SCENARIOS[0];
              setSelectedScenarioId(next.id);
              setShockPercent(String(next.shock));
            }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {SCENARIOS.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="global-risk-shock" className="mb-1.5 block text-sm font-medium">Hypothetical move (%)</label>
            <Input id="global-risk-shock" type="number" min="-50" max="50" step="0.5" value={shockPercent} onChange={event => setShockPercent(event.target.value)} aria-invalid={!validShock} aria-describedby={!validShock ? 'global-risk-shock-error' : undefined} className="w-full md:w-36" />
            {!validShock && <p id="global-risk-shock-error" className="mt-1 text-xs text-loss">Enter a move from -50% to +50%.</p>}
          </div>
          <div className="rounded-lg bg-muted px-4 py-2.5 md:min-w-48">
            <div className="text-xs text-muted-foreground">{selectedScenario.commodity} reference price</div>
            <div className="text-sm font-semibold tabular-nums">
              {scenarioLoading ? 'Loading…' : currentScenarioPrice == null ? 'Unavailable' : `$${Number(currentScenarioPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })} → ${projectedScenarioPrice == null ? '—' : `$${projectedScenarioPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}`}
            </div>
            <div className="text-xs text-muted-foreground">per {selectedScenario.unit} · Yahoo Finance</div>
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Related regional headlines</p>
          {scenarioNews.length ? <ArticleList articles={scenarioNews} /> : <p className="text-sm text-muted-foreground">No related headlines in the current feed.</p>}
        </div>
      </SectionCard>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5"><Globe2 className="size-3.5" aria-hidden="true" />Map by World Monitor. News via StockPulse’s Google News RSS integration; commodity quotes via Yahoo Finance.</p>
        <a href="https://www.worldmonitor.app" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">World Monitor source</a>
      </div>
    </PageContainer>
  );
}
