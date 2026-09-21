# Phase 3a: Shared UI Kit + Home + Stock Detail Restyle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a small set of shared, token-based components and a theme-aware chart color hook. Use them to restyle `HomePage` and the whole Stock Detail page (all 12 tabs) into the OpenStock-style look. Behaviour, API calls and data logic stay exactly as they are.

**Architecture:**
- New shared components live in `src/components/common/`. They are thin wrappers over tokens and shadcn primitives.
- Canvas/JS charts (lightweight-charts, uPlot, raw canvas) can't read CSS variables. They get resolved colors from a `useChartTheme()` hook, which re-reads the CSS variables whenever `isDark` changes.
- SVG gauges use `style={{ stroke: 'var(--gain)' }}`.
- Pages are restyled by a mechanical class mapping (the Style Guide below) plus swaps to the shared components. The legacy `.dark .x` overrides stay in `index.css` until Phase 3c, when every page has been restyled.

**Tech Stack:** as Phase 2 (Tailwind 4 tokens, shadcn/ui, lucide-react), plus the shadcn `table` component.

**Design doc:** `docs/plans/2026-09-21-openstock-revamp-design.md`, Phase 3. Phase 2 is committed as `16495d2`. Phase 3b (Watchlist, Portfolio, Screener, Scanner, Compare) and Phase 3c (the remaining pages plus removal of the legacy overrides) get their own plans.

---

## Environment notes (read first)

- **fsevents hangs node on this Mac.** `node_modules/fsevents` must NOT exist while vite or vitest runs. The backup is at `$TMPDIR/fsevents.bak`; leave it there. If `npm install` recreates `node_modules/fsevents`, delete the new copy.
- Guard long commands with `perl -e 'alarm 300; exec @ARGV' <cmd>`.
- Always pass `--cache "$TMPDIR/npm-cache"` to npm. `npx shadcn` may need the sandbox disabled because it needs network access.
- The Vite dev server on :3000 and uvicorn on :8000 are running; leave them running. Verify with `npx vite build`, then `rm -rf build`.
- Never stage `backend/main.py` or `.env`. Do not commit; the user tests first.
- **No behaviour changes:** don't touch API calls, state, effects, calculations, URL params, or PDF/CSV export logic. Only change markup, classes and presentational components. If a restyle seems to need a logic change, stop and report instead.

---

## Style Guide (mapping rules for every restyled file)

| Old | New |
|---|---|
| `min-h-screen bg-gray-50` page root | remove both (AppShell provides the background) |
| `max-w-7xl mx-auto p-3 sm:p-4 md:p-6 …` | `<PageContainer>` |
| `<h1 className="text-2xl … text-gray-900">` + subtitle `<p>` | `<PageHeader title description actions />` |
| `bg-white rounded-xl/lg p-N shadow-* border border-gray-100/200` | `<Card>` (shadcn) or `<SectionCard title action>`; plain wrapper: `rounded-xl border border-border bg-card p-4` |
| `text-gray-900` / `text-gray-800` | `text-foreground` |
| `text-gray-700` | `text-foreground/85` |
| `text-gray-600` / `text-gray-500` | `text-muted-foreground` |
| `text-gray-400` | `text-muted-foreground` (see note below) |
| `bg-gray-50` inner sections / `bg-gray-100` chips | `bg-muted/40` / `bg-muted` |
| `border-gray-100/200/300` | `border-border` |
| `hover:bg-gray-50/100` | `hover:bg-muted/50` |
| `x >= 0 ? 'text-green-600' : 'text-red-600'` showing a change | `<PriceChange value={…} percent={…} />`; when it only colors other content: `text-gain` / `text-loss` |
| `bg-green-100 text-green-700` / `bg-red-100 text-red-700` badges | `<Badge variant="gain">` / `<Badge variant="loss">` (Task 1 adds the variants) |
| yellow/amber "neutral" badges | `<Badge variant="warning">` |
| `bg-blue-50 text-blue-700` buttons / `bg-blue-600 text-white` buttons | `<Button variant="secondary">` / `<Button>` |
| blue text links | `text-primary hover:underline` (links on light: `text-foreground underline-offset-4 hover:underline`) |
| blue active pills / segmented buttons | active: `bg-primary text-primary-foreground`; inactive: `text-muted-foreground hover:text-foreground hover:bg-muted` |
| `animate-pulse` + `bg-gray-200` blocks | `<Skeleton className="h-4 w-24" />` |
| raw `<table>` | shadcn `Table, TableHeader, TableRow, TableHead, TableBody, TableCell` |
| numbers, prices, % | add `tabular-nums` |
| `shadow-md` / `hover:shadow-md` on cards | drop the shadow; use `hover:border-foreground/20` for interactive cards |

