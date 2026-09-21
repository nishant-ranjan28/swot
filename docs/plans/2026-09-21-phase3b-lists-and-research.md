# Phase 3b: Watchlist, Portfolio, Screener, Scanner, Compare Restyle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the five list/research pages (and the Portfolio import dialog) to the token-based look from Phase 3a. Along the way, add four small shared pieces: a range bar, a sortable table head, an input, and a categorical chart palette. Behaviour stays the same.

**Architecture:**
- Reuse the Phase 3a kit and the Style Guide table in `docs/plans/2026-09-21-phase3a-common-home-stockdetail.md`. That table is the mapping source of truth.
- Each page keeps its own sort, filter and fetch logic. Presentation only changes, with one exception: `PortfolioImport` moves from a hand-rolled modal to the shadcn `Dialog`. That swap gives it a focus trap, Esc handling and a portal, and its open/close props stay the same.

**Deviation from the design doc:** the design doc planned one generic `DataTable` (sort + CSV). The pages don't share a sorting model: only the Screener sorts by column headers, while Watchlist and Portfolio sort through a select. A generic table would mean rewriting logic, so instead there's a presentational `SortableTableHead`, and the CSV export stays as it is.

**Phase 3a:** committed as `f622108`.

---

## Environment notes (read first)

Same as Phase 3a:
- `node_modules/fsevents` must NOT exist while vite or vitest runs. The backup is at `$TMPDIR/fsevents.bak`.
- Wrap commands with `perl -e 'alarm 300; exec @ARGV' <cmd>`.
- npm always gets `--cache "$TMPDIR/npm-cache"`.
- `npx shadcn` may need the sandbox off. **After any `shadcn add`**, the new file may import `cn` from an npm package called `"cn"`. Revert the `package.json`/lockfile changes, delete `node_modules/cn`, and import `cn` from `@/lib/utils`. Also remove any `"use client"` directive and any unused React import.
- Leave the dev servers (:3000 and :8000) running.
- Never stage `backend/main.py` or `.env`. Do not commit.
- **No behaviour changes:** API calls, state, effects, sort comparators, filters, CSV/PDF export, localStorage keys and calculations all stay the same. If a restyle seems to need a logic change, stop and report instead.
- Light-mode readability: never use yellow `text-primary` for readable text. Use `text-foreground dark:text-primary`. `bg-primary` fills with `text-primary-foreground` are fine.

---

### Task 1: Shared additions (TDD)

**Files:**
- Create: `src/components/common/RangeBar.jsx`, `src/components/common/SortableTableHead.jsx`
- Create (shadcn): `src/components/ui/input.jsx`
- Modify: `src/hooks/useChartTheme.js`, `src/hooks/useChartTheme.test.jsx`, `src/components/common/common.test.jsx`

**Step 1: Write the failing tests** (append to `common.test.jsx`)

```jsx
import RangeBar from './RangeBar';
import SortableTableHead from './SortableTableHead';
import { Table, TableHeader, TableRow } from '@/components/ui/table';
import { fireEvent } from '@testing-library/react';

test('RangeBar positions marker and clamps', () => {
  const { rerender } = render(<RangeBar low={100} high={200} value={150} />);
  expect(screen.getByTestId('range-marker').style.left).toBe('calc(50% - 5px)');
  rerender(<RangeBar low={100} high={200} value={250} />);
  expect(screen.getByTestId('range-marker').style.left).toBe('calc(100% - 5px)');
  rerender(<RangeBar low={100} high={100} value={100} />);
  expect(screen.getByTestId('range-marker').style.left).toBe('calc(50% - 5px)');
});

test('RangeBar renders nothing without numbers', () => {
  const { container } = render(<RangeBar low={null} high={200} value={150} />);
  expect(container).toBeEmptyDOMElement();
});

test('SortableTableHead exposes aria-sort and calls onSort', () => {
  const onSort = vi.fn();
  render(
    <Table><TableHeader><TableRow>
      <SortableTableHead active dir="asc" onSort={onSort}>Price</SortableTableHead>
      <SortableTableHead active={false} dir="asc" onSort={onSort}>P/E</SortableTableHead>
    </TableRow></TableHeader></Table>,
  );
  expect(screen.getByRole('columnheader', { name: /price/i })).toHaveAttribute('aria-sort', 'ascending');
  expect(screen.getByRole('columnheader', { name: /p\/e/i })).toHaveAttribute('aria-sort', 'none');
  fireEvent.click(screen.getByRole('button', { name: /p\/e/i }));
  expect(onSort).toHaveBeenCalledTimes(1);
});
```

