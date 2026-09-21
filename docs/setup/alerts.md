# Price-alert emails setup

A GitHub Actions cron (`.github/workflows/alerts.yml`, workflow **price-alerts**) runs every
15 minutes, 03:00–21:59 UTC on weekdays. Each run calls the backend endpoint
`POST /api/jobs/check-alerts?market=in|us` once per market. The backend:

1. checks every active alert against live quotes, deactivates the ones that fire (alerts fire
   once; users re-arm them on the Alerts page) and records an `alert_events` row. This step
   runs only while the market is open (or with `force=true`), allowing 20 minutes after the
   close so a late cron run still sees the closing price;
2. sends each affected user one Brevo email that summarises their triggered alerts. This
   step runs on every call, even when the market is closed, so emails still pending after
   Friday's close go out on the next cron run.

GitHub's scheduled runs are best effort: they often start 5–20 minutes late, and under load
a run can be skipped. The 20-minute close grace covers the usual delay; if the last run
before the close is very late or skipped, the closing price isn't evaluated that day.
Because pending emails are sent on every call, a skipped run only delays emails to the next
one.

Users with **Settings → email alerts** off still get events, but no email. Emails that fail
are retried on the next run for up to 24 hours. Emails Brevo rejects as invalid (HTTP 400)
are not retried. Market holidays aren't modelled: prices don't move on a holiday, so
nothing new fires.

The daily watchlist digest and the welcome email use the same secrets and endpoint
pattern; see [digest.md](./digest.md) once alerts are working.

All secrets live only in environment variables (Render) and GitHub Actions secrets. Never
commit them, paste them into issues, or put them in example files. The values below are
placeholders.

## Setup

1. **Brevo API key.** In Brevo, go to **SMTP & API → API Keys** and create a key
   (it looks like `xkeysib-…`). This is **not** the SMTP key used for Supabase auth emails.
   Also make sure the sender address (`MAIL_FROM`) is a verified sender or on a verified
   domain under **Senders, Domains & Dedicated IPs**.

2. **Supabase service-role key.** In Supabase, go to **Project Settings → API** and copy the
   **service_role** key. It bypasses row-level security: it is **backend-only**. Never put it
   in the frontend, a `VITE_*` variable, or the repo.

3. **Job secret.** Generate a random secret:

   ```bash
   openssl rand -hex 32
   ```

4. **Render (backend) → Environment.** Add:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` (project root, no path) |
   | `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` |
   | `BREVO_API_KEY` | `<brevo-api-key>` |
   | `MAIL_FROM` | `hello@iamnishant.in` |
   | `MAIL_FROM_NAME` | `StockPulse` |
   | `JOB_SECRET` | `<job-secret>` |
   | `APP_URL` | `https://swot.iamnishant.in` |

   Save; Render redeploys the service.

5. **GitHub → repo Settings → Secrets and variables → Actions.** Add these repository
   secrets:
   - `API_BASE_URL`: the backend root, e.g. `https://<service>.onrender.com` (no `/api`).
   - `JOB_SECRET`: the same value as on Render.

   The existing `BACKEND_URL` secret stays; the keep-warm workflow uses it.

6. **Run migration 2** in the Supabase SQL editor
   (`supabase/migrations/20260922000000_profile_email.sql`). See
   [supabase.md](./supabase.md). The job reads each user's email from `profiles.email`.

7. **Test it manually.**
   - GitHub: **Actions → price-alerts → Run workflow**, with `market` = `in` and
     `force` = `true`. The log shows one line per market, e.g. `market=in HTTP 200`, followed
     by the JSON result.
   - Or with curl against a local backend:

     ```bash
     curl -X POST -H "X-Job-Secret: <job-secret>" \
       "http://localhost:8000/api/jobs/check-alerts?market=in&force=true"
     ```

8. **Local backend.** Export the same variables in the shell that runs uvicorn (use your own
   test values). Never commit them, and don't add them to a tracked file:

   ```bash
   export SUPABASE_URL="https://<project-ref>.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
   export BREVO_API_KEY="<brevo-api-key>"
   export MAIL_FROM="<verified-sender@example.com>"
   export JOB_SECRET="<job-secret>"
   ```

## Re-running is safe

Running the job twice, or two runs overlapping (a manual run during a cron run, or curl
retrying after a timeout while the first request is still running on the backend), doesn't
cause duplicate events or emails:

- **Atomic fire.** Each alert fires through the SQL function `fire_alert`, which deactivates
  the alert and inserts its event in one transaction. An alert that's already inactive
  returns nothing, so it records at most one event.
- **Send claims.** Before emailing a user, the job claims their unsent events by setting
  `alert_events.claimed_at` in a single update that only matches events that are
  unclaimed or whose claim is older than 10 minutes. It emails only the events it claimed.
  A concurrent run gets nothing back for those events and skips the user. On success the
  events are marked emailed. After a failed or rate-limited send, the claim is released so
  the next run retries at once.
- If marking events emailed fails after a successful send (retried once), the events stay
  claimed, so they aren't re-sent for 10 minutes. After that the claim goes stale and the
  email may be sent again. The run reports `mark_emailed` in `errors`.

