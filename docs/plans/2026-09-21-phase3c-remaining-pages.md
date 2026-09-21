# Phase 3c: Remaining Pages + Legacy Override Removal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the last 18 pages to the token-based look, make their canvas charts follow the theme, and then delete the legacy `.dark .x` override block from `src/index.css`. After this phase every page renders correctly in both themes from tokens alone. Behaviour does not change.

**Architecture:** This is mechanical work, driven by:
- the Style Guide table in `docs/plans/2026-09-21-phase3a-common-home-stockdetail.md`
- the shared kit in `src/components/common/` (PageContainer, PageHeader, SectionCard, StatCard, PriceChange, RangeBar, SortableTableHead, EmptyState, ErrorState)
- the shared `ui/` pieces (Table, Badge gain/loss/warning, Button, Input, Skeleton, Dialog)
- `useChartTheme()`, which provides `gain`, `loss`, `text`, `grid`, `background`, `foreground`, `primary`, `warning`, `palette`, `series`, `gainArea` and `lossArea`.

**Phase 3b:** committed as `304a288`.

---

## Environment notes (read first)

- `node_modules/fsevents` must NOT exist when vite or vitest runs. The backup is at `$TMPDIR/fsevents.bak`.
- Wrap commands with `perl -e 'alarm 300; exec @ARGV' <cmd>`.
- Always pass `--cache "$TMPDIR/npm-cache"` to npm. Don't run `npx shadcn` in this phase; no new ui components are needed.
- Leave the dev servers on :3000 and :8000 running.
- Do not commit, and do not run `git stash` or anything else that rewrites the working tree.
- Never touch `backend/`, `backend/main.py` or `.env`.
- **No behaviour changes.** Fetches, state, effects, calculations (SIP, EMI, tax, backtest and so on), thresholds, localStorage keys and export logic stay the same. If a restyle seems to need a logic change, stop and report it.
- **Light-mode readability:**
  - Never use yellow `text-primary` for readable text. Use `text-foreground dark:text-primary`.
  - `bg-primary` fills are fine, paired with `text-primary-foreground`.
  - `chart-1` (yellow) is for fills and borders only.

## Common rules for every page in this phase

1. **Root:** remove `min-h-screen` and `bg-gray-50`. Use `PageContainer` + `PageHeader` with the same title and description text.
2. **Colors:** apply the Style Guide table. When you're done, the page should have no `gray-`, `bg-white`, or raw `green-`/`red-`/`blue-`/`amber-`/`yellow-`/`purple-`/`orange-`/`indigo-`/`emerald-`/`cyan-`/`pink-`/`rose-`/`teal-`/`slate-` classes, and no hex values. Exceptions:
   - data or brand colors computed in JS, for example a crypto logo color from the API
   - color scales that are hard to express as tokens (report these)
3. **Remove redundant `dark:` classes.** Once a class is a token (`bg-card`, `text-muted-foreground`), its `dark:` twin is redundant. Remove it.
4. **Categorical colors:** when the old code picks from a list of Tailwind colors per category or series, map them to `bg-chart-1..5` in order. Beyond 5, use `useChartTheme().palette` via `style`. Keep the same ordering and assignment logic.
5. **Canvas charts:**
   - Call `const ct = useChartTheme();` and replace every hardcoded color with a token:
     - grid → `ct.grid`
     - axis/label text → `ct.text`
     - background → `ct.background`
     - up/positive → `ct.gain`, down/negative → `ct.loss` (area fills `ct.gainArea` / `ct.lossArea`)
     - neutral series line → `ct.primary`
     - multi-series → `ct.palette[i]`
   - Add `ct` to the draw effect's dependencies.
   - Keep hi-DPI scaling and all the math exactly as it is.
   - If the canvas draws text or points in yellow on a light background, use `ct.isDark ? ct.primary : ct.foreground` instead.
6. **Heatmap color scales** (Sector Heatmap, FII/DII if present): keep every threshold. Map intensity steps to the gain or loss color with rising alpha:
   - three steps per side (weak / mid / strong):
     - canvas: `withAlpha(ct.gain, 0.45 | 0.7 | 0.9)`, from `@/lib/color`
     - DOM: `bg-gain/45`, `/70`, `/90` (and the same for `loss`)
   - neutral band: `ct.grid` / `bg-muted`
   - Text on strong tiles is `text-white`; text on weak tiles is `text-foreground`.