Add `import { vi } from 'vitest';` if it isn't already imported.

Append this to `useChartTheme.test.jsx`:

```jsx
test('exposes a 9-color categorical palette', () => {
  function P() { return <span>{useChartTheme().palette.length}</span>; }
  render(<ThemeProvider><P /></ThemeProvider>);
  expect(screen.getByText('9')).toBeInTheDocument();
});
```

**Step 2:** Run the new tests. Expect FAIL.

**Step 3: Implement**

```jsx
// src/components/common/RangeBar.jsx
import { cn } from '@/lib/utils';

// 52-week style low–high bar with a marker at `value`.
export default function RangeBar({ low, high, value, lowLabel, highLabel, className }) {
  if (![low, high, value].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const span = high - low;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - low) / span) * 100)) : 50;
  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          data-testid="range-marker"
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
```

```jsx
// src/components/common/SortableTableHead.jsx
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export default function SortableTableHead({ active, dir, onSort, align = 'left', className, children }) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          active && 'text-foreground',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {children}
        <Icon className={cn('size-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}
```

In `useChartTheme.js`, add a `palette` to the returned object:

```js
      palette: [
        ...[1, 2, 3, 4, 5].map(i => readCssVar(`--chart-${i}`, '#888888')),
        '#ec4899', '#06b6d4', '#f97316', '#94a3b8',
      ],
```

These are fixed hues that read well on both themes. Keep `series` as it is.

**Step 4:** Run `npx shadcn@latest add input --yes`, then apply the "After any shadcn add" fix-up from the environment notes.

**Step 5:** Run the tests. Expect PASS. Then run `npm test` and expect everything to pass.

**Step 6:** Replace the local `PriceRangeBar` in `HomePage.jsx`'s `StockCard` with `RangeBar`. First check that its position math is the same as `RangeBar`'s: same clamp, and 50% when the range is zero. If it differs, keep the local one and report the difference.

---

### Task 2: Screener + Scanner

**Files:** `src/components/ScreenerPage.jsx`, `src/components/ScannerPage.jsx`

**Screener:**
- The root loses `min-h-screen bg-gray-50` and gets `PageContainer` + `PageHeader`. The CSV export button goes into `actions` as `Button variant="outline" size="sm"` with the `Download` icon. The export handler stays the same.
- The filter panel is a `SectionCard`.
  - Collapsible group headers become `button`s with `aria-expanded` and a `ChevronDown` that rotates.
  - Selects use native `<select>` with `h-9 rounded-md border border-input bg-card px-2 text-sm`.
  - Active filters get `border-primary ring-1 ring-primary/30`.
  - The AND/OR toggle and the result-size control become segmented pills with `aria-pressed`.
  - The search box becomes `Input`, and Clear becomes `Button variant="ghost" size="sm"`.
- The results table becomes shadcn `Table`.
  - Each `COLUMNS` header renders `SortableTableHead`, fed `active={sortKey===col.key}`, `dir={sortDir}` and `onSort={() => handleSort(col.key)}`. `handleSort` doesn't change.
  - The sticky first column becomes `sticky left-0 z-10 bg-card` in both the header and the cells.
  - The header row becomes `sticky top-0 z-20 bg-card`, if it was sticky before.
  - Numeric cells use `text-right tabular-nums`, and Chg% uses `PriceChange percent`.
- `RatingBadge` becomes `Badge`: Strong Buy/Buy → `gain` (Strong Buy gets an extra `bg-gain/25`), Hold → `warning`, Sell/Strong Sell → `loss`. Keep the same mapping logic.
- Error → `ErrorState`. Loading → `Skeleton` rows. Empty results → `EmptyState`, under the same conditions and with the same messages.

**Scanner:**
- `PageContainer` + `PageHeader`.
- The High/Low tabs become segmented pills: near-high active uses `bg-gain text-white`, near-low active uses `bg-loss text-white`, inactive is muted. Add `aria-pressed`.
- `StockCard` becomes `rounded-xl border border-border bg-card p-4 hover:border-foreground/20`.
  - Near-high cards add `border-l-2 border-l-gain`, and near-low cards add `border-l-2 border-l-loss`.
  - Price is `tabular-nums`, and the change is shown with `PriceChange`.
- Replace the local `PriceRangeBar` with `RangeBar`. Compare the math first, same as Task 1 Step 6.
- `SkeletonCard` becomes `Skeleton`. Error → `ErrorState`.

