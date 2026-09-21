# Phase 5: Price Alert Emails, Backend Job, Cron, Alerts Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A scheduled backend job checks every active price alert against live quotes during market hours. It records triggered alerts, deactivates them (they fire once), and emails each affected user one Brevo summary. On the frontend, signed-in users get an `/alerts` page to see, add, re-arm and delete alerts, and to view trigger history.

**Architecture:**
- **Backend (FastAPI):**
  - `routers/jobs.py` exposes `POST /api/jobs/check-alerts?market=in|us&force=0`, guarded by an `X-Job-Secret` header.
  - Orchestration lives in `services/alert_job.py`. It is built from:
    - a pure evaluator: `services/alert_engine.py`
    - a thin Supabase admin REST client over httpx: `services/supabase_admin.py` (service-role key, backend-only)
    - a Brevo transactional mailer: `services/mailer.py`
    - `string.Template` email templates
  - Collaborators are injected (http client, quote function, clock), so tests use `httpx.MockTransport` and fakes. No network is needed in tests.
- **Database:** migration 2 adds `profiles.email`, kept in sync from `auth.users` by triggers, so the job can read recipient and preferences in one query. Users can't update it.
- **Scheduler:** GitHub Actions cron every 15 min, 03:00–21:59 UTC on weekdays, calling both markets. The backend skips a closed market unless `force=1`.
- **Frontend:** a new repo function set plus an `AlertsPage` (account-only), and a sidebar item "Alerts" under My Stuff. Watchlist `alertHigh`/`alertLow` keep working. Above/below alerts are the same `price_alerts` rows, so after Alerts-page mutations the page calls `reload()` to keep watchlist state consistent.

**Semantics:**
- `above`: `price >= target`
- `below`: `price <= target`
- `pct_up`: `change_percent >= target`
- `pct_down`: `change_percent <= -target`
- Targets are positive; the DB enforces this.
- A triggered alert gets `active=false` and `last_triggered_at=now()`, and an `alert_events` row with the price is inserted.
- Users with `profiles.email_alerts = false` still get events, but no email; those events are marked `emailed=true` so they aren't retried.
- Unemailed events from earlier failed runs are retried on the next run. Retries stop after 24h: older events are marked emailed and counted as `expired`.

**Tech Stack:** FastAPI, httpx (already a dependency), pytest + pytest-asyncio (already present), the Brevo transactional API `POST https://api.brevo.com/v3/smtp/email`, Supabase PostgREST, and GitHub Actions. On the frontend: React, the shadcn kit, and the Phase 4 repo/fake patterns.

**Phase 4:** committed as `887a3ec`; `.env` untracking as `30f7274`. Supabase, Brevo SMTP and the frontend env are live and verified by the user.

---

## Environment notes (read first)

- **Backend Python:** use `backend/.venv` (Python 3.13). Run tests with `cd backend && .venv/bin/python -m pytest tests -q`. New tests must not need network: use `httpx.MockTransport`, and never hit real Supabase or Brevo.
- **Frontend:** `node_modules/fsevents` must NOT exist when vite or vitest runs. Wrap long commands with `perl -e 'alarm 300; exec @ARGV' <cmd>`.
- **Dev servers:** Vite on :3000 is running outside the sandbox so it can read `.env.local`; leave it running. uvicorn on :8000 may be running; leave it.
- **Uncommitted user patch:** `backend/main.py` has the user's LOCAL_DEV patch.
  - Task 5 adds exactly 2 lines to it (import + include_router).
  - **Never** stage the LOCAL_DEV hunk.
  - The final commit stages only the router lines via a crafted patch: `git diff backend/main.py`, keep only the router hunk, then `git apply --cached`.
  - Don't commit anything during implementation.
- **Files you must not touch:** `.env`, `.env.local` and `backend/.env*`. The sandbox blocks reading them anyway.
- **Secrets:**
  - The service-role key, Brevo API key and job secret come only from environment variables at runtime.
  - Never log them, never echo them in errors, never put real values in tests, docs or examples. Use placeholders like `<service-role-key>`.
  - Error messages returned by the job endpoint must not include upstream response bodies that could echo headers.
- **No behaviour changes** to existing endpoints.

---

### Task 1: Migration 2 — profile email

**Files:**
- Create: `supabase/migrations/20260922000000_profile_email.sql`
- Modify: `docs/setup/supabase.md` (add a "Run migration 2" note)

```sql
-- Copy auth email onto profiles so backend jobs can read recipient + preferences in one query.
alter table public.profiles add column email text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    new.email
  );
  return new;
end;
$$;

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();
```