Keep responsive grid classes as they are. Keep `sticky top-16`.

**Note (Phase 3c):** gray-400 was first mapped to `text-muted-foreground/70`, but that is only about 2.9:1 on white, below the 4.5:1 WCAG AA minimum for text. Readable text (labels, hints, captions, prefixes/suffixes, disclaimers, metadata) uses plain `text-muted-foreground`. Keep `/50`–`/70` only for purely decorative marks: rank numbers, `aria-hidden` icons, separators.

---

### Task 1: Tokens, badge variants, table, color helpers (TDD)

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/ui/badge.jsx`
- Create (shadcn): `src/components/ui/table.jsx`
- Create: `src/lib/color.js`
- Create: `src/lib/color.test.js`

**Step 1: Add a warning token**

In `:root`, set `--warning: #ca8a04;`. In `.dark`, set `--warning: #facc15;`. In `@theme inline`, add `--color-warning: var(--warning);`.

**Step 2: Add Badge variants**

In the `badgeVariants` cva `variant` map in `badge.jsx`, add:

```js
gain: 'border-transparent bg-gain/12 text-gain',
loss: 'border-transparent bg-loss/12 text-loss',
warning: 'border-transparent bg-warning/15 text-warning',
```

**Step 3: Add the table component**

Run: `npx shadcn@latest add table --yes`. After it runs, fix up the new file:
- `cn` must come from `@/lib/utils`.
- Remove `"use client"`.
- Remove any unused React import.

**Step 4: Write the failing test**

```js
// src/lib/color.test.js
import { withAlpha, readCssVar } from './color';

test('withAlpha converts hex to rgba', () => {
  expect(withAlpha('#16a34a', 0.3)).toBe('rgba(22, 163, 74, 0.3)');
  expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
});

test('withAlpha passes through non-hex unchanged', () => {
  expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)');
});

test('readCssVar reads from element style with fallback', () => {
  document.documentElement.style.setProperty('--gain', ' #22c55e ');
  expect(readCssVar('--gain', '#000')).toBe('#22c55e');
  expect(readCssVar('--nope', '#123456')).toBe('#123456');
});
```

**Step 5:** Run `npx vitest run src/lib/color.test.js`. Expect FAIL.

**Step 6: Implement**

```js
// src/lib/color.js
export function withAlpha(hex, alpha) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function readCssVar(name, fallback, el = document.documentElement) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}
```

**Step 7:** Run the test again. Expect PASS. If jsdom's `getComputedStyle` doesn't return inline custom properties, fall back to `el.style.getPropertyValue(name)` inside `readCssVar` (check it first, then computed). Report which one worked.

---

### Task 2: `useChartTheme` hook (TDD)

**Files:**
- Create: `src/hooks/useChartTheme.js`
- Create: `src/hooks/useChartTheme.test.jsx`

**Step 1: Write the failing test**

```jsx
// src/hooks/useChartTheme.test.jsx
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { useChartTheme } from './useChartTheme';

function Probe() {
  const t = useChartTheme();
  const { toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{`${t.isDark}|${t.gain}|${t.gainArea}`}</button>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.setProperty('--gain', '#22c55e');
});

test('returns resolved colors and recomputes on theme toggle', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  const btn = screen.getByRole('button');
  expect(btn).toHaveTextContent('true|#22c55e|rgba(34, 197, 94, 0.3)');
  document.documentElement.style.setProperty('--gain', '#16a34a');
  act(() => btn.click());
  expect(btn).toHaveTextContent('false|#16a34a|rgba(22, 163, 74, 0.3)');
});
```

**Step 2:** Run the test. Expect FAIL.

**Step 3: Implement**

