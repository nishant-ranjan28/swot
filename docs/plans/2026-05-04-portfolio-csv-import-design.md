# Portfolio CSV Import — Design

**Issue:** [#193 Add portfolio import feature](https://github.com/nishant-ranjan28/swot/issues/193)
**Date:** 2026-05-04
**Status:** Implemented in PR #212.

## Goal

Let a user populate the Portfolio Tracker by uploading a CSV instead of adding holdings one row at a time. Generic template format (no broker-specific parsers) with a downloadable sample. Round-trips with the existing portfolio CSV export.

## User flow

Entry point: an **Import CSV** button on `PortfolioPage`, sitting next to the existing **Export CSV** button. Visible only on the Portfolio tab.

The modal has two steps:

1. **Upload.** Drag-and-drop / file-picker (`.csv` only, ≤1 MB, ≤5,000 data rows). A "Download template" link triggers the static template. A note states which market the import targets — *"Importing into &lt;Indian / US&gt; market — switch markets to import there."*
2. **Preview.** After the file is parsed and one batch symbol-lookup call returns, render a table of every row with a status pill: ✅ Valid · ⚠️ Skipped: duplicate · ❌ Rejected: &lt;reason&gt;. Counters at the top: `12 valid · 3 duplicates · 2 rejected`. Two actions:
   - **Append valid rows** (default).
   - **Replace all holdings with valid rows** (red, two-click confirm: "Yes, replace 8 existing holdings").

Cancel from either step resets state without mutating holdings.

On confirm: toast *"Imported 12 holdings"*, modal closes, holdings table refreshes, live prices fetch.

## Active-market scoping

CSV always imports into the currently selected market (IN or US). No `market` column in the template. Symbol typos that don't resolve get rejected in preview. Switching markets while the modal is open closes the modal.

## Template format

```csv
Symbol,Name,Quantity,Buy Price,Buy Date
RELIANCE.NS,Reliance Industries,10,2450.00,2025-06-15
```

**Header handling.** Case-insensitive, whitespace-trimmed, alias-aware:

| Canonical    | Aliases accepted                |
| ------------ | ------------------------------- |
| `Symbol`     | —                               |
| `Name`       | —                               |
| `Quantity`   | —                               |
| `Buy Price`  | `buyPrice`, `Avg Price`         |
| `Buy Date`   | `buyDate`, `Date`               |

- Required: `Symbol, Quantity, Buy Price, Buy Date`. Missing any → upload rejected before parsing rows.
- Ignored: `Current Price`, `P&L`, any unknown column. (Round-trip from export "just works".)
- `Name` is optional — backfilled from the symbol lookup result if blank.

## Per-row validation order

First failure wins so the preview shows one reason per row.

1. **Shape** — every required cell non-empty.
2. **Types** — `Quantity` parses to a positive integer; `Buy Price` parses to a positive number (strip `,` thousands separator); `Buy Date` parses as `YYYY-MM-DD` (or any `Date.parse`-able form, normalized to ISO).
3. **Date sanity** — not in the future (vs today, local time).
4. **Symbol resolution** — present in the batch lookup response.
5. **Duplicate** — `(symbol, quantity, buyPrice, buyDate)` already in current holdings → `Skipped: duplicate`.

Symbol normalization: uppercase before lookup and dedupe (`reliance.ns` → `RELIANCE.NS`).

## Edge-case decisions

| Edge case                                   | Decision                                                |
| ------------------------------------------- | ------------------------------------------------------- |
| Future `buyDate`                            | Reject row                                              |
| Zero/negative `quantity` or `buyPrice`      | Reject row                                              |
| Duplicate against existing holdings         | Show in preview as `Skipped: duplicate` (not silent)    |
| Unknown / extra column                      | Ignore; only fail upload if a required column is missing|
| `name` column missing or blank              | Auto-fill from symbol lookup                            |
| Empty file or header-only file              | Reject upload                                           |
| File &gt; 1 MB or rows &gt; 5,000           | Reject upload with "split into batches" message         |
| European decimal format (`2.450,00`)        | Not supported — document the limitation                 |
| CRLF line endings, quoted fields, BOM       | Supported (via `papaparse`)                             |

## Architecture

**Frontend-only feature.** No backend changes — all parsing happens in the browser, and symbol validation reuses the existing `/api/stocks/batch?symbols=...` endpoint.

### New files

```
src/components/Portfolio/
  ImportModal.js          # modal (upload → preview → action)
  importCsv.js            # pure parser/validator
  importCsv.test.js       # unit tests
public/
  portfolio-template.csv  # static template asset
```

### `importCsv.js` — pure module

- `parseCsv(fileText) → { rows, errors }` — header-alias resolution, type coercion, row-shape validation. No async, no network. Returns each row tagged `valid`, `rejected: <reason>`, or `needsLookup`.
- `classifyAgainstHoldings(parsedRows, lookupResult, existingHoldings) → { toImport, duplicates, rejected }` — applies symbol-resolution + duplicate checks. Also pure.

### `ImportModal.js` responsibilities

- File reader (`FileReader.readAsText`, UTF-8, BOM-stripped).
- One batch API call for all unique `needsLookup` symbols.
- Internal state machine: `upload | preview`.
- On confirm: calls `onImport(holdings, mode)` passed from `PortfolioPage`. New rows get an `id` from `crypto.randomUUID()` with `Date.now() + Math.random().toString(36)` fallback.
- Append mode: spread new rows after existing. Replace mode: overwrite. Single `setHoldings` call — atomic, no partial state.

### `PortfolioPage.js` changes

Add Import button next to Export, render `<ImportModal>` conditionally, supply the existing `holdings` + `setHoldings` to it. ~15 lines.

### Dependencies

Add `papaparse` (~13 KB gzipped). Handles quoted fields, BOM, CRLF, and edge cases that a hand-rolled `split(',')` breaks on.

## Testing

`importCsv.js` is pure → unit tests carry the bulk of coverage.

- Header alias resolution: canonical, snake_case, "Avg Price", BOM-prefixed, mixed case, trailing whitespace.
- Required-column-missing → upload-level error (not row-level).
- Type coercion: `"10"` → 10, `"2,450.00"` → 2450, `"abc"` → reject, `0` and negatives → reject.
- Date parsing: `2025-06-15`, `15/06/2025`, `Jun 15 2025`, future date → reject.
- Duplicate detection: same symbol/qty/price/date → `Skipped: duplicate`; same symbol but different lot → `valid`.
- Round-trip: feed the output of `exportPortfolio` back in → all rows reimport as duplicates.
- Limits: 5,001 rows → reject; 1.1 MB file → reject.
- Empty file, header-only file, CRLF line endings, quoted fields containing commas.

`ImportModal.js` gets one happy-path integration test (file → preview → append → holdings updated).

## Out of scope (YAGNI)

- Broker-specific CSVs (Zerodha, Groww, Upstox). Can be added later as additional header-alias maps.
- Importing transactions (buy/sell history) — only current lots.
- Importing into the Watchlist (different feature; not requested).
- Backend-side validation/storage — portfolio remains local-only.
