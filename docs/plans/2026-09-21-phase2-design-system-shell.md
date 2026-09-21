# Phase 2: Design System + App Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move to Tailwind 4, add shadcn/ui and OpenStock-style theme tokens, and replace the top `Header` with a collapsible sidebar, a top bar, and a ⌘K command palette. Page contents stay untouched; Phase 3 restyles them.

**Architecture:**
- Tailwind 4 runs through `@tailwindcss/vite`. All config lives in CSS (`src/index.css`): the `@theme` block plus shadcn CSS variables for light and dark.
- `ThemeContext` puts `.dark` on `<html>`. It no longer uses a wrapper `<div>`, because shadcn portals (dialogs, dropdowns) render into `<body>` and need the variables there too.
- The legacy `.dark .bg-white {…}` overrides are remapped to the new tokens, so old pages already pick up the new dark palette.
- Navigation has one source of truth, `src/nav.js`, which feeds the sidebar, the command palette and a route/nav consistency test.
- Routes move from inline JSX in `App.jsx` into `src/routes.jsx`.

**Tech Stack:** Tailwind CSS 4, @tailwindcss/vite, shadcn/ui (JS, `tsx: false`), Radix UI, lucide-react, cmdk, sonner, class-variance-authority, clsx, tailwind-merge, tw-animate-css, @fontsource-variable/inter.

**Design doc:** `docs/plans/2026-09-21-openstock-revamp-design.md` (Phase 2 of 6). Phase 1 is committed as `c191e0a`.

---

## Environment notes (read first)

- **fsevents hang:** on this Mac, loading `node_modules/fsevents` hangs node. For every vite, vitest or tailwind CLI command, run `mv node_modules/fsevents "$TMPDIR/fsevents.bak"` first and move it back afterwards, even if the command fails. Wrap long commands with `perl -e 'alarm 300; exec @ARGV' <cmd>`. If a dev server is already running with fsevents moved aside, the folder may already be in `$TMPDIR/fsevents.bak`, so check before moving.
- **npm:** always pass `--cache "$TMPDIR/npm-cache"`. The sandbox can't write `~/.npm`. `npm install` may reinstall `node_modules/fsevents`. That is fine; just apply the move-aside rule again.
- **Network CLIs** (`npx shadcn`, `npx @tailwindcss/upgrade`) may need network access beyond the sandbox. If they fail with a network or certificate error, retry them with the sandbox disabled.
- **Never** stage `backend/main.py` or `.env`. Do not commit; the user tests first.
- **Dev servers:** the user may have `vite` on :3000 and uvicorn on :8000 running. Don't kill them. Use `npx vite build` to verify.

---

### Task 1: Upgrade Tailwind 3 → 4

**Files:**
- Modify: `package.json`
- Modify: `src/App.css`
- Modify: `src/index.css`
- Modify: every `src/**/*.jsx` that uses renamed utilities (the tool edits these)
- Delete: `tailwind.config.js`, `postcss.config.js`
- Modify: `vite.config.mjs`

**Step 1: Run the official upgrade tool**

```bash
npx @tailwindcss/upgrade --force
```

`--force` is needed because `backend/main.py` makes the tree dirty. The tool does four things:
- Renames utilities (`shadow-sm`→`shadow-xs`, `rounded`→`rounded-sm`, `ring`→`ring-3`, `outline-none`→`outline-hidden`, `flex-shrink-0`→`shrink-0`, and so on).
- Turns `tailwind.config.js` into CSS `@theme`.
- Replaces `@tailwind base/components/utilities` with `@import "tailwindcss"`.
- Adds a border-color compatibility block.

Review `git diff --stat`. Expect many `.jsx` files with class renames and no logic changes.

**Step 2: Consolidate the CSS entry**