```js
// src/hooks/useChartTheme.js
import { useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { readCssVar, withAlpha } from '@/lib/color';

// Resolved colors for canvas/JS chart libs that can't use CSS variables.
// Recomputed when the theme flips; ThemeProvider applies the .dark class in a layout effect first.
export function useChartTheme() {
  const { isDark } = useTheme();
  return useMemo(() => {
    const gain = readCssVar('--gain', isDark ? '#22c55e' : '#16a34a');
    const loss = readCssVar('--loss', isDark ? '#ef4444' : '#dc2626');
    return {
      isDark,
      background: readCssVar('--card', isDark ? '#141416' : '#ffffff'),
      text: readCssVar('--muted-foreground', isDark ? '#9a9aa3' : '#6b6b73'),
      grid: readCssVar('--border', isDark ? '#26262b' : '#e4e4e7'),
      foreground: readCssVar('--foreground', isDark ? '#ededee' : '#0b0b0c'),
      primary: readCssVar('--primary', isDark ? '#fdd458' : '#eab308'),
      warning: readCssVar('--warning', isDark ? '#facc15' : '#ca8a04'),
      gain,
      loss,
      gainArea: withAlpha(gain, 0.3),
      lossArea: withAlpha(loss, 0.3),
      series: [1, 2, 3, 4, 5].map(i => readCssVar(`--chart-${i}`, '#888888')),
    };
  }, [isDark]);
}
```

**Step 4:** Run the test. Expect PASS.

---

### Task 3: Shared components (TDD for the ones with logic)

**Files:** create in `src/components/common/`:
- `PageContainer.jsx`
- `PageHeader.jsx`
- `SectionCard.jsx`
- `PriceChange.jsx`
- `StatCard.jsx`
- `EmptyState.jsx`
- `ErrorState.jsx`
- `common.test.jsx`

Also modify `src/components/LoadingSpinner.jsx`, `src/components/ErrorFallback.jsx` and `src/components/StockDetail/TabSkeleton.jsx` (restyle only; keep props).

**Step 1: Write the failing tests**

```jsx
// src/components/common/common.test.jsx
import { render, screen } from '@testing-library/react';
import PriceChange from './PriceChange';
import StatCard from './StatCard';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';

test('PriceChange positive shows + and gain color', () => {
  render(<PriceChange value={12.5} percent={1.63} />);
  const el = screen.getByText(/\+12\.50/);
  expect(el.closest('[data-trend]')).toHaveAttribute('data-trend', 'up');
  expect(el.closest('[data-trend]')).toHaveClass('text-gain');
  expect(screen.getByText(/\(\+1\.63%\)/)).toBeInTheDocument();
});

test('PriceChange negative percent-only', () => {
  render(<PriceChange percent={-0.5} />);
  const el = screen.getByText('-0.50%');
  expect(el.closest('[data-trend]')).toHaveClass('text-loss');
});

test('PriceChange handles null', () => {
  render(<PriceChange percent={null} />);
  expect(screen.getByText('—')).toBeInTheDocument();
});

test('StatCard renders label, value and change', () => {
  render(<StatCard label="NIFTY 50" value="24,300.10" change={{ value: -50.2, percent: -0.21 }} />);
  expect(screen.getByText('NIFTY 50')).toBeInTheDocument();
  expect(screen.getByText('24,300.10')).toBeInTheDocument();
  expect(screen.getByText(/-0\.21%/)).toBeInTheDocument();
});

test('PageHeader renders h1 and actions', () => {
  render(<PageHeader title="Screener" description="Find stocks" actions={<button>Export</button>} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Screener' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
});

test('EmptyState shows title', () => {
  render(<EmptyState title="No stocks yet" description="Add some" />);
  expect(screen.getByText('No stocks yet')).toBeInTheDocument();
});
```

**Step 2:** Run the tests. Expect FAIL.

**Step 3: Implement**

```jsx
// src/components/common/PageContainer.jsx
import { cn } from '@/lib/utils';

export default function PageContainer({ className, children }) {
  return <div className={cn('mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6', className)}>{children}</div>;
}
```

```jsx
// src/components/common/PageHeader.jsx
import { cn } from '@/lib/utils';

export default function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
```

```jsx
// src/components/common/SectionCard.jsx
import { cn } from '@/lib/utils';

export default function SectionCard({ title, description, action, className, contentClassName, children }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  );
}
```

