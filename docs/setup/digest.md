# Daily digest and welcome email setup

Two more GitHub Actions crons call the backend, in the same way as the
[price-alert emails](./alerts.md). They use the same `X-Job-Secret` header, the same
`API_BASE_URL` and `JOB_SECRET` GitHub secrets, and the same Supabase and Brevo settings on
Render. Set up price alerts first.

- **Daily digest** (`.github/workflows/digest.yml`, workflow **daily-digest**). It runs on
  weekdays after each market closes and calls `POST /api/jobs/daily-digest?market=in|us`.
  Each opted-in user gets one email covering their watchlist for that market: each symbol's
  day move, its top headlines with sentiment, and a short AI summary of the news.
  - The summary comes from **Groq**. If Groq fails, **OpenRouter** is tried. If both fail
    (or neither key is set), the email goes out without a summary.
  - Each email covers at most 12 symbols, in watchlist order.

  | Cron (UTC) | Market | Local time |
  | --- | --- | --- |
  | `0 11 * * 1-5` | `in` | 16:30 IST (close 15:30) |
  | `0 12 * * 1-5` | `in` (retry) | 17:30 IST |
  | `30 21 * * 1-5` | `us` | 17:30 EDT in summer, 16:30 EST in winter (close 16:00 ET) |
  | `30 22 * * 1-5` | `us` (retry) | 18:30 EDT in summer, 17:30 EST in winter |

  The backend works out the market-local date (`digest_date`). Unless `force=true` is set,
  it sends only on a local weekday at least 30 minutes after the close: from 16:00 IST for
  India and from 16:30 ET for the US. A GitHub run that starts late still counts, up to local
  midnight.

  **Same-day retry.** Each market has a second cron about an hour after the first. Users
  who were already sent are skipped (their `digest_sends` claim), so the retry only reaches
  users the first run didn't: failed sends, users left unreached after a Brevo 429, and
  users deferred by the time budget. Failed or unreached users are retried once, about an
  hour later, the same day. After that, they simply get the next digest. A manual **Run
  workflow** before local midnight also retries them. The cron strings must match the
  `case` patterns in the workflow's run script; `backend/tests/test_workflows.py` checks
  both directions.
- **Welcome email** (`.github/workflows/welcome.yml`, workflow **welcome-email**). It runs
  every 30 minutes, every day, and calls `POST /api/jobs/send-welcome`. Each user created in
  the last 7 days who hasn't had a welcome email yet gets one. The frequent run also keeps
  the free Supabase project from pausing.

All secrets live only in environment variables (Render) and GitHub Actions secrets. The
values below are placeholders. Never commit real keys.

## Setup