- `src/index.css` becomes the single stylesheet.
- Move everything from `src/App.css` into `src/index.css`, after the `@import "tailwindcss"` line.
- Delete the `import './App.css'` line in `src/App.jsx` and `git rm src/App.css`.
- Make sure `src/index.jsx` still imports `./index.css`.
- If the old CSS set `overflow-x: hidden` on `html`/`body`, change it to `overflow-x: clip`. `hidden` turns `body` into a scroll container and breaks every `position: sticky` (sidebar, TopBar, StockDetail `sticky top-16`); `clip` stops horizontal overflow without creating one.
- Check that the custom config the tool converted survived as `@theme` entries in `index.css`: the `xs` and `3xl` breakpoints, the `8xl` and `9xl` max-widths, and the `fade-in` and `slide-up` animations with their keyframes.

**Step 3: Switch to the Vite plugin**

```bash
npm uninstall postcss postcss-import autoprefixer tailwindcss @tailwindcss/postcss --cache "$TMPDIR/npm-cache"
npm install -D tailwindcss@^4 @tailwindcss/vite --cache "$TMPDIR/npm-cache"
git rm -f postcss.config.js tailwind.config.js 2>/dev/null; rm -f postcss.config.mjs
```

Remove the `browserslist` block from `package.json`. Autoprefixer was its only user, and Tailwind 4 handles prefixing through Lightning CSS.

Edit `vite.config.mjs`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // ...rest unchanged
```

`import.meta.dirname` needs Node ≥ 20.11. Node 22 or later is already required, so that is fine.

**Step 4: Restore preflight behaviour that changed in Tailwind 4**

Add this to `src/index.css` after the imports:

```css
@layer base {
  button:not(:disabled), [role='button']:not(:disabled) { cursor: pointer; }
  input::placeholder, textarea::placeholder { color: var(--color-gray-400); }
}
```

**Step 5: Verify**

Run: `npx vite build 2>&1 | tail -5`. Expect `✓ built`.
Run: `npm test`. Expect 2 passed.

Then open http://localhost:3000 (the dev server hot-reloads) and spot-check four pages in light mode and in dark mode: `/`, `/stock/RELIANCE.NS`, `/screener` and `/calculator`. They should look the same as before, give or take a pixel. If something differs a lot, look for a utility rename the tool missed (a common one is `bg-opacity-*` → `bg-black/50`).

---

### Task 2: jsconfig and shadcn init

**Files:** Create `jsconfig.json` and `components.json`. Modify `src/index.css` and `package.json`.

**Step 1: Create `jsconfig.json`**

The shadcn CLI and editors read it to resolve the `@/` import alias.

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

**Step 2: Create `components.json` by hand, so the CLI doesn't ask questions**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 3: Add the base components**

```bash
npx shadcn@latest add button dropdown-menu sheet command dialog tooltip separator sonner badge card skeleton scroll-area --yes
```

The CLI should do three things:
- Create `src/lib/utils.js`, which exports `cn`, and the `.jsx` components under `src/components/ui/`.
- Install the Radix packages, `cmdk`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` and `sonner`.
- Append `:root` and `.dark` variable blocks to `src/index.css`.

If the CLI can't reach its registry even with the sandbox off, stop and report back. Don't hand-write the components.

**Step 4:** `sonner.jsx` from shadcn imports `useTheme` from `next-themes`. Replace that import with the app's own theme hook:

```jsx
import { useTheme } from '@/context/ThemeContext';
// ...
const { theme } = useTheme();
```

Then remove `next-themes` if the CLI installed it: `npm uninstall next-themes --cache "$TMPDIR/npm-cache"`.

**Step 5: Install the font**

Run: `npm install @fontsource-variable/inter --cache "$TMPDIR/npm-cache"`. Then add `import '@fontsource-variable/inter';` to `src/index.jsx`, above the `./index.css` import.

**Step 6: Verify**

Run: `npx vite build 2>&1 | tail -3`. Expect `✓ built`.

---

### Task 3: Theme tokens

**Files:** Modify `src/index.css`. Replace the `:root` and `.dark` blocks that shadcn generated.