```jsx
// src/components/common/PriceChange.jsx
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (n, d = 2) => `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}`;

export default function PriceChange({ value, percent, showIcon = false, className }) {
  const basis = percent ?? value;
  if (basis === null || basis === undefined || Number.isNaN(Number(basis))) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }
  const up = Number(basis) >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const hasValue = value !== null && value !== undefined;
  const hasPct = percent !== null && percent !== undefined;
  return (
    <span
      data-trend={up ? 'up' : 'down'}
      className={cn('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-gain' : 'text-loss', className)}
    >
      {showIcon && <Icon className="size-3.5" aria-hidden />}
      {hasValue && <span>{fmt(value)}</span>}
      {hasValue && hasPct && <span>{` (${fmt(percent)}%)`}</span>}
      {!hasValue && hasPct && <span>{`${fmt(percent)}%`}</span>}
    </span>
  );
}
```

`PriceChange` doesn't add currency symbols. Callers that showed `₹+12.50` keep formatting the value themselves, or they pass only `percent`.

```jsx
// src/components/common/StatCard.jsx
import { cn } from '@/lib/utils';
import PriceChange from './PriceChange';

export default function StatCard({ label, value, sub, change, icon: Icon, className, children }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      {(change || sub) && (
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          {change && <PriceChange value={change.value} percent={change.percent} />}
          {sub && <span className="text-muted-foreground">{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
```

```jsx
// src/components/common/EmptyState.jsx
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center', className)}>
      <Icon className="size-8 text-muted-foreground/60" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

```jsx
// src/components/common/ErrorState.jsx
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-loss/30 bg-loss/5 px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-loss" aria-hidden />
      <p className="font-medium">{title}</p>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">Try again</Button>}
    </div>
  );
}
```

**Step 4: Restyle the existing shared components (keep their props)**
- `LoadingSpinner.jsx`: `border-border border-t-primary`. The text becomes `text-muted-foreground`.
- `ErrorFallback.jsx`: render `<ErrorState title=… message=… onRetry=… />`. Keep the dev-only details block, styled `mt-4 rounded-md bg-muted p-3 text-left font-mono text-xs`.
- `TabSkeleton.jsx`: use `Skeleton` from `@/components/ui/skeleton`.

**Step 5:** Run `npx vitest run src/components/common`. Expect PASS. Then run `npm test`. Expect all tests to pass.

---

### Task 4: Theme-aware charts

**Files:**
- Modify: `src/components/StockDetail/ChartTab.jsx`
- Modify: `src/components/Sparkline.jsx`
- Modify: `src/components/PriceChart.jsx`
- Modify: `src/components/StockDetail/PredictionTab.jsx`

Rules:
- Call `const ct = useChartTheme();` in each chart component.
- **lightweight-charts (`ChartTab`):**
  - Chart creation options: `layout: { background: { type: ColorType.Solid, color: ct.background }, textColor: ct.text }` and `grid: { vertLines: { color: ct.grid }, horzLines: { color: ct.grid } }`.
  - Candles: `upColor/borderUpColor/wickUpColor: ct.gain`, `down*: ct.loss`.
  - Volume bars: `ct.gainArea` / `ct.lossArea`.
  - Theme changes must NOT recreate the chart, because that would lose zoom and drawings. Add a separate effect on `[ct]` that calls `chart.applyOptions({ layout, grid })` and `series.applyOptions({...})`, then recolors the volume data. Volume colors are per data point, so re-run the existing volume `setData` mapping with the new colors, using the same data that is already loaded.
  - The chart container keeps its `rounded-xl border border-border` wrapper.
  - `DRAWING_COLORS` stays as it is; those are user-chosen colors.
- **uPlot (`Sparkline`):** the defaults become `ct.gain` / `ct.loss` when no `color` prop is passed. If `Sparkline` builds the plot once, include the resolved color in the effect deps so it rebuilds on a theme flip. Sparklines are cheap, so rebuilding is fine.
- **Canvas (`PriceChart`, `PredictionTab`):** replace the hardcoded `#f0f0f0`/`#e5e7eb` (grid) with `ct.grid`, and `#999`/`#6b7280` (text) with `ct.text`. Use `ct.primary` or `ct.gain`/`ct.loss` for the line and fill, matching what each chart meant before. Add `ct` to the draw effect deps.

Verify with `npx vite build`. Then, in the browser on `/stock/RELIANCE.NS?tab=chart`, toggle the theme. The chart must recolor without resetting zoom.

---

### Task 5: HomePage restyle

**Files:** Modify `src/components/HomePage.jsx` (587 lines) and `src/components/StockSearch.jsx`.

