# Dummy Portfolio for First-Time Visitors — Design

**Date:** 2026-05-05
**Status:** Implemented in PR #213.

## Goal

When a first-time visitor opens the Portfolio Tracker, render a curated 5-stock sample portfolio so the page isn't empty. Sample is purely illustrative — never written to localStorage. As soon as the user adds their first real holding, the sample disappears and never returns for that market.

## Behavior

Render the 5 sample holdings for the currently selected market when **both** of these are true:

1. `holdings.length === 0` for the current market.
2. The market-specific seen-flag is unset (`localStorage.stockpulse_portfolio_seen_${market}` ≠ `true`).

The seen-flag is **set on the first successful Add Holding** — via the existing form OR via the CSV import flow. Once set, the sample never returns for that market, even if the user later wipes everything (the page falls through to the existing empty state).

IN and US scopes are independent — each market has its own sample list and its own seen-flag.

### Demo-mode rendering

Page header and summary cards (Total Invested / Current Value / Total P&L / Day's P&L) compute against sample data — they look like real numbers. Allocation pie + legend, Holdings table, Risk Analysis, Optimize Portfolio, and Insights all render against `displayHoldings` and call their real APIs for the 5 sample symbols. The demo therefore looks fully functional with no extra branching.

A small inline banner sits above the Holdings table:

> *Showing sample portfolio. Add your first holding to start tracking your own.*

The Delete button on each row is hidden for sample rows (gated on `h.isDemo`). Stock-name links to `/stock/SYMBOL` work as today.

## Sample data

Mostly green: 4 winners + 1 small loser per market. Buy dates spread across the past 6–18 months. Sample row shape matches a real holding plus an `isDemo: true` marker; ids are deterministic (`demo-${symbol}`) so they cannot collide with real `crypto.randomUUID()` ids.

### Indian market

| Symbol | Name | Qty | Buy Price | Buy Date |
|---|---|---|---|---|
| RELIANCE.NS | Reliance Industries | 50 | 1280.00 | 2025-01-15 |
| TCS.NS | Tata Consultancy Services | 25 | 3450.00 | 2024-11-22 |
| HDFCBANK.NS | HDFC Bank | 75 | 1620.00 | 2025-03-10 |
| ITC.NS | ITC | 200 | 425.00 | 2025-04-18 |
| BHARTIARTL.NS | Bharti Airtel | 60 | 1850.00 | 2025-02-05 |

### US market

| Symbol | Name | Qty | Buy Price | Buy Date |
|---|---|---|---|---|
| AAPL | Apple | 30 | 175.00 | 2024-09-12 |
| MSFT | Microsoft | 20 | 380.00 | 2024-12-03 |
| NVDA | NVIDIA | 15 | 110.00 | 2025-01-20 |
| AMZN | Amazon | 25 | 220.00 | 2025-02-14 |
| GOOGL | Alphabet | 20 | 195.00 | 2025-03-25 |

## Architecture

Frontend-only. No backend changes — sample symbols flow through the existing `/api/stocks/batch`, `/api/stocks/{sym}/overview`, and history endpoints. No new dependency.

### New file

```
src/data/samplePortfolio.js
```

Exports:

- `SAMPLE_HOLDINGS_IN` and `SAMPLE_HOLDINGS_US` (the two arrays above, each row with `isDemo: true`)
- `getSampleHoldings(market)` — returns the right array
- `SEEN_FLAG_KEY = (market) => \`stockpulse_portfolio_seen_${market}\``

Pure data + tiny helpers — no React, no I/O.

### Edits to `src/components/PortfolioPage.js`

1. Import `getSampleHoldings` and `SEEN_FLAG_KEY`.
2. State: `const [seen, setSeen] = useLocalStorage(SEEN_FLAG_KEY(market), false);`
3. Compute via `useMemo`:

   ```js
   const isDemoMode = holdings.length === 0 && !seen;
   const displayHoldings = isDemoMode ? getSampleHoldings(market) : holdings;
   ```

   Downstream sections (pie chart, summary cards, sort, table, Risk Analysis, Optimize, Insights) read `displayHoldings` instead of `holdings`.
4. `handleAddHolding` sets the seen-flag (`setSeen(true)`) alongside `setHoldings(...)`.
5. `handleImport` (CSV import callback from PR #212) sets the seen-flag too.
6. Holdings table row: wrap the Delete button in `{!h.isDemo && (...)}`.
7. Inline banner above the Holdings table, gated on `isDemoMode`:

   ```jsx
   {isDemoMode && (
     <div className="text-xs px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-md mb-3">
       Showing sample portfolio. Add your first holding to start tracking your own.
     </div>
   )}
   ```

No changes to `PortfolioImport.js`, `useLocalStorage`, the backend, or any other component.

## Edge cases

- **Market switch.** Toggling IN ↔ US swaps both `holdings` (existing behavior) and `seen` to the other market's slot. A user with real IN holdings who has never visited US will see the US sample on first switch — intended.
- **CSV import "Replace all" with an empty result** is already prevented by the existing `disabled={valid.length === 0}` on the Replace button — no edge case to handle.
- **Manual delete to zero.** With the seen-flag set, the page shows the existing empty state ("No holdings yet"), not the sample. Existing copy unchanged.
- **`useLocalStorage` JSON storage.** The flag is `true` / `false` (boolean, JSON-encoded), so `!seen` evaluates correctly.
- **Cross-tab updates** are not auto-synced — same as today for `holdings`. No regression.
- **Sample id collisions** are impossible: `demo-${symbol}` is structurally distinct from `crypto.randomUUID()` output.

## Out of scope (YAGNI)

- A "Reset to demo" button or any way to bring the sample back after the flag is set.
- Live-fetched buy prices that hold a deterministic green/red position regardless of market movement — buy prices are hardcoded; the daily P&L is whatever the market does.
- A "Try the sample portfolio" landing CTA on the home page.
- Banner i18n.
- Unit tests (matching the rest of the codebase's manual-verification posture).
