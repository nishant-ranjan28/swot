# StockPulse Revamp — OpenStock-Inspired UI + Accounts & Email Alerts

**Date:** 2026-09-21
**Status:** Design approved, ready for implementation planning

## Goal

Revamp StockPulse's look and feel after [OpenStock](https://github.com/Open-Dev-Society/OpenStock)
(dark shadcn aesthetic, command-palette search, clean dashboard) and add its account
features (auth, synced watchlist, price-alert emails, daily digest) — while keeping every
existing StockPulse feature and the FastAPI backend.

## Licensing constraint

OpenStock is AGPL-3.0; StockPulse is CC0. **No OpenStock code is copied.** We borrow
design ideas and stack choices only and write our own implementation, so StockPulse
stays CC0.

## Decisions

| Topic | Decision |
|---|---|
| Scope | Visual/UX revamp + OpenStock account features. No Next.js/TS migration. |
| Auth + DB | Supabase (Auth + Postgres with RLS) |
| Email | Brevo (HTTP API for app mail, SMTP for Supabase auth mail) |
| Scheduler | GitHub Actions cron → backend job endpoints |
| Login model | Optional. Research pages public; login syncs data + enables email |
| Build tooling | CRA → Vite, stay JavaScript |
| UI kit | Tailwind 4 + shadcn/ui + lucide-react + cmdk + sonner |
| Layout | Collapsible left sidebar + top bar with ⌘K palette |
| Charts | Keep own data + lightweight-charts/uPlot, restyled. No TradingView widgets |
| Email features | Price alerts, daily watchlist digest, AI news summary, welcome email |
| LLM | Groq primary → OpenRouter (free model) fallback → non-AI digest |

## 1. Architecture

**Frontend (Vercel):** Vite + React 19 (JS) + Tailwind 4 + shadcn/ui + lucide + cmdk +
sonner. `@supabase/supabase-js` for auth and user data (browser → Supabase directly,
protected by RLS). Market data still comes from FastAPI via `src/api.js`.

**Backend (FastAPI, existing host):** market-data routers unchanged. New:

- `routers/jobs.py` — `POST /jobs/check-alerts`, `POST /jobs/daily-digest`, guarded by `X-Job-Secret`.
- `routers/users.py` — `POST /users/welcome` (Supabase JWT required).
- `services/supabase_admin.py` — service-role client for server-side reads/writes.
- `services/mailer.py` — Brevo transactional API via httpx.
- `services/llm.py` — OpenAI-compatible client; Groq → OpenRouter → `None`.

**Supabase:** Auth (email/password, Google, password reset). Auth SMTP set to Brevo.

**GitHub Actions:** `alerts.yml` and `digest.yml` call backend job endpoints with the
shared secret. Reuse `BACKEND_URL` secret and curl/retry pattern from `keep-warm.yml`.

### Phases (one PR each, app shippable after each)

1. CRA → Vite migration, no visual change. Verify all 27 routes.
2. Design system: Tailwind 4, shadcn setup, theme tokens, AppShell (sidebar, top bar, ⌘K).
3. Restyle pages: Home → Stock detail → Watchlist/Portfolio → Screener/Scanner/Compare → rest in batches of ~5.
4. Supabase auth, profiles, synced watchlist/holdings/alerts, guest → account import.
5. Price alert job + email + GH Actions cron.
6. Daily digest + LLM summary + welcome email.

## 2. Data model & sync

Existing localStorage keys (unchanged for guests):

- `stockpulse_watchlist_{in|us}` → `{symbol, name, alertHigh, alertLow, addedAt}`
- `stockpulse_portfolio_{in|us}` → `{symbol, buyPrice, quantity, ...}`

### Supabase tables (RLS: `user_id = auth.uid()` on all)

```sql
profiles(
  id uuid primary key references auth.users,
  display_name text,
  default_market text,
  email_alerts bool default true,
  daily_digest bool default true,
  digest_market text default 'in',
  welcome_sent_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz default now()
)

watchlist_items(
  id, user_id, market text check (market in ('in','us')), symbol, name,
  added_at timestamptz,
  unique (user_id, market, symbol)
)

holdings(
  id, user_id, market, symbol, name,
  quantity numeric, buy_price numeric, buy_date date, created_at
)

price_alerts(
  id, user_id, market, symbol, name,
  condition text check (condition in ('above','below','pct_up','pct_down')),
  target numeric, active bool default true,
  last_triggered_at timestamptz, created_at
)

alert_events(
  id, alert_id, user_id, price numeric, triggered_at timestamptz, emailed bool default false
)
```

- Alerts are split out of watchlist items → multiple alerts per symbol and % moves.
  Legacy `alertHigh/alertLow` import as `above/below` rows.
- An alert fires once, then `active=false`; user re-arms from UI. `alert_events` is the history.

### Frontend data layer

`UserDataContext` exposes `watchlist`, `holdings`, `alerts` and mutations, backed by:

- `localAdapter` — guest; wraps existing localStorage keys (no format change).
- `supabaseAdapter` — signed in; optimistic updates, sonner toast on error.