Before writing it, read the current `handle_new_user` in migration 1 and keep its display-name logic identical. The column-level UPDATE grant from migration 1 doesn't include `email`, so users can read their own email but can't change it. Verify this by reading the grants.

---

### Task 2: Backend config + Supabase admin client (TDD)

**Files:**
- Modify: `backend/config.py`. Append a settings block that reads `os.environ` lazily through a function, so tests can monkeypatch.
- Create: `backend/services/supabase_admin.py`
- Create: `backend/tests/test_supabase_admin.py`
- Create: `backend/tests/conftest.py`, if one is needed for shared fixtures

**Settings** (`config.py`):

```python
import os

def job_settings() -> dict:
    return {
        "supabase_url": (os.environ.get("SUPABASE_URL") or "").rstrip("/"),
        "service_role_key": os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "",
        "brevo_api_key": os.environ.get("BREVO_API_KEY") or "",
        "mail_from": os.environ.get("MAIL_FROM") or "",
        "mail_from_name": os.environ.get("MAIL_FROM_NAME") or "StockPulse",
        "job_secret": os.environ.get("JOB_SECRET") or "",
        "app_url": (os.environ.get("APP_URL") or "https://swot.iamnishant.in").rstrip("/"),
    }
```

**`SupabaseAdmin`** (async, httpx):
- `__init__(self, url, service_role_key, client: httpx.AsyncClient)` sets headers `apikey` and `Authorization: Bearer <key>` on each request. Base URL is `f"{url}/rest/v1"`.
- `active_alerts(market) -> list[dict]`: `GET /price_alerts?market=eq.{m}&active=eq.true&select=id,user_id,market,symbol,name,condition,target`
- `record_triggers(triggers: list[dict]) -> list[dict]`
  - For each trigger `{alert_id, user_id, price}`:
    1. `PATCH /price_alerts?id=eq.{id}&active=eq.true` with body `{active:false, last_triggered_at: now}` and `Prefer: return=representation`.
    2. Only if the PATCH returned a row (it wasn't already deactivated by a concurrent run), `POST /alert_events` with `{alert_id, user_id, price}`.
  - Returns the inserted events. This makes concurrent or overlapping cron runs idempotent.
- `pending_events(since_iso) -> list[dict]`: `GET /alert_events?emailed=eq.false&triggered_at=gte.{since}&select=id,user_id,price,triggered_at,alert:price_alerts(symbol,name,market,condition,target)`
- `expire_events(before_iso) -> int`: `PATCH /alert_events?emailed=eq.false&triggered_at=lt.{before}` with `{emailed:true}`, `Prefer: return=representation`. Returns the count.
- `profiles(user_ids) -> dict[user_id, {email, display_name, email_alerts}]`: `GET /profiles?id=in.(…)&select=id,email,display_name,email_alerts`
- `mark_emailed(event_ids)`: `PATCH /alert_events?id=in.(…)` with `{emailed:true}`
- All methods raise `SupabaseAdminError(status, message)` on non-2xx. The message is a short generic string plus the status; never include response headers or the key.
- Quote values in the `in.()` filters safely. Ids are UUIDs: validate them with a regex, and skip any that don't match.

**Tests** use `httpx.MockTransport`. Assert:
- method, path, query params and headers (the key is present; its value is only the placeholder)
- the `record_triggers` skip when the PATCH returns `[]`
- error mapping
- invalid ids dropped from `in.()`
- that the service-role key never appears in a raised error's `str()`

---

### Task 3: Alert engine (pure, TDD)

**Files:**
- Create: `backend/services/alert_engine.py`
- Create: `backend/tests/test_alert_engine.py`

```python
def evaluate(alert: dict, quote: dict | None) -> float | None:
    """Return the trigger price if the alert fires, else None."""
```

- If `quote` is missing, or its price is not a positive number, return None.
- Rules are as in **Semantics**. `pct_*` compares `quote["change_percent"]`; if that's None, return None.
- Coerce targets from strings (PostgREST numerics can arrive as strings).

```python
def is_market_open(market: str, now_utc: datetime) -> bool:
```

- `in`: Mon–Fri, 09:15–15:30 Asia/Kolkata.
- `us`: Mon–Fri, 09:30–16:00 America/New_York. Use `zoneinfo` so DST is handled.
- Holidays are not modelled. Prices don't move on holidays, so nothing new fires. Document this.

```python
def group_events_by_user(events) -> dict[user_id, list[event]]
```

Sort each list by `triggered_at`.

**Tests:**
- every condition at, above and below the boundary
- a string target
- missing quote, zero price, and None `change_percent`
- market hours at the edges: 09:14 / 09:15 / 15:30 / 15:31 IST, a weekend, and a US DST date (e.g. 2026-03-09 13:31 UTC is open, 13:29 is closed)

---

### Task 4: Brevo mailer + templates (TDD)

**Files:**
- Create: `backend/services/mailer.py`
- Create: `backend/templates/email/alert.html`
- Create: `backend/templates/email/alert.txt`
- Create: `backend/tests/test_mailer.py`

**Mailer:**
- `class Mailer(api_key, sender_email, sender_name, client: httpx.AsyncClient)`
- `async send(to_email, to_name, subject, html, text) -> str` returns `'sent' | 'rate_limited' | 'failed'`.
- It calls `POST https://api.brevo.com/v3/smtp/email` with headers `api-key`, `accept: application/json`, `content-type: application/json`.
- Body: `{sender:{email,name}, to:[{email,name}], subject, htmlContent, textContent, headers:{"X-Mailin-Tag":"price-alert"}}`.
- Status mapping: 201 or 202 → sent, 429 → rate_limited, anything else → failed. Never raise. Log only the status code.

**Templates** (`string.Template`, `$`-placeholders, all values HTML-escaped with `html.escape` before substitution):
- Subject: `"🔔 {n} price alert(s) triggered"`, or `"🔔 {SYMBOL} hit your {condition} alert"` when n == 1.
- Body: a simple inline-styled table (email clients ignore external CSS). Rows are symbol, condition text ("rose above ₹2,500" / "fell below $180" / "up 5% today" / "down 3% today") and trigger price. Currency is ₹ for `in` and $ for `us`.
- The CTA button goes to `{app_url}/alerts`.
- Footer: "You're receiving this because email alerts are on. Manage in Settings: {app_url}/settings".
- Render function: `render_alert_email(display_name, events, app_url) -> (subject, html, text)`.

**Tests:**
- MockTransport for 201, 429 and 500, asserting the request body shape.
- Render tests: escaping (a symbol name with `<script>` is escaped), singular vs plural subject, currency by market, both links present.

---

### Task 5: Job orchestration + endpoint (TDD)

**Files:**
- Create: `backend/services/alert_job.py`
- Create: `backend/routers/jobs.py`
- Modify: `backend/main.py`. Add exactly:
  ```python
  from routers.jobs import router as jobs_router
  app.include_router(jobs_router, prefix="/api/jobs")
  ```
  next to the other routers. Change nothing else.
- Create: `backend/tests/test_alert_job.py`
- Create: `backend/tests/test_jobs_router.py`

**`async run_check_alerts(market, *, admin, mailer, get_quotes, now_utc, force=False, app_url) -> dict`:**
1. If `not force and not is_market_open(market, now_utc)`, return `{"market": m, "skipped": "market_closed"}`.
2. Get `alerts = await admin.active_alerts(market)`.
3. Take the unique symbols, fetch quotes in chunks of 20 with `await asyncio.to_thread(get_quotes, chunk)`, and merge the results.
4. Evaluate each alert → `triggers`, then `events = await admin.record_triggers(triggers)`.
5. Expire stale events: `await admin.expire_events(now - 24h)`.
6. Get `pending = await admin.pending_events(now - 24h)`. This includes the events just inserted plus earlier failures, across both markets, so a US run also retries unsent IN emails. Group them by user.
7. Load profiles for those users. For each user:
   - If `email_alerts` is false or the email is missing, mark their events emailed without sending, and count them as `suppressed`.
   - Otherwise render and send. On `sent`, mark emailed and count `emailed`. On `rate_limited`, stop sending for this run and count `rate_limited = True`. On `failed`, leave them pending and count `failed`.
   - Wrap each user in try/except so one bad user can't abort the run. Record the error type only.
8. Return `{market, checked: len(alerts), symbols, triggered: len(events), emailed, suppressed, failed, expired, rate_limited, errors}`.

**Router** `routers/jobs.py`:
- `POST /check-alerts` with query `market: Literal['in','us']` and `force: bool = False`.
- Auth: header `X-Job-Secret`.
  - If `JOB_SECRET` is unset → 503 `{"error":"jobs disabled"}`.
  - If `hmac.compare_digest` fails → 401.
  - If Supabase, Brevo or the sender aren't configured → 503 with a list of the missing setting names. Names only, no values.
- Build the collaborators per request with one shared `httpx.AsyncClient(timeout=20)`, then call `run_check_alerts` with `get_quotes=stock_service.get_batch_quotes` and `now_utc=datetime.now(timezone.utc)`.
- On `SupabaseAdminError` → 502 `{"error":"supabase error","status":<code>}`.
- The `@limiter` decorator isn't needed; the secret gates access.

**Tests:**
- Job, with fakes for admin, mailer and quotes:
  - closed market skip
  - `force` bypass
  - each condition fires, and the record is idempotent (a second run with the same fake state inserts nothing)
  - a user with `email_alerts` off → suppressed and marked
  - one email per user even with multiple events
  - a mailer 429 stops later users and leaves them pending
  - a failed send leaves events pending, and the next run retries them
  - expiry after 24h
  - an exception for one user doesn't block others
  - quote chunking happens at 20
- Router, with FastAPI `TestClient` and `run_check_alerts` monkeypatched:
  - 503 without a secret
  - 401 with the wrong secret
  - 503 listing missing config names
  - 200 passes `market` and `force` through
  - the secret value never appears in any response

---

### Task 6: Cron workflow + ops docs

**Files:**
- Create: `.github/workflows/alerts.yml`
- Create: `docs/setup/alerts.md`

```yaml
name: price-alerts

on:
  schedule:
    - cron: '*/15 3-21 * * 1-5'   # UTC; covers IN 09:15–15:30 IST and US 09:30–16:00 ET (both DST states)
  workflow_dispatch:
    inputs:
      market: { description: 'in | us | both', default: 'both' }
      force: { description: 'bypass market-hours check', default: 'false' }

permissions: {}

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check alerts
        env:
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          JOB_SECRET: ${{ secrets.JOB_SECRET }}
          MARKET_INPUT: ${{ github.event.inputs.market || 'both' }}
          FORCE_INPUT: ${{ github.event.inputs.force || 'false' }}
        run: |
          set -euo pipefail
          if [ -z "${API_BASE_URL}" ] || [ -z "${JOB_SECRET}" ]; then echo "API_BASE_URL/JOB_SECRET not set"; exit 1; fi
          case "$MARKET_INPUT" in both) markets="in us";; in|us) markets="$MARKET_INPUT";; *) echo "bad market"; exit 1;; esac
          case "$FORCE_INPUT" in true|false) ;; *) echo "bad force"; exit 1;; esac
          status=0
          for m in $markets; do
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST \
              --max-time 120 --retry 2 --retry-delay 15 --retry-all-errors \
              -H "X-Job-Secret: ${JOB_SECRET}" \
              "${API_BASE_URL%/}/api/jobs/check-alerts?market=${m}&force=${FORCE_INPUT}")
            echo "market=$m HTTP $code"; cat /tmp/body; echo
            [ "$code" = "200" ] || status=1
          done
          exit $status
```

Inputs go into `env` and are then validated with `case`. They are never interpolated directly into the script, which prevents workflow injection.

`docs/setup/alerts.md` is a numbered guide:
1. Brevo → SMTP & API → **API Keys** → create a key (`xkeysib-…`). This is different from the SMTP key.
2. Supabase → Project Settings → API → **service_role** key. Warn that it is backend-only.
3. Generate a job secret: `openssl rand -hex 32`.
4. Render (backend) → Environment. Set `SUPABASE_URL` (project root, no path), `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `MAIL_FROM=hello@iamnishant.in`, `MAIL_FROM_NAME=StockPulse`, `JOB_SECRET`, and `APP_URL=https://swot.iamnishant.in`.
5. GitHub → repo Settings → Secrets and variables → Actions. Add `API_BASE_URL` (the backend root, e.g. `https://<service>.onrender.com`) and `JOB_SECRET`. The existing `BACKEND_URL` stays for keep-warm.
6. Run migration 2 in the Supabase SQL editor.
7. Test manually: Actions → price-alerts → Run workflow with market=in and force=true. Or run curl locally with placeholders: `curl -X POST -H "X-Job-Secret: <secret>" "http://localhost:8000/api/jobs/check-alerts?market=in&force=true"`.
8. **Local backend:** export the same vars in the shell that runs uvicorn. Never commit them.

---

### Task 7: Frontend — repo functions + Alerts page (TDD)

**Files:**
- Modify: `src/lib/userDataRepo.js` (+ tests)
- Create: `src/components/AlertsPage.jsx`
- Create: `src/components/AlertsPage.test.jsx`
- Modify: `src/routes.jsx` and `src/nav.js`. In My Stuff, add `{ to: '/alerts', label: 'Alerts', icon: Bell }`. The nav test needs the route to exist.

**Repo functions:** every one filters by `user_id`, and none of them throw.
- `listAlerts(client, userId)`: all rows (active and inactive), ordered by `created_at desc`.
- `listAlertEvents(client, userId, { limit = 50 })`: `select('id,price,triggered_at,emailed,alert:price_alerts(symbol,name,market,condition,target)')` ordered by `triggered_at desc`. The fake may not support embedded selects. If it doesn't, return the events, fetch alerts by `in('id', alertIds)`, and join them client-side. Do the same in both paths, so there's one code path.
- `createAlert(client, userId, { market, symbol, name, condition, target })`: upsert on `user_id,market,symbol,condition` with `active:true`, `last_triggered_at:null` and `defaultToNull:false`. Validate `target > 0` client-side, and return `{ error }` if it isn't.
- `rearmAlert(client, userId, id)`: update `{active:true, last_triggered_at:null}` with `.eq('id').eq('user_id')`.
- `deleteAlert(client, userId, id)`: delete with `.eq('id').eq('user_id')`.

**AlertsPage:**
- **No auth client:** `EmptyState` "Accounts aren't configured on this deployment."
- **Guest:** `EmptyState` with a `Bell` icon, "Sign in to get email alerts", "Set price targets on your Watchlist, or sign in to get an email when they hit." It has buttons for Sign in (with `state.from='/alerts'`) and Go to Watchlist.
- **Signed in:**
  - `PageHeader` "Alerts" with the description "We check every 15 minutes during market hours and email you when an alert triggers."
  - **Add alert** card (`SectionCard`):
    - a market pill toggle (defaults to the current market)
    - a symbol `Input`. Reuse the Watchlist-style search dropdown if it's simple to lift; otherwise a plain symbol input with an uppercase hint.
    - condition `select` (selectClass): Price above / Price below / Up % today / Down % today
    - a target `Input` of type number, `min > 0`
    - an Add button
  - **Active** table: symbol, market badge, condition text, target, created, and actions (Delete).
  - **Triggered** table: inactive alerts with `last_triggered_at`, plus Re-arm and Delete.
  - **History** table: from `listAlertEvents`, showing time, symbol, condition, trigger price, and emailed (Badge "Emailed" or "Pending").
  - After any create, re-arm or delete, reload the page's own lists AND call `useUserDataActions().reload()`, so the watchlist `alertHigh`/`alertLow` reflect the change.
  - Loading → Skeleton; errors → toast plus ErrorState with retry.
  - Currency by market (₹/$), and `tabular-nums`.
- Tests with the fake client:
  - guest state
  - disabled state
  - lists render from fake tables
  - create an above alert → row inserted, and `reload` called
  - validation rejects 0 or negative
  - re-arm sets active
  - delete removes it
  - history shows the Emailed/Pending badge

---

### Task 8: Verify + user end-to-end

1. Backend: `cd backend && .venv/bin/python -m pytest tests -q`. All pass, including the pre-existing tests.
2. Frontend: `npm test` all pass, `npm run lint` shows 0 errors, and `npx vite build` succeeds (then `rm -rf build`).
3. `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:8000/api/jobs/check-alerts?market=in` returns **503** when `JOB_SECRET` isn't set locally. That shows the route is wired and disabled safely. Restart uvicorn if needed, with the same venv and flags as before.
4. **The user does these:**
   1. Follow `docs/setup/alerts.md`.
   2. Set an alert on a stock that will clearly fire, e.g. RELIANCE above ₹1.
   3. Run the workflow manually with force=true.
   4. Check that:
      - the workflow log shows `triggered: 1, emailed: 1`
      - the email arrives with a correct symbol, price and links
      - `/alerts` shows it under Triggered and History (Emailed)
      - the watchlist alert field for it is cleared
      - Re-arm works
      - with Settings → email alerts off, a forced run shows `suppressed` and sends no email
5. Commit on approval. `main.py` needs special handling so the LOCAL_DEV patch stays out:
   ```bash
   git diff backend/main.py > "$TMPDIR/main.diff"
   # edit to keep only the router hunk, then:
   git apply --cached "$TMPDIR/main.diff"
   git add -A -- . ':!backend/main.py' ':!.env' ':!.env.*'
   git commit -m "feat(alerts): scheduled price-alert emails, alerts page and cron"
   ```

## Out of scope (Phase 6)

- Daily digest, the LLM summary and the welcome email.
- Holiday calendars.
- Per-alert cooldowns or repeat mode (alerts fire once and are re-armed manually).
