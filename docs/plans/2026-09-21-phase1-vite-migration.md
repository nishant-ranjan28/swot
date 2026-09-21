# Phase 1: CRA → Vite Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Create React App with Vite + Vitest. The app must look and behave the same as before.

**Architecture:** Vite serves `index.html` from the repo root and bundles `src/index.jsx`. Files that contain JSX are renamed to `.jsx`. The CRA dev proxy (`setupProxy.js`) becomes `server.proxy` in `vite.config.mjs`. Output goes to `build/` and the dev port stays 3000, so the Vercel settings and backend CORS need no changes. Tailwind 3 and PostCSS stay as they are; Phase 2 upgrades them.

**Tech Stack:** Vite (latest), @vitejs/plugin-react, Vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @vitest/coverage-v8.

**Design doc:** `docs/plans/2026-09-21-openstock-revamp-design.md` (Phase 1 of 6).

**Branch:** `revamp/openstock-ui`. Never stage `backend/main.py`, which holds the user's uncommitted LOCAL_DEV patch.

---

### Task 0: Baseline

**Step 1: Confirm the current CRA build works**

Run: `npm run build 2>&1 | tail -5`
Expected: `The build folder is ready to be deployed.` Record the main bundle size it prints.

**Step 2: Remove the build output**

Run: `rm -rf build`

---

### Task 1: Swap dependencies

**Files:** Modify `package.json`, `package-lock.json`

**Step 1: Remove the CRA packages and unused packages**

```bash
npm uninstall react-scripts cra-template web-vitals @tailwindcss/postcss7-compat
```

**Step 2: Add Vite and the test stack**

```bash
npm install -D vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @vitest/coverage-v8 eslint-plugin-react eslint-plugin-react-hooks
```

If peer conflicts appear, retry with `--legacy-peer-deps`, which CI already uses.

**Step 3: Replace the `scripts` block in `package.json`**

```json
"scripts": {
  "dev": "vite",
  "start": "vite",
  "build": "vite build",
  "preview": "vite preview --port 3000",
  "test": "vitest run",
  "test:watch": "vitest",
  "coverage": "vitest run --coverage",
  "lint": "eslint src --ext .js,.jsx",
  "format": "prettier --write ."
}
```

**Step 4: Remove the CRA-specific `eslintConfig` and `browserslist` blocks from `package.json`**

Task 8 replaces `eslintConfig`. Vite does not use `browserslist`, but autoprefixer does. Keep `browserslist` only if `npx autoprefixer --info` shows it is used. Otherwise delete it.

Do not commit yet. The app is broken until Task 4.

---

### Task 2: Vite config

**Files:** Create `vite.config.mjs` (`.mjs` so Node loads the ESM config without a "type": "module" in `package.json`)

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Keep REACT_APP_ so existing Vercel env vars keep working; VITE_ for new ones.
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: { port: 3000 },
  build: { outDir: 'build', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], reportsDirectory: 'coverage' },
  },
});
```

---

### Task 3: Move `index.html`

**Files:** Move `public/index.html` → `index.html`

**Step 1:** `git mv public/index.html index.html`

**Step 2:** Replace `%PUBLIC_URL%` with an empty string. There are 2 occurrences: favicon and apple-touch-icon.

```html
<link rel="icon" href="/favicon.ico" />
<link rel="apple-touch-icon" href="/logo192.png" />
```

**Step 3:** Add the entry script right after `<div id="root"></div>`:

```html
<script type="module" src="/src/index.jsx"></script>
```

---

### Task 4: Rename JSX files to `.jsx`

**Files:** every file under `src/` that contains JSX, about 45 files.

**Step 1: List the candidates**

```bash
grep -rlE "</[A-Za-z]|/>|<>|return \(\s*<" src --include='*.js' | grep -v '\.test\.js$' | sort
```

Check the list by hand. Files in `src/utils`, `src/data`, and `src/services`, plus `useLocalStorage.js` and `useStockData.js`, contain no JSX and must **not** be renamed. `src/api.js` stays `.js`.

**Step 2: Rename them with git**

```bash
for f in $(grep -rlE "</[A-Za-z]|/>|<>" src --include='*.js' | grep -v '\.test\.js$'); do git mv "$f" "${f%.js}.jsx"; done
git mv src/App.test.js src/App.test.jsx
```

Imports do not use extensions (`import App from './App'`), so they resolve without edits. Check for explicit ones:

Run: `grep -rn "from '.*\.js'" src`
Expected: no output. If a line matches, update its extension.

**Step 3: Try the build**

Run: `npx vite build 2>&1 | tail -20`
If a `.js` file still contains JSX, the error names it (`The JSX syntax extension is not currently enabled`). Rename that file and repeat until the build passes.

---

### Task 5: Replace CRA environment globals

**Files:**
- Modify `src/api.js:3`
- Modify `src/services/newsService.js:4`
- Modify `src/components/ErrorFallback.jsx:23`

```js
// src/api.js
const API_BASE_URL = import.meta.env.REACT_APP_API_URL || '';
```

```js
// src/services/newsService.js
const newsApiKey = import.meta.env.REACT_APP_NEWSAPI_KEY;
```

```jsx
// src/components/ErrorFallback.jsx
{import.meta.env.DEV && (
```

Run: `grep -rn "process\.env" src`
Expected: no output.

---

### Task 6: Remove CRA leftovers

```bash
git rm src/setupProxy.js src/reportWebVitals.js src/logo.svg
```

Run: `grep -rn "reportWebVitals\|logo.svg\|setupProxy" src index.html`
Expected: no output.

---

### Task 7: Replace the dead CRA test with a real smoke test (TDD)

**Files:**
- Modify `src/setupTests.js`
- Modify `src/App.test.jsx`

**Step 1: Update the setup file**

```js
// src/setupTests.js
import '@testing-library/jest-dom/vitest';
```

**Step 2: Write the test**

```jsx
// src/App.test.jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from './App';
import { MarketProvider } from './context/MarketContext';
import { ThemeProvider } from './context/ThemeContext';
import { StockProvider } from './context/StockContext';

vi.mock('./api', () => {
  const get = vi.fn(() => new Promise(() => {})); // never resolves: no network in tests
  return { default: { get }, API_BASE_URL: '' };
});
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MarketProvider>
        <ThemeProvider>
          <StockProvider>
            <App />
          </StockProvider>
        </ThemeProvider>
      </MarketProvider>
    </MemoryRouter>,
  );
}