Apply the Style Guide section by section, keeping every data fetch and handler as it is:
- **Root:** remove `min-h-screen bg-gray-50`. Wrap the content in `<PageContainer>`.
- **Hero:** replace the gradient/large header with `<PageHeader title="Markets" description={…existing tagline…} />`. Add a right-side `MarketStatus` as `actions` (restyled as a `Badge`: green dot + "Market open" or muted "Closed").
  - Keep `StockSearch` below the header, full width.
  - Restyle `StockSearch`:
    - Input: `h-11 rounded-lg border border-input bg-card px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring/50`.
    - Dropdown: `rounded-lg border border-border bg-popover shadow-lg`. Items get `hover:bg-muted`, price in `tabular-nums`.
    - Dropdown `z-40`, so it stays under the TopBar's `z-50`.
- **IndexCard** → `StatCard`, with `label` = index name, `value` = formatted price, and `change`. Keep the inner `PriceRangeBar` as `children`, restyled: track `bg-muted`, marker `bg-foreground`, low/high labels `text-muted-foreground`.
- **Market Sentiment:**
  - Wrap in `<SectionCard title="Market Sentiment">`.
  - Gauge inline hex → `var(--loss)` / `var(--warning)` / `var(--gain)` via `style`.
  - Sentiment badges → `Badge` gain / loss / warning.
  - Stat sub-tiles → `rounded-lg bg-muted/40 p-3`.
- **Global Markets:** `SectionCard` + `StatCard` grid.
- **Gainers / Losers:** `SectionCard` each. Rows use `flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50`, symbol `font-medium`, name `text-xs text-muted-foreground`, and `PriceChange percent`.
- **Latest News:** `SectionCard` with `NewsCard` rows. Title `text-sm font-medium hover:text-primary`, meta `text-xs text-muted-foreground`, image `rounded-md`.
- **Popular Stocks:**
  - Sector filter buttons → segmented pills (active `bg-primary text-primary-foreground`).
  - `StockCard` → `rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20` (drop `-translate-y`).
- **Quick Links:** grid of `Button variant="outline"` with lucide icons, reusing the icons from `src/nav.js` (import `NAV_ITEMS` and pick by path, so they stay consistent).
- **Skeletons:** `SkeletonCard` → `Skeleton` blocks inside the same card frame.

When done, `grep -nE "gray-|bg-white|green-6|red-6|blue-" src/components/HomePage.jsx` should return nothing. Colors should come only from tokens. Exceptions: third-party brand colors, and data-driven colors computed in JS.

---

### Task 6: Stock Detail shell + table-style tabs

**Files:** Modify `src/components/StockDetail/StockDetailPage.jsx`, `OverviewTab.jsx`, `FinancialsTab.jsx`, `DividendsTab.jsx`, `AnalystsTab.jsx`, `HoldersTab.jsx`, `EarningsTab.jsx` and `OptionsTab.jsx`.

**`StockDetailPage`:**
- Remove `min-h-screen`. Wrap in `PageContainer`.
- **Sticky banner:** keep `sticky top-16 z-40`. Restyle to `rounded-xl border border-border bg-card/95 p-4 backdrop-blur md:p-5`.
  - Name `text-lg font-semibold`, symbol `Badge variant="outline"`, price `text-2xl font-semibold tabular-nums`.
  - Change: `PriceChange value percent showIcon`.
  - PDF button: `Button variant="secondary" size="sm"` with the lucide `FileDown` icon.
- **Tab bar:** keep the URL `?tab=` logic and the horizontal scroll. The container becomes `border-b border-border`. Each tab is `relative px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground`. The active tab is `text-foreground font-medium` with `after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary`. Add `role="tablist"`, plus `role="tab"` and `aria-selected` on each tab.
- If `StockSearch` is rendered on this page, keep it and let the restyled version apply.

**Tabs** (apply the Style Guide):
- **InfoRow / key-value grids** (`OverviewTab`, `FinancialsTab` valuation/profitability): the section is a `SectionCard`. Rows are `flex justify-between border-b border-border/60 py-2 text-sm last:border-0`, with the label `text-muted-foreground` and the value `font-medium tabular-nums`.
- **Every `<table>`** becomes shadcn `Table`: numeric cells `text-right tabular-nums`, header `text-xs uppercase tracking-wide text-muted-foreground`, and gain/loss cells use `text-gain`/`text-loss`.
- **Statement-type sub-tabs** (`FinancialsTab`) and similar small toggles become segmented pills.
- **Analyst rating bars** (`AnalystsTab`): strong buy/buy use `bg-gain`, hold `bg-warning`, sell `bg-loss`, with the track `bg-muted`.
- **Options chain** (`OptionsTab`): ITM row tint `bg-primary/5`. Calls and puts headers use `text-gain` / `text-loss`.
- **Empty and error states** inside tabs use `EmptyState` / `ErrorState`, keeping the same messages and conditions.

