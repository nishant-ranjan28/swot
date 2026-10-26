import { ExternalLink, Globe2, Plus, X } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/context/ThemeContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';

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

export default function GlobalRiskPage() {
  const { isDark } = useTheme();
  const [savedRegionIds, setSavedRegionIds] = useLocalStorage('worldmonitor_saved_regions', ['world']);
  const [selectedRegionId, setSelectedRegionId] = useLocalStorage('worldmonitor_selected_region', 'world');
  const savedRegions = (Array.isArray(savedRegionIds) ? savedRegionIds : ['world'])
    .filter((id, index, ids) => REGION_BY_ID[id] && ids.indexOf(id) === index);
  const selectedRegion = REGION_BY_ID[selectedRegionId] || REGION_BY_ID.world;
  const isSelectedRegionSaved = savedRegions.includes(selectedRegion.id);
  const mapParams = new URLSearchParams({
    layers: 'conflicts,earthquakes,weather',
    center: selectedRegion.center,
    zoom: String(selectedRegion.zoom),
    variant: 'full',
    theme: isDark ? 'dark' : 'light',
  });
  const mapUrl = `https://www.worldmonitor.app/embed?${mapParams.toString()}`;

  const saveSelectedRegion = () => {
    setSavedRegionIds(current => [...new Set([...(Array.isArray(current) ? current : []), selectedRegion.id])]);
  };

  const removeSavedRegion = (regionId) => {
    const nextRegions = savedRegions.filter(id => id !== regionId);
    setSavedRegionIds(nextRegions);
    if (selectedRegionId === regionId) setSelectedRegionId(nextRegions[0] || 'world');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Global Risk"
        description="Explore global conflict, earthquake, and weather events that can shape market conditions."
        actions={(
          <Button asChild variant="outline" size="sm">
            <a href="https://www.worldmonitor.app" target="_blank" rel="noreferrer">
              Open World Monitor <ExternalLink className="ml-2 size-4" />
            </a>
          </Button>
        )}
      />

      <SectionCard
        title="Saved regions"
        description="Choose a region to recenter the map. Saved on this device."
        action={(
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="global-risk-region">Choose a region</label>
            <select
              id="global-risk-region"
              value={selectedRegion.id}
              onChange={event => setSelectedRegionId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {REGIONS.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
            <Button type="button" size="sm" onClick={saveSelectedRegion} disabled={isSelectedRegionSaved}>
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              Save
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
                <div
                  key={regionId}
                  className={`flex items-center rounded-md border ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRegionId(regionId)}
                    aria-pressed={active}
                    className="rounded-l-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    {region.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSavedRegion(regionId)}
                    aria-label={`Remove ${region.name} from saved regions`}
                    title={`Remove ${region.name}`}
                    className="rounded-r-md p-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Save a region to keep it here for quick access.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Global events map"
        description={`${selectedRegion.name} · Conflicts, earthquakes, and weather`}
        contentClassName="p-0"
      >
        <div className="overflow-hidden rounded-b-xl bg-muted">
          <iframe
            key={mapUrl}
            src={mapUrl}
            title="World Monitor map showing global conflicts, earthquakes, and weather"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="block h-[min(72vh,760px)] min-h-[420px] w-full border-0"
            allow="fullscreen"
          />
        </div>
      </SectionCard>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5">
          <Globe2 className="size-3.5" aria-hidden="true" />
          Map and event data provided by World Monitor. Updates approximately hourly.
        </p>
        <a
          href="https://www.worldmonitor.app"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Source: World Monitor
        </a>
      </div>
    </PageContainer>
  );
}