Keep the `@import "tailwindcss"; @import "tw-animate-css";` lines and the `@custom-variant dark (&:is(.dark *));` line that shadcn generated. If the upgrade tool wrote a `@variant dark` / `@custom-variant` line, keep exactly **one**, using `&:where(.dark, .dark *)`.

Replace the variable blocks with the following. Keep the `@theme inline { --color-…: var(--…) }` mapping that shadcn generated, and add the `gain`, `loss` and `font` lines to it.

```css
:root {
  --radius: 0.625rem;
  --background: #fafafa;
  --foreground: #0b0b0c;
  --card: #ffffff;
  --card-foreground: #0b0b0c;
  --popover: #ffffff;
  --popover-foreground: #0b0b0c;
  --primary: #eab308;
  --primary-foreground: #0b0b0c;
  --secondary: #f2f2f3;
  --secondary-foreground: #18181b;
  --muted: #f2f2f3;
  --muted-foreground: #6b6b73;
  --accent: #f2f2f3;
  --accent-foreground: #18181b;
  --destructive: #dc2626;
  --border: #e4e4e7;
  --input: #e4e4e7;
  --ring: #eab308;
  --gain: #16a34a;
  --loss: #dc2626;
  --chart-1: #eab308; --chart-2: #0ea5e9; --chart-3: #8b5cf6; --chart-4: #f97316; --chart-5: #14b8a6;
  --sidebar: #ffffff;
  --sidebar-foreground: #3f3f46;
  --sidebar-primary: #eab308;
  --sidebar-primary-foreground: #0b0b0c;
  --sidebar-accent: #f2f2f3;
  --sidebar-accent-foreground: #0b0b0c;
  --sidebar-border: #e4e4e7;
  --sidebar-ring: #eab308;
}

.dark {
  --background: #0b0b0c;
  --foreground: #ededee;
  --card: #141416;
  --card-foreground: #ededee;
  --popover: #141416;
  --popover-foreground: #ededee;
  --primary: #fdd458;
  --primary-foreground: #0b0b0c;
  --secondary: #1c1c1f;
  --secondary-foreground: #ededee;
  --muted: #1c1c1f;
  --muted-foreground: #9a9aa3;
  --accent: #1f1f23;
  --accent-foreground: #ededee;
  --destructive: #ef4444;
  --border: #26262b;
  --input: #26262b;
  --ring: #fdd458;
  --gain: #22c55e;
  --loss: #ef4444;
  --chart-1: #fdd458; --chart-2: #38bdf8; --chart-3: #a78bfa; --chart-4: #fb923c; --chart-5: #2dd4bf;
  --sidebar: #0f0f11;
  --sidebar-foreground: #a1a1aa;
  --sidebar-primary: #fdd458;
  --sidebar-primary-foreground: #0b0b0c;
  --sidebar-accent: #1c1c1f;
  --sidebar-accent-foreground: #ededee;
  --sidebar-border: #1f1f23;
  --sidebar-ring: #fdd458;
}

/* add inside the existing @theme inline { ... } block */
  --color-gain: var(--gain);
  --color-loss: var(--loss);
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;

@layer base {
  * { @apply border-border outline-ring/50; }
  html { overflow-x: clip; }
  body { @apply bg-background text-foreground antialiased; font-feature-settings: 'cv11', 'ss01'; overflow-x: clip; }
  .tabular { font-variant-numeric: tabular-nums; }
}
```

**Remap the legacy dark overrides** (the block that came over from App.css) onto the tokens, so old pages match the new palette:

```css
/* Legacy dark overrides — removed page by page in Phase 3 */
.dark .min-h-screen, .dark .bg-gray-50 { background-color: var(--background); }
.dark .bg-white { background-color: var(--card); }
.dark .bg-gray-100 { background-color: var(--muted); }
.dark .text-gray-900 { color: var(--foreground); }
.dark .text-gray-800 { color: #d4d4d8; }
.dark .text-gray-700 { color: #c4c4cc; }
.dark .text-gray-600, .dark .text-gray-500, .dark .text-gray-400 { color: var(--muted-foreground); }
.dark .border-gray-100, .dark .border-gray-200 { border-color: var(--border); }
.dark .shadow-xs, .dark .shadow-sm { box-shadow: 0 1px 2px rgb(0 0 0 / 0.5); }
.dark .shadow-lg { box-shadow: 0 4px 12px rgb(0 0 0 / 0.6); }
.dark input, .dark select, .dark textarea { background-color: var(--muted); color: var(--foreground); border-color: var(--border); }
.dark input::placeholder, .dark textarea::placeholder { color: var(--muted-foreground); }
.dark table thead { background-color: var(--card); }
.dark table tbody tr:hover { background-color: color-mix(in srgb, var(--accent) 60%, transparent); }
.dark .bg-blue-50, .dark .bg-blue-50\/50 { background-color: rgb(59 130 246 / 0.1); }
.dark .bg-green-50 { background-color: rgb(22 163 74 / 0.1); }
.dark .bg-red-50 { background-color: rgb(220 38 38 / 0.1); }
.dark .bg-amber-50 { background-color: rgb(245 158 11 / 0.1); }
```

Also do the following:
- Set the webkit scrollbar colors to `var(--muted)` for the track and `var(--border)` for the thumb.
- Remove the old `button:focus, input:focus { outline: 2px solid #3b82f6 }` rule, because `outline-ring/50` replaces it.
- Leave the `.dark .shadow-sm` naming as it is if the upgrade tool already renamed utilities; the rules above cover both names.

Verify with `npx vite build`, then check `/` and `/screener` in dark mode.

---

### Task 4: ThemeContext on `<html>`, dark by default (TDD)

**Files:**
- Modify: `src/context/ThemeContext.jsx`
- Create: `src/context/ThemeContext.test.jsx`

**Step 1: Write the failing test**

```jsx
// src/context/ThemeContext.test.jsx
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

test('defaults to dark and puts class on <html>', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByRole('button')).toHaveTextContent('dark');
  expect(document.documentElement).toHaveClass('dark');
});

test('respects stored light preference and toggles', () => {
  localStorage.setItem('stockpulse_theme', JSON.stringify('light'));
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(document.documentElement).not.toHaveClass('dark');
  act(() => screen.getByRole('button').click());
  expect(document.documentElement).toHaveClass('dark');
  expect(JSON.parse(localStorage.getItem('stockpulse_theme'))).toBe('dark');
});
```

Before writing the test, check how `useLocalStorage` serializes values; the test assumes `JSON.stringify`.

**Step 2:** Run `npx vitest run src/context/ThemeContext.test.jsx`. Expect a FAIL, because the default is 'light' and the class sits on the wrapper div.

**Step 3: Implement**

```jsx
// src/context/ThemeContext.jsx
import React, { createContext, useContext, useLayoutEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('stockpulse_theme', 'dark');
  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

**Step 4: Prevent a light flash before React mounts**

Add this inline script in `index.html` `<head>`, before any stylesheet:

```html
<script>
  try {
    var t = JSON.parse(localStorage.getItem('stockpulse_theme') || '"dark"');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) { document.documentElement.classList.add('dark'); }
</script>
```

Also change `<meta name="theme-color">` to `#0b0b0c`.

**Step 5:** Run `npm test`. Expect all tests to pass.

---

### Task 5: Route table and nav config (TDD)

**Files:**
- Create: `src/routes.jsx`
- Create: `src/nav.js`
- Create: `src/nav.test.js`
- Modify: `src/App.jsx`

**Step 1: Create `src/routes.jsx`**

Move every page import out of `App.jsx` into this file and export a route list. `MarketHomePage` stays in `App.jsx`, so the `/in` and `/us` routes are declared in App.