The workflow also sets `concurrency: price-alerts`, so GitHub never runs two checks at
once: a new run waits for the current one to finish.

curl uses `--retry 2 --retry-connrefused --retry-delay 15`. It retries when the connection
is refused (Render cold start), on HTTP 408/429/500/502/503/504, and **also after its own
120 s timeout**. curl counts a timeout as transient even without `--retry-all-errors`. A
retry after a timeout can overlap the first request, which is still running on the
backend, and the claims above keep that safe. It never retries a 207.

## Large data

Supabase caps a response at 1000 rows by default. The job reads active alerts and pending
events in pages (`order=id.asc&limit=1000&offset=…`) until a page comes back short, so
nothing is cut off. Profiles are looked up 100 user ids per request to keep URLs short.

## Response

A run that finishes returns its counts. It uses HTTP 200 when `errors` is empty:

```json
{
  "market": "in", "checked": 12, "symbols": 9, "triggered": 1,
  "emailed": 1, "suppressed": 0, "failed": 0, "invalid": 0, "expired": 0,
  "rate_limited": false, "errors": []
}
```

It uses **HTTP 207** with the same body when `errors` isn't empty: the run finished, but
something needs attention. The workflow treats anything other than 200 as a failure, so the
step (and the run) goes red while the counts still show in the log.

- `checked`: active alerts for the market; `symbols`: unique symbols quoted.
- `triggered`: alerts that fired on this run (events recorded).
- `emailed` / `suppressed` / `failed`: users emailed, users skipped because email alerts are
  off or they have no email (their events are marked done), and users whose send failed
  (retried next run).
- `invalid`: users whose email Brevo rejected as invalid (HTTP 400). Their events are marked
  done and not retried.
- `expired`: unsent events older than 24 hours, dropped without email.
- `rate_limited`: Brevo returned 429; sending stopped and the rest are retried next run.
- `errors`: short codes or exception type names only, never details:
  - `quotes:<Type>`: a quote batch failed; those alerts weren't evaluated this run.
  - `bad_symbol`: an alert's symbol is longer than 32 characters; it's skipped.
  - `mark_emailed`: an email went out but marking it failed twice (see above).
  - `brevo_auth`: Brevo returned 401/403 (bad API key or unauthorised sender). Sending
    stopped for this run and the events stay pending.
  - `release_events`: a claim couldn't be released; it expires after 10 minutes.
  - `<Type>`: an unexpected error while processing one user.

When the market is closed and `force` isn't set, alerts aren't evaluated (`checked`,
`symbols` and `triggered` are 0), but pending emails are still sent. The response then
includes `"skipped_evaluation": "market_closed"` alongside the counts.

## CORS

The backend's CORS policy allows only `GET` from browsers. That's intentional and doesn't
affect this endpoint: the cron calls it server-to-server with curl, and CORS applies only to
browsers. Don't widen `allow_methods` for the job.

## Troubleshooting

| Symptom | Meaning / fix |
| --- | --- |
| **HTTP 401** `{"error":"unauthorized"}` | The `X-Job-Secret` header doesn't match. Check that the GitHub `JOB_SECRET` secret and the Render `JOB_SECRET` are identical (no trailing newline or spaces). |
| **HTTP 503** `{"error":"jobs disabled"}` | `JOB_SECRET` isn't set on the backend. |
| **HTTP 503** `{"error":"jobs not configured","missing":[…]}` | Required settings are missing. The response lists the variable names (never values), e.g. `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_FROM`. Set them on Render and redeploy. |
| **HTTP 502** `{"error":"supabase error","status":…}` | Supabase is unreachable (`status: 0`) or rejected the request (e.g. `401`: wrong service-role key or `SUPABASE_URL`). Check both values; the URL must be the project root. |
| **HTTP 207** (counts with non-empty `errors`) | The run finished but hit problems. See the `errors` codes under [Response](#response). The workflow step fails so you notice. |
| **HTTP 500** `{"error":"job failed"}` | An unexpected error. The backend log has the exception type only. |
| `triggered: 0` | Usually the market was closed (you'll see `skipped_evaluation` unless you used `force=true`), or no alert target has been reached yet. Alerts that already fired are inactive until re-armed. |
| `errors: ["brevo_auth"]` | Brevo rejected the API key or the sender. Check `BREVO_API_KEY` (an API key, not the SMTP key) and that `MAIL_FROM` is a verified sender. |
| `failed` > 0, or the email never arrives | Check Brevo → **Transactional → Logs** for the message, and that the `MAIL_FROM` sender or its domain is verified. Also check the user's spam folder. Failed sends are retried for 24 hours. |
| `suppressed` > 0 | Those users have email alerts turned off in Settings, or no email on their profile (run migration 2). |
| Workflow fails with `API_BASE_URL/JOB_SECRET not set` | Add both GitHub Actions secrets (step 5). |
| Workflow shows `HTTP 000` | The backend didn't respond (Render cold start or down), or the request timed out after 120 s. curl retries twice; check the Render service. |