7. **Inline heroicon `<svg>` icons:** replace them with the closest lucide icon (`Search`, `ExternalLink`, `Info`, `AlertTriangle`, `Newspaper`, `Calculator`, `X`, `ChevronDown` and so on), with `aria-hidden` and the same size classes (`size-4`, …).
8. **Controls:**
   - tabs and toggles → segmented pills with `aria-pressed` and `type="button"`
   - text/number inputs → `Input` (keep the same `value`/`onChange`/`min`/`max`/`step`)
   - selects → native `<select>` with `selectClass` from `@/lib/select` (matches `Input`); use `cn(selectClass, extra)` for extras such as `w-full`
   - range sliders → keep native `<input type="range">` and add `accent-primary`
   - buttons → `Button` variants
9. **Tables** → shadcn `Table`: numeric cells `text-right tabular-nums`, change cells `PriceChange`, sticky columns `bg-card`.
10. **Summary tiles** → `StatCard`. Sections → `SectionCard`. Loading → `Skeleton`. Errors → `ErrorState` (keep retry handlers). Empty → `EmptyState` (keep the same messages and conditions).
11. **Stacking:** any page dropdown uses `z-40`. Don't put `z-*` on cards unless a dropdown needs it; if it does, use `relative z-20`.

For each page, when done, run the color grep scoped to that page and report any leftovers:

```bash
grep -nE "gray-|bg-white|(text|bg|border|from|via|to|ring)-(green|red|blue|amber|yellow|purple|orange|indigo|emerald|cyan|pink|rose|teal|slate|lime|sky|violet|fuchsia)-|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b" <file>
```

---

### Task 1: Markets pages

Files: `CryptoPage.jsx` (canvas), `CommoditiesPage.jsx`, `ForexPage.jsx`, `MacroPage.jsx` (canvas), `SectorHeatmapPage.jsx` (2 canvases: treemap + chart).

- Price tiles → `StatCard` with `change`. Crypto coin rows → `Table` or `StatCard` grid, following the existing layout.
- Forex converter inputs → `Input` / `select`. (There is no swap button.)
- Commodities and Forex price tiles → `SelectableTile` (`@/components/common/SelectableTile`) wrapping `StatCard`, with `TileSkeleton` while loading.
- Macro yield curve canvas → the chart rules (rule 5). The dollar index is a quote tile, not a canvas.
- Sector Heatmap:
  - treemap canvas → the heatmap rule (rule 6)
  - table view → `Table` with `PriceChange`
  - view toggle (treemap/table, NIFTY/S&P) → pills

### Task 2: Funds + Backtest

Files: `MutualFundPage.jsx` (659 lines, canvas NAV chart), `EtfPage.jsx`, `BacktestPage.jsx` (canvas equity curve plus an inline svg).

- MF search → `Input` + dropdown (`z-40`, as in Watchlist).
- Category tabs → pills.
- Top funds and holdings tables → `Table`.
- Overlap checker results → `SectionCard` with `StatCard`s (overlap %, common stocks). The code has no overlap thresholds, so there is no gain/warning/loss badge.
- NAV chart → rule 5.
- Returns → `PriceChange percent`.
- ETF: the same patterns, plus the holdings breakdown bars → `bg-chart-N` / palette.
- Backtest:
  - strategy form → `Input`/`select`/`Button`
  - metrics → `StatCard` (return via `change`)
  - equity curve → rule 5 (strategy line `ct.primary`, or `ct.foreground` in light mode). There is no benchmark line.
  - trade log → `Table` with buy/sell `Badge gain/loss`

### Task 3: Intelligence pages

Files: `NewsPage.jsx`, `TrendingPage.jsx`, `FiiDiiPage.jsx` (canvas), `DealsPage.jsx`, `EarningsCalendarPage.jsx`, `EconomicCalendarPage.jsx`, `IpoPage.jsx`.

- **News:**
  - search → `Input` with a `Search` icon
  - there is no sentiment filter; sentiment appears only as a per-article badge
  - cards → `rounded-xl border border-border bg-card`, same row style as Home news
  - sentiment → `Badge gain/warning/loss`
- **Trending:**
  - mention counts → `Badge secondary`
  - sentiment → `Badge`
  - lists → `SectionCard`
