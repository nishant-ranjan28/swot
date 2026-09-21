// src/components/layout/TopBar.jsx
import { useNavigate } from 'react-router-dom';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMarket } from '@/context/MarketContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export default function TopBar({ onOpenMenu, onOpenSearch }) {
  const navigate = useNavigate();
  const { market } = useMarket();
  const { isDark, toggleTheme } = useTheme();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>

      <button
        type="button"
        data-slot="search-trigger"
        onClick={onOpenSearch}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search stocks, pages…</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 font-mono text-[10px] sm:inline">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div role="group" aria-label="Market" className="flex rounded-md border border-border p-0.5">
          {['in', 'us'].map(m => (
            <button
              key={m}
              type="button"
              data-slot="market-toggle"
              onClick={() => navigate(`/${m}`)}
              aria-pressed={market === m}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-semibold transition-colors',
                market === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