---

### Task 3: Watchlist + Compare

**Files:** `src/components/WatchlistPage.jsx`, `src/components/ComparePage.jsx`

**Watchlist:**
- `PageContainer` + `PageHeader` ("Watchlist"). The sort select goes into `actions` as a native select with the Input-matching classes.
- The add-stock search becomes `Input` with a dropdown: `z-40 rounded-lg border border-border bg-popover shadow-lg`, items `hover:bg-muted`. The click-outside logic stays the same.
- The alert banner becomes `rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm`, with the dismiss button as `Button variant="ghost" size="icon"` using the `X` icon and `aria-label="Dismiss"`.
- `TechnicalSignals`: replace the inline hex style with classes. Bullish → `border-gain/30 bg-gain/5`, bearish → `border-loss/30 bg-loss/5`. The type pill becomes `Badge gain/loss`, and the cards become `rounded-lg border p-3`.
- The table becomes shadcn `Table` inside a `SectionCard contentClassName="p-0"`.
  - The Change column uses `PriceChange`, and the 52W column uses `RangeBar`. Check the math against `RangeBar` first, as in Task 1 Step 6.
  - Alert High/Low inputs become `Input className="h-8 w-24 text-right tabular-nums"`. Keep the same `onChange`/`onBlur` handlers.
  - Delete becomes `Button variant="ghost" size="icon"` with `Trash2` and `aria-label={`Remove ${symbol}`}`.
  - `SkeletonRow` uses `Skeleton` cells.
- Empty watchlist → `EmptyState` (icon `Star`), with the same text and condition.
- `WatchlistNews` becomes a `SectionCard`, with the same row styling as the Home news rows.

**Compare:**
- `PageContainer` + `PageHeader`.
- `StockInput` becomes `Input` + a popover dropdown (styled as in Watchlist). The logic stays the same.
- Presets become `Button variant="outline" size="sm"`, Add Stock becomes `Button variant="ghost" size="sm"` with `Plus`, and Compare becomes `Button`.
- The comparison table becomes shadcn `Table`.
  - The sticky metric column is `sticky left-0 z-10 bg-card`.
  - Section header rows are `sticky left-0 bg-muted/60 text-xs font-semibold uppercase tracking-wide`.
  - The best-value cell is `bg-gain/10 font-semibold text-gain`.
  - Stock header links are `text-foreground hover:underline`.
- `ComparisonVerdict`:
  - The score-breakdown stacked bar maps category colors to `bg-chart-1` … `bg-chart-5` (valuation 1, profitability 2, growth 3, health 4, momentum 5). Keep the order.
  - Category winner cards become `rounded-lg border border-border bg-card p-3` with a `border-l-2` in the same chart color.
  - Amber insight text becomes `text-warning`.
- Error → `ErrorState`.

---

### Task 4: Portfolio + PortfolioImport

**Files:** `src/components/PortfolioPage.jsx` (1458 lines), `src/components/PortfolioImport.jsx`

**PortfolioPage** (go section by section, logic stays the same):
- `PageContainer` + `PageHeader` ("Portfolio"). The actions are Import (`Button variant="outline"`, `Upload` icon) and Export CSV (`Button variant="outline"`, `Download` icon). Keep the handlers.
- Summary tiles → `StatCard`, with P&L as `change`.
- The Add Holding form becomes a `SectionCard`.
  - Inputs become `Input` (the date input keeps `type="date"`), and the search dropdown is styled as in Watchlist.
  - Submit becomes `Button`, and `addError` becomes `text-sm text-loss`.
- `PieChart` canvas: replace `COLORS` with `useChartTheme().palette`. Add `palette` to the draw effect's dependencies. The center hole/background uses `ct.background` and the center text uses `ct.foreground`. `PieLegend` swatches use the same palette via `style`.
- Holdings table (desktop):
  - shadcn `Table` in a `SectionCard contentClassName="p-0"`.
  - P&L and Day Chg use `PriceChange`.
  - The Alloc % cell is a bar: `bg-primary` fill on a `bg-muted` track, with the same width math.
  - Delete becomes an icon `Button` with an `aria-label`.
  - The sort select goes into the `SectionCard` `action`.