test('renders app shell with brand name', () => {
  renderAt('/');
  expect(screen.getAllByText(/StockPulse/i).length).toBeGreaterThan(0);
});

test('renders glossary route', async () => {
  renderAt('/glossary');
  expect(await screen.findByRole('heading', { name: /glossary/i })).toBeInTheDocument();
});
```

**Step 3: Run the tests**

Run: `npm test`
Expected: 2 passed. If a test fails, it is because of an environment gap such as `matchMedia`, `ResizeObserver`, or `Notification` missing in jsdom. Add minimal stubs to `src/setupTests.js`, for example:

```js
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
```

If the brand text or glossary heading differs, read `Header.jsx` or `GlossaryPage.jsx` and assert on the real text. Do not change the components.

---

### Task 8: ESLint config

**Files:** Modify `package.json` (add an `eslintConfig` block)

```json
"eslintConfig": {
  "root": true,
  "env": { "browser": true, "es2022": true, "node": true },
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module", "ecmaFeatures": { "jsx": true } },
  "settings": { "react": { "version": "detect" } },
  "extends": ["eslint:recommended", "plugin:react/recommended", "plugin:react/jsx-runtime", "plugin:react-hooks/recommended", "prettier"],
  "rules": { "react/prop-types": "off", "no-unused-vars": "warn" },
  "overrides": [{ "files": ["**/*.test.{js,jsx}"], "globals": { "vi": "readonly", "test": "readonly", "expect": "readonly", "describe": "readonly", "it": "readonly" } }]
}
```

Run: `npm run lint 2>&1 | tail -5`
Expected: 0 errors. Warnings are fine. Fix real errors only if they come from the migration, not from style that existed before.

---

### Task 9: CI and docs

**Files:**
- Modify `.github/workflows/sonarcloud.yml` (the frontend test step)
- Modify `README.md` (around lines 96–108)

**Step 1: Update the frontend test step in the CI workflow**

```yaml
      - name: Run frontend tests with coverage
        run: npm run coverage || true
```

Remove the `env: CI: true` lines under it, and bump `actions/setup-node` to `node-version: '22'` (Vitest 5 needs Node ^22.12). `sonar.javascript.lcov.reportPaths=coverage/lcov.info` still matches.

**Step 2: Update the README**

Replace `npm start` with `npm run dev` and note that the app runs at `http://localhost:3000` with `/api` proxied to `:8000`. Keep the `REACT_APP_API_URL` note, since that name is still supported.

---

### Task 10: Verify the full app and commit

**Step 1:** `npm run build 2>&1 | tail -10`. Expect `✓ built`, with output in `build/`. Compare the bundle size to the Task 0 baseline. A chunk-size warning is fine.

**Step 2:** `npm test`. Expect all tests to pass.

**Step 3:** Start both servers for manual testing:

```bash
cd backend && LOCAL_DEV=1 /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m uvicorn main:app --port 8000   # background
npm run dev   # background
```

**Step 4:** Smoke-test every route in a browser at `http://localhost:3000`:
`/`, `/in`, `/us`, `/stock/RELIANCE.NS`, `/stock/AAPL`, `/watchlist`, `/portfolio`, `/compare`, `/screener`, `/scanner`, `/calculator`, `/backtest`, `/crypto`, `/commodities`, `/forex`, `/earnings-calendar`, `/glossary`, `/economic-calendar`, `/sector-heatmap`, `/tax`, `/ipo`, `/deals`, `/fii-dii`, `/macro`, `/mutual-funds`, `/etf`, `/trending`, `/news`.

On each page check three things: it renders, data loads, and the console shows no errors. Also check the dark mode toggle, the stock detail chart, and PDF/CSV export.

**Step 5:** Hand over to the user for manual testing (see memory: the user tests before any commit). Commit only when the user asks.

**Step 6 (on user approval):** Commit.

```bash
git add -A -- . ':!backend/main.py'
git status --short   # confirm backend/main.py NOT staged
git commit -m "build: migrate from Create React App to Vite and Vitest"
```

---

## Out of scope for Phase 1

- Tailwind 4, shadcn, and visual changes (Phase 2).
- Renaming `REACT_APP_*` to `VITE_*` in Vercel (optional, later).
- Fixing lint warnings that existed before this phase.