```jsx
// src/routes.jsx
import HomePage from './components/HomePage';
import StockDetailPage from './components/StockDetail/StockDetailPage';
// ...every other page import currently in App.jsx...

export const PAGE_ROUTES = [
  { path: '/', element: <HomePage /> },
  { path: '/stock/:symbol', element: <StockDetailPage /> },
  { path: '/watchlist', element: <WatchlistPage /> },
  { path: '/portfolio', element: <PortfolioPage /> },
  { path: '/compare', element: <ComparePage /> },
  { path: '/screener', element: <ScreenerPage /> },
  { path: '/scanner', element: <ScannerPage /> },
  { path: '/calculator', element: <CalculatorPage /> },
  { path: '/backtest', element: <BacktestPage /> },
  { path: '/crypto', element: <CryptoPage /> },
  { path: '/commodities', element: <CommoditiesPage /> },
  { path: '/forex', element: <ForexPage /> },
  { path: '/earnings-calendar', element: <EarningsCalendarPage /> },
  { path: '/glossary', element: <GlossaryPage /> },
  { path: '/economic-calendar', element: <EconomicCalendarPage /> },
  { path: '/sector-heatmap', element: <SectorHeatmapPage /> },
  { path: '/tax', element: <TaxCalculatorPage /> },
  { path: '/ipo', element: <IpoPage /> },
  { path: '/deals', element: <DealsPage /> },
  { path: '/fii-dii', element: <FiiDiiPage /> },
  { path: '/macro', element: <MacroPage /> },
  { path: '/mutual-funds', element: <MutualFundPage /> },
  { path: '/etf', element: <EtfPage /> },
  { path: '/trending', element: <TrendingPage /> },
  { path: '/news', element: <NewsPage /> },
];
```

**Step 2: Create `src/nav.js`**

```js
// src/nav.js
import {
  LayoutDashboard, Bitcoin, Gem, ArrowLeftRight, Globe,
  Filter, ScanSearch, GitCompare, Grid3x3, History,
  PiggyBank, Layers,
  Newspaper, Flame, Landmark, Handshake, CalendarCheck, CalendarDays, Rocket,
  Star, Briefcase,
  Calculator, Receipt, BookOpen,
} from 'lucide-react';

export const NAV_GROUPS = [
  { label: 'Markets', items: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/crypto', label: 'Crypto', icon: Bitcoin },
    { to: '/commodities', label: 'Commodities', icon: Gem },
    { to: '/forex', label: 'Forex', icon: ArrowLeftRight },
    { to: '/macro', label: 'Macro', icon: Globe },
  ]},
  { label: 'Research', items: [
    { to: '/screener', label: 'Screener', icon: Filter },
    { to: '/scanner', label: '52W Scanner', icon: ScanSearch },
    { to: '/compare', label: 'Compare', icon: GitCompare },
    { to: '/sector-heatmap', label: 'Sector Heatmap', icon: Grid3x3 },
    { to: '/backtest', label: 'Backtest', icon: History },
  ]},
  { label: 'Funds', items: [
    { to: '/mutual-funds', label: 'Mutual Funds', icon: PiggyBank },
    { to: '/etf', label: 'ETFs', icon: Layers },
  ]},
  { label: 'Intelligence', items: [
    { to: '/news', label: 'News', icon: Newspaper },
    { to: '/trending', label: 'Trending', icon: Flame },
    { to: '/fii-dii', label: 'FII / DII', icon: Landmark },
    { to: '/deals', label: 'Insider Deals', icon: Handshake },
    { to: '/earnings-calendar', label: 'Earnings', icon: CalendarCheck },
    { to: '/economic-calendar', label: 'Economic Calendar', icon: CalendarDays },
    { to: '/ipo', label: 'IPOs', icon: Rocket },
  ]},
  { label: 'My Stuff', items: [
    { to: '/watchlist', label: 'Watchlist', icon: Star },
    { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  ]},
  { label: 'Tools', items: [
    { to: '/calculator', label: 'Calculators', icon: Calculator },
    { to: '/tax', label: 'Tax Calculator', icon: Receipt },
    { to: '/glossary', label: 'Glossary', icon: BookOpen },
  ]},
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// '/' is active on stock pages too (they are reached from Home/search)
export function isNavActive(to, pathname) {
  if (to === '/') return pathname === '/' || pathname === '/in' || pathname === '/us' || pathname.startsWith('/stock/');
  return pathname === to || pathname.startsWith(`${to}/`);
}
```