- Mobile holding cards become `rounded-xl border border-border bg-card p-4`.
- Verdict score bars (`bg-chart-1..5`, same category order as Compare).
- `RiskAnalysis`:
  - Wrap it in a `SectionCard`. The trigger becomes `Button`, and errors → `ErrorState`.
  - `getCorrelationColor()` keeps the same thresholds and returns token classes:

    | Correlation | Classes |
    |---|---|
    | ≥ 0.7 | `bg-loss/30 text-foreground` |
    | ≥ 0.4 | `bg-loss/15` |
    | ≥ 0.1 | `bg-warning/10` |
    | ≥ -0.1 | `bg-muted` |
    | ≥ -0.4 | `bg-gain/15` |
    | otherwise | `bg-gain/30` |

    Adjust to match however many branches exist; keep every threshold.
  - Risk contribution bars use `bg-primary`.
- `OptimizePortfolio`: `SectionCard`, `Button`, and `ErrorState`. Weight bars use `bg-primary`.
- `PortfolioInsights`: each sub-block (price alerts, sector performance, analyst recs, news) becomes a `SectionCard`.
  - Sector bars use `bg-gain`/`bg-loss` by sign.
  - Recommendation labels → `Badge gain/warning/loss`.
  - News rows are styled as on Home.

**PortfolioImport:**
- Replace the fixed-inset custom modal with shadcn `Dialog`.
  - Use `open={open}` and `onOpenChange={o => { if (!o) onClose(); }}`. Match the existing prop names.
  - Wrap the content in `DialogContent className="sm:max-w-3xl"`, with `DialogHeader`/`DialogTitle`/`DialogDescription` using the existing title and description text.
  - Remove the manual Escape `keydown` effect, because Dialog handles Esc. Keep every other effect and the upload → preview state machine.
- Drop zone: `rounded-xl border-2 border-dashed border-border p-8 text-center`. While dragging it becomes `border-primary bg-primary/5`, driven by the existing drag state.
- `StatusPill` → `Badge`: valid → `gain`, warning → `warning`, error → `loss`. Same mapping.
- The preview table becomes shadcn `Table` with a `sticky top-0 bg-card` header, inside a `max-h-[50vh] overflow-auto` wrapper.
- Buttons: primary import → `Button`, destructive → `Button variant="destructive"`, cancel → `Button variant="outline"`.
- Errors: `rounded-md border border-loss/30 bg-loss/5 p-3 text-sm text-loss`.

**Test (TDD):** add `src/components/PortfolioImport.test.jsx`. Before writing it, read the component's props.
1. Render it with `open` and an `onClose` mock. Expect `getByRole('dialog')` to have the existing title as its accessible name.
2. Press Escape (`fireEvent.keyDown(document.activeElement, { key: 'Escape' })`) and expect `onClose` to have been called.
3. Run the test before the Dialog swap: the first assertion may already pass, because the old modal has aria labels. Then do the swap and run it again; it must pass.

---

### Task 5: Verify

1. Run `npm test` (all pass), `npm run lint` (0 errors), and `npx vite build` (then `rm -rf build`).
2. Run this and expect no output (list any justified leftovers):

   ```bash
   grep -nE "text-gray-|bg-gray-|bg-white|border-gray-|text-green-|text-red-|bg-green-|bg-red-|text-blue-|bg-blue-|#[0-9a-fA-F]{6}" src/components/{Screener,Scanner,Watchlist,Compare,Portfolio}Page.jsx src/components/PortfolioImport.jsx
   ```

   Allowed exceptions are data/brand colors computed in JS, if unavoidable.
3. Manual checklist for the user (dark and light mode):
   - **Screener:** filters work; clicking a column header sorts and shows the arrow; CSV downloads; the sticky first column and header stay readable while scrolling.
   - **Scanner:** the High/Low toggle works; cards are tinted by side.
   - **Watchlist:**
     - Adding and removing stocks works.
     - Alert inputs save.
     - Sort select, sparklines, range bars, technical signals and news all work.
     - With an empty watchlist, the empty state shows.
   - **Compare:** presets work, adding a 3rd/4th stock works, best values are highlighted, and the verdict bars are colored.
   - **Portfolio:**
     - Add holding works.
     - The donut and legend colors match.
     - The holdings table sorts via the select.
     - Export CSV works.
     - Risk analysis, optimize and insights all load.
     - The mobile cards show at narrow widths.
   - **Import dialog:** it opens and Esc closes it; you can drag a CSV onto it; the preview statuses are colored; import adds the holdings; focus stays inside the dialog.

Commit only when the user approves:

```bash
git add -A -- . ':!backend/main.py' ':!.env'
git commit -m "feat(ui): restyle Watchlist, Portfolio, Screener, Scanner, Compare"
```