- **FII/DII:**
  - net flow tiles → `StatCard` (positive net → gain, negative → loss, via `text-gain`/`text-loss` on the value)
  - flow chart → rule 5 (buy → gain, sell → loss bars)
  - table → `Table`
- **Deals:** insider search → `Input` + dropdown; the table's buy/sell → `Badge gain/loss`.
- **Earnings and Economic calendars:**
  - date group headers → `text-xs font-semibold uppercase tracking-wide text-muted-foreground`
  - event cards → `rounded-lg border border-border bg-card p-3`
  - importance/impact → `Badge warning/loss/secondary`
  - countdown → `tabular-nums`
  - remove all `dark:` classes
- **IPO:** tables → `Table`; listing and current gain cells → `PriceChange percent decimals={1}`. The IPO data has no status field, so there is no status badge.

### Task 4: Tools pages

Files: `CalculatorPage.jsx` (848 lines, canvas), `TaxCalculatorPage.jsx`, `GlossaryPage.jsx`.

- **Calculator:**
  - calculator type tabs (SIP, Lumpsum, Compare (SIP vs Lumpsum), CAGR, Goal, EMI, Compound Interest) → pills with `aria-pressed`; wrap them on mobile
  - inputs → `Input` (there are no sliders)
  - results → `StatCard`
  - breakdown canvas (invested vs returns) → rule 5, with invested → `ct.palette[1]` or `ct.text` and returns → `ct.gain`
  - the category legend matches the canvas colors
- **Tax Calculator:**
  - form → `Input`/`select`
  - result tiles → `StatCard`
  - STCG/LTCG breakdown → `Table`
  - info/disclaimer → warning note: `rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm`, with an `AlertTriangle` icon
- **Glossary:**
  - search → `Input`
  - category pills → pills
  - term cards → `rounded-lg border border-border bg-card p-4`
  - remove `dark:` classes

### Task 5: Remove legacy overrides + global sweep

**Files:** `src/index.css`, and any file under `src/` the sweep flags.

1. Run the color grep from "Common rules" across `src/components src/*.jsx`. Exclude `src/components/ui/` (shadcn-generated) and `src/hooks/useChartTheme.js` (palette hexes). Fix any leftovers, including in `common/`, `layout/`, `ErrorFallback.jsx`, `LoadingSpinner.jsx`, `StockSearch.jsx` and `PriceChart.jsx`. List any justified exceptions.
2. Run `grep -rn "dark:" src --include=*.jsx | grep -v "components/ui/"`. Every remaining `dark:` must be intentional: the `text-foreground dark:text-primary` link pattern, or a yellow swap. Remove any that are redundant.
3. Delete the whole `/* Legacy dark overrides … */` block from `src/index.css`: every `.dark .bg-white`, `.dark .text-gray-*`, `.dark :is(input…)`, `.dark .shadow-*`, `.dark table …`, `.dark .bg-*-50` and `.dark .min-h-screen` rule. Keep the scrollbar styles, the base layer and the `.tradingview-*` rules. Check whether any `.tradingview-*` markup still exists (`grep -rn tradingview src`), and delete those rules too if nothing uses them.
4. Run `grep -rn "min-h-screen" src/components`. It must be empty, except inside `layout/AppShell.jsx`.
5. Run `npm test`, `npm run lint` and `npx vite build`.

---

### Verification (every task)

- `npm test` passes (report the counts), `npm run lint` reports 0 errors, and `npx vite build` succeeds (then `rm -rf build`).
- The per-page color grep is empty, or the report justifies each hit.
- `curl localhost:3000/` returns 200.

### Manual checklist (user, after Task 5), in both themes

- Visit every sidebar page. None should have a white box in dark mode or gray-on-gray text. Buttons, inputs, selects and tables should all look consistent.
- Each chart should recolor when the theme toggles: Crypto, Macro yield curve, Sector Heatmap (both views), MF NAV, Backtest equity, FII/DII, Calculator.
- Calculator: every calculator type computes the same numbers as before.
- Tax: the example inputs give the same numbers as before.
- Forex converter, MF overlap checker and the backtest run all still work.

Commit when the user approves:

```bash
git add -A -- . ':!backend/main.py' ':!.env'
git commit -m "feat(ui): restyle remaining pages and drop legacy dark overrides"
```
