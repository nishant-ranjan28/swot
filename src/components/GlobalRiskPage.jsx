import { ExternalLink, Globe2 } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/context/ThemeContext';

const EMBED_URL = 'https://www.worldmonitor.app/embed?layers=conflicts,earthquakes,weather&center=20,0&zoom=1&variant=full';

export default function GlobalRiskPage() {
  const { isDark } = useTheme();
  const mapUrl = `${EMBED_URL}&theme=${isDark ? 'dark' : 'light'}`;

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
        title="Global events map"
        description="Conflicts, earthquakes, and weather"
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