---

### Task 7: Stock Detail visual tabs

**Files:** Modify `src/components/StockDetail/ChartTab.jsx` (layout only; Task 4 did the colors), `TechnicalTab.jsx`, `FundamentalTab.jsx`, `PredictionTab.jsx`, `SwotTab.jsx` and `GeneratedSwot.jsx`.

- **`ChartTab`:**
  - The toolbar (timeframes, view mode, drawing tools) becomes segmented pill groups: active `bg-primary text-primary-foreground`, and `Button variant="ghost" size="sm"` for tool buttons.
  - The stats grid becomes a `StatCard` grid.
- **`TechnicalTab`:**
  - `GaugeChart` SVG: replace the hex colors with `style={{ stroke: 'var(--loss)' }}` etc. Keep the same 5 zones, mapped as `#dc2626`/`#ef4444` → `var(--loss)` (the lighter one at `opacity 0.6`), `#eab308` → `var(--warning)`, `#22c55e`/`#16a34a` → `var(--gain)` (the lighter one at `opacity 0.6`). The needle is `var(--foreground)`.
  - `SignalBadge` → `Badge` gain / loss / warning.
  - Indicator tiles → `rounded-lg border border-border bg-card p-3`.
- **`FundamentalTab`:** `ScoreRing` / `OverallScore`: the track is `var(--muted)`, and the progress uses `var(--gain)` / `var(--warning)` / `var(--loss)` with the same thresholds. `MetricRow` gets the same row styling as InfoRow in Task 6.
- **`PredictionTab`:**
  - The day selector becomes segmented pills.
  - Prediction stats become `StatCard`s.
  - Model/disclaimer text is `text-xs text-muted-foreground` inside a `rounded-lg border border-warning/30 bg-warning/5 p-3` note.
- **`SwotTab` / `GeneratedSwot`:**
  - Four quadrant cards: `rounded-xl border bg-card p-4`, with a colored top accent `border-t-2`. Strengths `border-t-gain`, Weaknesses `border-t-loss`, Opportunities `border-t-chart-2` (title `text-chart-2`), Threats `border-t-warning`.
  - Headings get a lucide icon: `TrendingUp`, `TrendingDown`, `Lightbulb`, `ShieldAlert`.
  - The iframes (if any) keep `rounded-lg border border-border`.

---

### Task 8: Verify

1. `npm test`: all tests pass.
2. `npm run lint`: 0 errors.
3. `npx vite build`: `✓ built`, then `rm -rf build`.
4. `grep -rnE "text-gray-|bg-gray-|bg-white|border-gray-|text-green-6|text-red-6" src/components/HomePage.jsx src/components/StockSearch.jsx src/components/StockDetail/` should return nothing. List any justified leftovers.
5. Hand off to the user for manual testing with the checklist below. Commit only when the user asks.

**Manual checklist (user):**
- Home in dark and light mode:
  - Indices, sentiment, global, gainers/losers, news, popular stocks and quick links all render with data.
  - No white boxes in dark mode.
  - No extra 64px scroll.
- `/stock/RELIANCE.NS` and `/stock/AAPL`:
  - The sticky banner sits under the top bar.
  - All 12 tabs render.
  - Tables read well, gain/loss colors are right, and gauges and score rings are colored.
- On the Chart tab, toggling the theme recolors the chart and keeps zoom and drawings. Single, Dual and Quad views all work.
- PDF export still downloads.
- Sparklines, if shown on Home, recolor on theme toggle.

Commit on approval:
```bash
git add -A -- . ':!backend/main.py' ':!.env'
git commit -m "feat(ui): shared UI kit, theme-aware charts, restyle Home and Stock Detail"
```

---

## Out of scope for 3a
- Every other page (3b/3c). Sparkline/StockSearch callers outside Home and Stock Detail simply inherit the restyle.
- Removing the legacy `.dark` overrides (3c).
- DataTable with sorting and CSV export (3b, for Screener).