1. **Groq key (AI summary).** Go to [console.groq.com](https://console.groq.com) →
   **API Keys** → **Create API Key**. Groq has a free tier. The default model is
   `llama-3.3-70b-versatile`.

2. **OpenRouter key (optional fallback).** Go to [openrouter.ai](https://openrouter.ai) →
   **Keys** → **Create Key**. Free models have a `:free` suffix. The default model is
   `meta-llama/llama-3.3-70b-instruct:free`.

   > **Model ids must be verified.** Providers rename and retire models. Before you
   > deploy, and whenever summaries stop appearing, check each id against the provider's
   > model list: [console.groq.com/docs/models](https://console.groq.com/docs/models) and
   > [openrouter.ai/models](https://openrouter.ai/models). If an id has changed, set
   > `LLM_MODEL_GROQ` or `LLM_MODEL_OPENROUTER` (step 3).

3. **Render (backend) → Environment.** Add these, next to the variables from
   [alerts.md](./alerts.md):

   | Variable | Value |
   | --- | --- |
   | `GROQ_API_KEY` | `<groq-api-key>` |
   | `OPENROUTER_API_KEY` | `<openrouter-api-key>` (optional) |
   | `LLM_MODEL_GROQ` | optional; default `llama-3.3-70b-versatile` |
   | `LLM_MODEL_OPENROUTER` | optional; default `meta-llama/llama-3.3-70b-instruct:free` |
   | `LLM_MAX_CALLS_PER_RUN` | optional; default `60`. This caps LLM requests per digest run, across both providers. Users after the cap get no summary. |

   Both LLM keys are optional. With neither set, the digest still goes out without a
   summary, and the response includes `"notes": ["llm_unconfigured"]`. `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `MAIL_FROM` and `JOB_SECRET` are required,
   as for alerts.

4. **Run migration 3** in the Supabase SQL editor
   (`supabase/migrations/20260923000000_digest_sends.sql`). See
   [supabase.md](./supabase.md). It creates the `digest_sends` table, which stops a user
   from getting the same digest twice.

5. **Who gets the digest.** Users choose under **Settings → Daily digest** (on or off) and
   **Digest market** (India or US). Each user gets one digest a day, for one market.

   > **Every new user is subscribed by default.** `profiles.daily_digest` defaults to `true`
   > and `profiles.digest_market` defaults to `in` (migration 1). So every account,
   > including existing ones, gets the India digest unless the user turns it off. To make
   > the digest opt-in instead, run this in the SQL editor:
   >
   > ```sql
   > alter table public.profiles alter column daily_digest set default false;
   > -- optional: also unsubscribe existing users
   > -- update public.profiles set daily_digest = false;
   > ```
   >
   > Users can still turn it on in Settings.

   Only users whose watchlist has symbols for their digest market get an email. The rest
   are counted as `empty`.

6. **Test the digest.** In GitHub, go to **Actions → daily-digest → Run workflow** and set
   `market` = `in` and `force` = `true`. The log shows `market=in HTTP 200` followed by the
   JSON result. Run it again: the second run reports `already_sent`. Or use curl against a
   local backend:

   ```bash
   curl -X POST -H "X-Job-Secret: <job-secret>" \
     "http://localhost:8000/api/jobs/daily-digest?market=in&force=true"
   ```

7. **Test the welcome email.** Create a new account, then either run **Actions →
   welcome-email → Run workflow** or wait up to 30 minutes.

   The first run also welcomes existing accounts created in the last 7 days that haven't
   had a welcome email. Older accounts never get one.

## Privacy

Only market data goes to the LLM providers, **Groq** and **OpenRouter**: the market, the
date, and each watchlist symbol with its day change and headline titles. User names, email
addresses and ids are never sent. The backend never logs API keys, prompts, completions or
email addresses.

### AI summary

Headlines are treated as untrusted data: the prompt tells the model never to follow
instructions inside them. The model's reply is also untrusted. It is cut down to short plain
text (markup, `https://`/`www.` links and email addresses are removed) and HTML-escaped
before it goes into the email. If the model output contains anything that looks like a
link, the summary is dropped: a bare domain such as `evil.shop` (in any script, or with a
fullwidth or defanged dot) fails the whole summary rather than being cut out, because
cutting it could change the meaning (`S&P 500 rose.Nasdaq fell`). NSE tickers like
`TCS.NS` are allowed. The email then goes out without a summary and counts as an
`ai_fallback`. Every summary carries the footnote "Generated from headlines; may be
inaccurate. Not investment advice."

Check each provider's data and retention policy (and OpenRouter's upstream provider for
the model you pick) before you enable it. Leave a key unset to keep that provider out of
the loop.

## Re-running is safe

- **Digest.** Before building a user's email, the job claims a
  `digest_sends (user_id, market, digest_date)` row. The unique key means only one run can
  claim it, so a second run, or an overlapping one, skips that user (`already_sent`).
  - A claim marked `failed` can be retried by a later run for the same `digest_date`: the
    same-day retry cron, or a manual run before local midnight.
  - So can a claim stuck in `claimed` for more than 30 minutes, for example after a crash.
  - Users never claimed (after a Brevo 429, or deferred by the time budget) are picked up
    the same way.
  - The workflow also sets `concurrency: daily-digest`, so the retry cron waits for a
    first run that is still going.
- **Welcome.** The job claims each profile by setting `welcome_sent_at`, and only while it
  is still null. A run that finds it already set skips the user (`skipped`).
  - If the send fails or is rate limited, the claim is released and the next run retries.
    A Brevo failure that keeps recurring is retried every 30 minutes (each cron run) for up
    to 7 days, until the account falls out of the candidate window.
  - If Brevo rejects the address as invalid, the claim is kept, so the user isn't retried.
  - If the send fails **and** releasing the claim also fails (for example Supabase is down
    at that moment), the user keeps `welcome_sent_at` and never gets the welcome email
    automatically. This is an accepted edge case, but it is always visible: the run reports
    `release_welcome` in `errors`, returns HTTP 207 and fails the workflow. See
    [Troubleshooting](#troubleshooting) for the fix.
- **Timeouts.** curl retries twice, including after its own timeout. The digest allows
  `--max-time 300` per attempt because a run with LLM calls takes longer, so its job has
  `timeout-minutes: 20` (3 × 300 s plus the 15 s retry delays is about 15.5 minutes). The
  welcome run allows 60 seconds per attempt, with `timeout-minutes: 5`. A retry that
  overlaps a request still running on the backend is safe because of the claims above.
  - **Time budget.** The digest job itself stops after 240 seconds, well inside curl's
    300 s, so a normal run answers before curl gives up. Once the budget is spent it
    finishes the user in progress, claims nobody new, and reports the rest as `deferred`
    with `"notes": ["time_budget"]` (HTTP 200). The same-day retry cron sends them.
  - **Scaling.** Emails go out one at a time, and each user can wait up to 20 s per LLM
    attempt, so a run covers roughly 30 to 100 users within the budget, depending on LLM
    latency. Two runs a day per market is enough for a small user base. If `deferred` shows
    up regularly, add more retry crons (each needs a matching `case` line), or send users
    concurrently in the backend.

## Response

The digest returns HTTP 200 when `errors` is empty, and **HTTP 207** with the same body when
it isn't. The workflow fails on anything other than 200.

```json
{
  "market": "in", "digest_date": "2026-09-22", "recipients": 40, "empty": 12,
  "emailed": 27, "already_sent": 1, "failed": 0, "invalid": 0, "rate_limited": false,
  "deferred": 0, "ai_summaries": 26, "ai_fallbacks": 1, "llm_calls": 28,
  "budget_exhausted": false, "symbols": 85, "errors": [], "warnings": []
}
```

- `recipients`: opted-in users for this market. `empty`: those with no symbols on their
  watchlist for the market (no email).
- Every other recipient lands in exactly one of `emailed`, `failed`, `invalid`,
  `already_sent` and `deferred`, so they add up to `recipients - empty`.
  - `emailed`: digests sent.
  - `failed`: digests not sent: the send failed, Brevo returned 429 or an auth error for
    that user, or processing that user raised. Retried by the same-day retry cron.
  - `invalid`: addresses Brevo rejected (not retried).
  - `already_sent`: users already claimed or sent for this date.
  - `deferred`: users not attempted because sending stopped early (Brevo 429 or auth
    error, or the time budget). Sent by the same-day retry cron.
- `rate_limited`: Brevo returned 429. Sending stopped.
- `ai_summaries` / `ai_fallbacks`: emails with and without an AI summary (a summary
  dropped by the link check counts as a fallback).
- `llm_calls` counts LLM requests, including failed ones. `budget_exhausted` means a
  configured provider was skipped because `LLM_MAX_CALLS_PER_RUN` was reached (it is
  always `false` when no LLM key is set).
- `symbols`: unique symbols quoted.
- `errors`: an email was lost or its outcome wasn't recorded. Any entry makes the run
  return HTTP 207 and fails the workflow. Short codes only.
  - `brevo_auth`: Brevo rejected the API key or the sender. Sending stopped.
  - `finish_digest`: the send result couldn't be recorded.
  - `<Type>`: an unexpected error for one user (also counted in `failed`).
- `warnings`: soft failures; the emails still went out, and the run still returns 200.
  - `news:<Type>`: one symbol's news fetch failed. `news:TimeoutError` means it took over
    15 seconds. The email goes out without that symbol's headlines.
  - `quotes:<Type>`: a quote batch failed. Those prices show as `-`.
- `notes` (only present when there is one; informational, not errors):
  - `time_budget`: the run hit its 240 s budget; see `deferred`.
  - `llm_unconfigured`: neither LLM key is set.
- Outside the send window (and without `force`), the response is
  `{"market": "in", "digest_date": "…", "skipped": "not_after_close"}` with HTTP 200.

The welcome job returns:

```json
{ "candidates": 1, "emailed": 1, "skipped": 0, "failed": 0, "invalid": 0,
  "rate_limited": false, "errors": [] }
```

Here `skipped` counts users another run claimed first. `errors` can include `brevo_auth`,
`release_welcome` (a claim couldn't be released, so that user isn't retried automatically;
see [Troubleshooting](#troubleshooting)) and `<Type>`.

## Troubleshooting

HTTP 401, 502 and 503, and Brevo problems, work the same as for alerts. See
[alerts.md → Troubleshooting](./alerts.md#troubleshooting).

| Symptom | Meaning / fix |
| --- | --- |
| `already_sent` > 0 | Those users already got (or are getting) today's digest for this market. This is expected on a re-run. To resend for testing, delete the user's row for that date from `digest_sends` in the Supabase table editor. |
| `ai_fallbacks` > 0 and `ai_summaries` is 0 | Every LLM call failed. Check `GROQ_API_KEY` and `OPENROUTER_API_KEY`, and check that the model ids still exist ([Groq models](https://console.groq.com/docs/models), [OpenRouter models](https://openrouter.ai/models)). A wrong key disables that provider for the run. The backend log shows the provider name and HTTP status only. |
| `ai_fallbacks` > 0 alongside some `ai_summaries` | Some calls failed or were rate limited, or `budget_exhausted` is `true` (raise `LLM_MAX_CALLS_PER_RUN`). |
| `notes: ["llm_unconfigured"]` | Neither LLM key is set on Render. The digest goes out without a summary. |
| `empty` > 0 | Those users have nothing on their watchlist for their digest market. They may have picked the wrong **Digest market** in Settings. |
| `skipped: "not_after_close"` | The run fell outside the send window: a weekend, before close + 30 minutes, or after local midnight. Use `force=true` to test. Market holidays aren't modelled, so a holiday digest shows the previous close. |
| `recipients: 0` | Nobody has the digest on for this market, or their profiles have no email (run migration 2). |
| **HTTP 207** | The run finished with problems: at least one email was lost or not recorded. Check `errors` under [Response](#response). `brevo_auth` stops sending. News and quote failures are `warnings` and never cause a 207. |
| `deferred` > 0 with `notes: ["time_budget"]` | The run used its 240 s budget. The same-day retry cron sends the rest. If it happens every day, see **Scaling** under [Re-running is safe](#re-running-is-safe). |
| `failed` or `deferred` > 0 after the retry cron | Those users missed today's digest and get the next one. Run the workflow manually before local midnight to try again. |
| **HTTP 000** in the workflow log | The backend didn't respond: a Render cold start, the service is down, or the request timed out (300 s for the digest, 60 s for the welcome run). |
| `errors` includes `release_welcome` | A welcome send failed and the claim couldn't be released, so the user still has `welcome_sent_at` set and won't be retried. Find the user in `profiles` (a `welcome_sent_at` around the run time, and no `welcome` message in Brevo → **Transactional → Logs**), then run this in the SQL editor so the next run sends it: `update profiles set welcome_sent_at = null where id = '<user-id>';` |
| No welcome email | Check that the profile has an email, was created in the last 7 days and has a null `welcome_sent_at`. Also check Brevo → **Transactional → Logs** (tag `welcome`) and the spam folder. |