**Step 3: Write the test**

```js
// src/nav.test.js
import { NAV_ITEMS, isNavActive } from './nav';
import { PAGE_ROUTES } from './routes';

const NON_NAV = new Set(['/stock/:symbol']);

test('every page route appears in nav exactly once', () => {
  const navPaths = NAV_ITEMS.map(i => i.to);
  expect(new Set(navPaths).size).toBe(navPaths.length);
  for (const { path } of PAGE_ROUTES) {
    if (!NON_NAV.has(path)) expect(navPaths).toContain(path);
  }
});

test('every nav item points at a real route', () => {
  const routePaths = PAGE_ROUTES.map(r => r.path);
  for (const { to } of NAV_ITEMS) expect(routePaths).toContain(to);
});

test('isNavActive', () => {
  expect(isNavActive('/', '/stock/AAPL')).toBe(true);
  expect(isNavActive('/', '/us')).toBe(true);
  expect(isNavActive('/', '/screener')).toBe(false);
  expect(isNavActive('/screener', '/screener')).toBe(true);
});
```

**Step 4:** Run `npx vitest run src/nav.test.js`. Expect it to pass. If a lucide icon name doesn't exist in the installed version, the import fails; swap in the nearest icon that exists.

**Step 5: Use the route table in `App.jsx`**

```jsx
<Routes>
  <Route path="/in" element={<MarketHomePage />} />
  <Route path="/us" element={<MarketHomePage />} />
  {PAGE_ROUTES.map(r => <Route key={r.path} path={r.path} element={r.element} />)}
</Routes>
```

Remove the per-page imports from `App.jsx`. `HomePage` is still needed there for `MarketHomePage`.

---

### Task 6: Sidebar, TopBar, CommandPalette, AppShell (TDD)

**Files:**
- Create: `src/components/layout/AppShell.jsx`
- Create: `src/components/layout/Sidebar.jsx`
- Create: `src/components/layout/TopBar.jsx`
- Create: `src/components/layout/CommandPalette.jsx`
- Create: `src/components/layout/AppShell.test.jsx`

**Step 1: Write the failing tests**

```jsx
// src/components/layout/AppShell.test.jsx
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import AppShell from './AppShell';
import { MarketProvider } from '../../context/MarketContext';
import { ThemeProvider } from '../../context/ThemeContext';

vi.mock('../../api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { results: [{ name: 'Apple Inc.', symbol: 'AAPL' }] } })) },
  API_BASE_URL: '',
}));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MarketProvider>
        <ThemeProvider>
          <AppShell>
            <Routes><Route path="*" element={<Where />} /></Routes>
          </AppShell>
        </ThemeProvider>
      </MarketProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());

test('sidebar shows groups and marks active link', () => {
  renderShell('/screener');
  const nav = screen.getByRole('navigation', { name: /main/i });
  expect(within(nav).getByText('Research')).toBeInTheDocument();
  expect(within(nav).getByRole('link', { name: /screener/i })).toHaveAttribute('aria-current', 'page');
});

test('sidebar collapse persists', () => {
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
  expect(JSON.parse(localStorage.getItem('stockpulse_sidebar_collapsed'))).toBe(true);
});

test('cmd+k opens palette, selecting a page navigates', async () => {
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  const input = await screen.findByPlaceholderText(/search stocks or pages/i);
  fireEvent.change(input, { target: { value: 'glossary' } });
  fireEvent.click(await screen.findByRole('option', { name: /glossary/i }));
  expect(screen.getByTestId('where')).toHaveTextContent('/glossary');
});

test('palette stock search navigates to stock page', async () => {
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  fireEvent.change(await screen.findByPlaceholderText(/search stocks or pages/i), { target: { value: 'apple' } });
  fireEvent.click(await screen.findByRole('option', { name: /AAPL/ }, { timeout: 2000 }));
  expect(screen.getByTestId('where')).toHaveTextContent('/stock/AAPL');
});

test('market toggle switches market', () => {
  renderShell('/');
  fireEvent.click(screen.getByRole('button', { name: 'US' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/us');
});
```