Pages use the context instead of `useLocalStorage` for these collections.

### Guest → account import

On first sign-in, if local data exists and `profiles.imported_at` is null, show a dialog
("Import N watchlist items, M holdings, K alerts?"). Bulk upsert (unique constraints
dedupe), set `imported_at`. Local copy is left untouched.

Guests keep browser notifications (`useAlertNotifications`). Signed-in users get email;
browser notifications remain optional.

## 3. Backend jobs, email, LLM

**Auth:** job endpoints compare `X-Job-Secret` to `JOB_SECRET` with `hmac.compare_digest`.
User endpoints verify Supabase JWT against the project JWKS (cached).

### `POST /jobs/check-alerts?market=in|us`

1. Service-role fetch of active alerts for market.
2. Dedupe symbols; fetch quotes via existing cached stock service.
3. Evaluate `above/below` against price, `pct_up/pct_down` against day change %.
   Evaluation is a pure function (unit-tested).
4. On trigger: insert `alert_event`, set `active=false`, group per user → one email per user per run.
5. Resend any `alert_events where emailed=false` from earlier failed runs.
6. Return `{checked, triggered, emailed, errors}` (visible in Actions log).

Users with `email_alerts=false` still get events recorded, no email. If quote timestamp
is stale (>1h), market is closed/holiday → return early.

### `POST /jobs/daily-digest?market=in|us`

For each user with `daily_digest=true` and a non-empty watchlist: day move per symbol +
top 3 headlines per symbol (existing news service + VADER). One LLM call per user to
summarize headlines — prompt contains headlines only, no user PII. Chain:
Groq → OpenRouter → omit AI section. httpx timeout per call.

### Cron

- `alerts.yml`: `*/15 3-10 * * 1-5` (India, UTC) and `*/15 13-21 * * 1-5` (US).
- `digest.yml`: India 11:00 UTC (16:30 IST), US 21:30 UTC.
- curl `--max-time 120 --retry 2`. GH cron may lag 5–15 min; acceptable.

### Email

Brevo `/v3/smtp/email`. HTML + plain-text templates in `backend/templates/email/`
(alert, digest, welcome), styled to match app. Footer link → `/settings` to toggle emails.

**Welcome:** frontend calls `POST /users/welcome` after sign-in; backend sends only if
`welcome_sent_at` is null, then sets it. Idempotent.

**Errors:** per-user try/except so one failure never aborts a run. Brevo 429 → stop
and report partial; unsent events retry next run.

### Environment

Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `MAIL_FROM`,
`JOB_SECRET`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `LLM_MODEL_GROQ`,
`LLM_MODEL_OPENROUTER`, `APP_URL`.

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.

GitHub secrets: `BACKEND_URL` (exists), `JOB_SECRET`.

## 4. Design system & restyle

**Tokens** (Tailwind 4 `@theme` + CSS vars, shadcn naming): `--background`, `--card`,
`--muted`, `--border`, `--primary`, `--gain`, `--loss`, `--chart-1..5`. Dark default
(near-black background, slightly lighter cards, subtle borders, amber accent, green/red
gain/loss); light variant. `ThemeContext` toggles the `.dark` class. Inter/Geist via
`@fontsource`; `tabular-nums` for all figures.

**Components:** shadcn primitives in `src/components/ui/` (Button, Card, Tabs, Dialog,
DropdownMenu, Popover, Select, Input, Table, Badge, Skeleton, Tooltip, Sonner, Command).
Shared in `src/components/common/`: `PriceChange`, `StatCard`, `DataTable` (sort + CSV
export), `PageHeader`, `EmptyState`, `MarketBadge`.

**Navigation:** sidebar groups —
Markets (Home, Crypto, Commodities, Forex, Macro),
Research (Screener, Scanner, Compare, Sector Heatmap, Backtest),
Funds (Mutual Funds, ETF),
Intelligence (News, Trending, FII/DII, Deals, Earnings, Economic, IPO),
My Stuff (Watchlist, Portfolio, Alerts),
Tools (Calculators, Tax, Glossary).
Top bar: ⌘K palette (stocks + pages), IN/US toggle, theme toggle, avatar / sign-in.
Mobile: sidebar becomes a drawer.

**Charts:** lightweight-charts and uPlot read colors from CSS vars and re-apply on theme change.

**Restyle:** replace the 23 files with inline hardcoded styles and CSS dark-mode overrides
with tokens + shared components. Old and new styles coexist during Phase 3.

**New pages:** `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/settings`, `/alerts`.

## 5. Testing

- **Vitest + Testing Library:** replace dead CRA test; `UserDataContext` adapters
  (local + mocked Supabase), import dedupe.
- **Pytest:** alert evaluator, job endpoints (Supabase/Brevo/LLM mocked), LLM fallback
  chain, job-secret check, welcome idempotency.
- **RLS:** script with two test users confirms A cannot read/write B's rows.
- **Manual:** each phase ends with dev servers running for hands-on check before commit.

## Out of scope

- Next.js / TypeScript migration.
- TradingView embedded widgets.
- Copying any OpenStock source.