cmdk and Radix need jsdom stubs. Add these to `src/setupTests.js` if the tests fail on them:

```js
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView ||= function () {};
Element.prototype.hasPointerCapture ||= () => false;
Element.prototype.releasePointerCapture ||= () => {};
```

**Step 2:** Run `npx vitest run src/components/layout`. Expect a FAIL, because the modules don't exist yet.

**Step 3: Implement `Sidebar.jsx`**

```jsx
// src/components/layout/Sidebar.jsx
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Activity } from 'lucide-react';
import { NAV_GROUPS, isNavActive } from '@/nav';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

export function SidebarNav({ collapsed = false, onNavigate }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-2 py-4">
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: Icon }) => {
              const active = isNavActive(to, pathname);
              const link = (
                <Link
                  to={to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', active && 'text-sidebar-primary')} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              );
              return (
                <li key={to}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  ) : link}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Brand({ collapsed }) {
  return (
    <Link to="/" aria-label="StockPulse home" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Activity className="size-4" />
      </span>
      {!collapsed && <span>StockPulse</span>}
    </Link>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex',
        'transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <Brand collapsed={collapsed} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SidebarNav collapsed={collapsed} />
      </ScrollArea>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex h-11 items-center justify-center border-t border-sidebar-border text-muted-foreground hover:text-foreground"
      >
        <Toggle className="size-4" />
      </button>
    </aside>
  );
}
```

**Step 4: Implement `CommandPalette.jsx`**

It searches pages locally. Stock search hits `/api/stocks/search` with a 250 ms debounce and makes no per-result quote calls. Each stock item passes `keywords={[query.trim()]}` so cmdk's fuzzy filter never hides a server match (e.g. "infosis" → INFY.NS "Infosys Limited"). "No results." is suppressed while a fetch is pending, and the query resets when the dialog closes via Esc or the overlay.

```jsx
// src/components/layout/CommandPalette.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart } from 'lucide-react';
import api from '@/api';
import { useMarket } from '@/context/MarketContext';
import { NAV_ITEMS } from '@/nav';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { market } = useMarket();
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setStocks([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(q)}&market=${market}`);
        if (!cancelled) setStocks((res.data?.results || []).slice(0, 8));
      } catch {
        if (!cancelled) setStocks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setLoading(false); };
  }, [query, market]);

  const go = (path) => {
    onOpenChange(false);
    setQuery('');
    navigate(path);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => { if (!o) setQuery(''); onOpenChange(o); }}
      title="Search" description="Search stocks or pages">
      <CommandInput placeholder="Search stocks or pages…" value={query} onValueChange={setQuery} />
      <CommandList>
        {!loading && <CommandEmpty>No results.</CommandEmpty>}
        {stocks.length > 0 && (
          <CommandGroup heading="Stocks">
            {stocks.map(s => (
              <CommandItem key={s.symbol} value={`${s.symbol} ${s.name}`}
                keywords={[query.trim()]}
                onSelect={() => go(`/stock/${s.symbol}`)}>
                <LineChart className="size-4 text-muted-foreground" />
                <span className="font-medium">{s.symbol}</span>
                <span className="truncate text-muted-foreground">{s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} value={`page ${label}`} onSelect={() => go(to)}>
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

`cmdk` filters items by `value` locally. Stock results come from the server, so they have to pass cmdk's filter; putting both the symbol and the name in `value` keeps them visible. Check the prop names of the shadcn `CommandDialog` that was generated (`title`, `description`) and adjust if they differ.

**Step 5: Implement `TopBar.jsx`**

Keep it `h-16`: `StockDetailPage` uses `sticky top-16`.

```jsx
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
```

**Step 6: Implement `AppShell.jsx`**

```jsx
// src/components/layout/AppShell.jsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import Sidebar, { SidebarNav, Brand } from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useLocalStorage('stockpulse_sidebar_collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(o => !o);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-4">
              <SheetTitle asChild><div><Brand /></div></SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}
```

The test `renderShell('/screener')` would find the Screener link in both the sidebar and the Sheet. That can't happen here, because the Sheet content only mounts when it is open. The sidebar is `hidden lg:flex`, but CSS doesn't apply in jsdom, so it still renders and the test finds it.

**Step 7:** Run `npx vitest run src/components/layout`. Expect 5 passed. Fix the implementation, not the tests. The exception is a test assumption that turns out wrong about generated shadcn markup, such as the option role name; fix those in the test and say so in your report.

---

### Task 7: Wire the shell into the app and remove `Header`

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Delete: `src/components/Header.jsx`

**Step 1: Update `App.jsx`**

- Replace `<Header />` and the outer `<div>` with `<AppShell>…</AppShell>`, keeping `<ScrollToTop />`, `<Routes>` and `<Analytics />` inside it.
- Add `<Toaster richColors position="bottom-center" />` from `@/components/ui/sonner`.
- Replace the DOM-hacking `showToast` function in `App.jsx` with `toast(...)` from `sonner`:

```jsx
import { toast } from 'sonner';
// in MarketHomePage effect:
toast(`Switched to ${m === 'in' ? 'Indian' : 'US'} market`);
```

Delete `showToast` and `toastTimeout`.

**Step 2:** `git rm src/components/Header.jsx`. Then run `grep -rn "Header'" src` and expect no imports to remain.

**Step 3: Update the smoke test in `src/App.test.jsx`**

The brand text now comes from the sidebar `Brand`, and `getAllByText(/StockPulse/)` still works. Add one assertion:

```jsx
expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
```

**Step 4:** Run `npm test`. Expect all tests to pass. Run `npm run lint` and expect 0 errors.

**Step 5:** Run `npx vite build`. Expect `✓ built`. Note the bundle size.

---

### Task 8: Manual check (user) and commit on approval

With the dev server on :3000, the user checks:

1. The sidebar has all 6 groups and 24 links, each of which opens its page. The active link is highlighted, and stock pages highlight Home.
2. The sidebar collapses to icons with tooltips, and the collapsed state survives a reload.
3. Below 1024px the sidebar is hidden; the hamburger opens a drawer, which closes after navigating.
4. ⌘K / Ctrl+K and `/` open the palette. Page search works, and typing "reli" shows RELIANCE.NS, which opens the stock page.
5. The IN/US toggle switches market and shows a sonner toast.
6. Dark is the default in a fresh browser profile. Toggling to light persists, and there is no white flash on reload in dark.
7. On old pages (Screener, Calculator, Stock detail) the dark mode uses the new near-black palette and still reads well. The stock detail sticky header sits right under the top bar.
8. Dropdowns and dialogs render dark in dark mode.

Commit only when the user asks:

```bash
git add -A -- . ':!backend/main.py' ':!.env'
git commit -m "feat(ui): Tailwind 4, shadcn/ui theme tokens, sidebar shell with command palette"
```

---

## Out of scope for Phase 2

- Restyling page contents: StatCard, DataTable, chart colors and so on (Phase 3).
- Removing the page-level `StockSearch` on Home and Stock detail (Phase 3 decides).
- Auth, the avatar menu and the Alerts page (Phase 4).
