# Phase 4: Supabase Accounts + Synced Watchlist/Portfolio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional sign-in through Supabase Auth (email/password, Google, password reset) and a settings page. Signed-in users get their watchlist, holdings and price alerts synced to Supabase Postgres; guests keep localStorage exactly as today. On a user's first sign-in, offer to import their local data.

**Architecture:**
- **Client and auth**
  - `src/lib/supabase.js` exports a client, or `null` when the `VITE_SUPABASE_*` env vars are missing. With `null`, the app runs guest-only and hides all auth UI, so deploys and tests work without keys.
  - `AuthProvider` wraps `supabase.auth`.
- **Data layer**
  - `UserDataProvider` holds the watchlist and holdings for both markets.
  - Hooks `useWatchlist(market)` and `useHoldings(market)` return `[items, setItems]`, the same shape as today's `useLocalStorage`, so the pages barely change.
  - Guests use localStorage under the existing keys.
  - Signed-in users are optimistic: local state updates first. A pure diff (`src/lib/sync.js`) turns prev → next into DB operations, and a repository (`src/lib/userDataRepo.js`) applies them. On error the provider reloads from the server and shows a toast.
- **Alerts**
  - Alerts stay as `alertHigh`/`alertLow` on watchlist items in the UI.
  - In the DB they are rows in `price_alerts` with `condition` 'above' or 'below', one row per (user, market, symbol, condition).
  - `pct_up`/`pct_down` exist in the schema for later; there is no UI for them yet.
- **Guest data after sign-in**
  - Guest localStorage is never modified by sign-in, import or sign-out. Signing out simply shows the guest data again.

**Tech Stack:** `@supabase/supabase-js` v2, the existing React/Vite/shadcn stack, and Vitest with a fake Supabase client. The SQL migration lives in `supabase/migrations/`.

**Design doc:** `docs/plans/2026-09-21-openstock-revamp-design.md` §2. Phase 3c is committed as `8a2638a`.

**Scope notes (deviations from the design doc):**
- The `/alerts` page, `alert_events`, email alerts and the welcome email move to Phases 5–6. This phase only creates the tables they will need.
- `UserDataContext` becomes hooks with the useLocalStorage shape, instead of per-mutation methods. That keeps the page diffs tiny.

---

## Environment notes (read first)

- `node_modules/fsevents` must NOT exist when vite/vitest runs. The backup stays at `$TMPDIR/fsevents.bak`, and `npm install` may recreate the folder, so delete it again after installing.
- Wrap long commands with `perl -e 'alarm 300; exec @ARGV' <cmd>`.
- Pass `--cache "$TMPDIR/npm-cache"` to npm.
- Leave the dev servers on :3000 and :8000 running.
- Never stage `backend/main.py` or `.env`.
- Do not commit, and do not run `git stash`.
- **No real Supabase project is needed to finish Tasks 1–9.** All tests use fakes. Task 10 is the user's manual end-to-end run after they create the project; see `docs/setup/supabase.md`.
- **Security:**
  - Only the anon key goes in the frontend.
  - Never write the service-role key into any file, test or doc example value.
  - RLS must be enabled on every table.

---

### Task 1: SQL migration + setup doc

**Files:**
- Create: `supabase/migrations/20260921000000_init.sql`
- Create: `docs/setup/supabase.md`

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260921000000_init.sql
-- StockPulse: user profiles, watchlist, holdings, price alerts. RLS on everything.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  default_market text not null default 'in' check (default_market in ('in','us')),
  email_alerts boolean not null default true,
  daily_digest boolean not null default true,
  digest_market text not null default 'in' check (digest_market in ('in','us')),
  welcome_sent_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null check (market in ('in','us')),
  symbol text not null,
  name text,
  added_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null check (market in ('in','us')),
  symbol text not null,
  name text,
  quantity numeric not null check (quantity > 0),
  buy_price numeric not null check (buy_price > 0),
  buy_date date,
  created_at timestamptz not null default now()
);

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null check (market in ('in','us')),
  symbol text not null,
  name text,
  condition text not null check (condition in ('above','below','pct_up','pct_down')),
  target numeric not null,
  active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, market, symbol, condition)
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.price_alerts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  price numeric not null,
  triggered_at timestamptz not null default now(),
  emailed boolean not null default false
);

create index on public.watchlist_items (user_id, market);
create index on public.holdings (user_id, market);
create index on public.price_alerts (market, active);
create index on public.alert_events (emailed) where not emailed;

alter table public.profiles enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.holdings enable row level security;
alter table public.price_alerts enable row level security;
alter table public.alert_events enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own watchlist" on public.watchlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own holdings" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts" on public.price_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- events are written by the backend (service role); users may only read their own
create policy "read own alert events" on public.alert_events
  for select using (auth.uid() = user_id);

-- auto-create a profile row for every new auth user
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Step 2: Write `docs/setup/supabase.md`**

This is a numbered user guide covering:
1. Create a free project at supabase.com and pick the region nearest your users (e.g. Mumbai `ap-south-1`).
2. SQL Editor → paste the migration → Run. (Alternatively: `supabase link` + `supabase db push`, if the CLI is installed.)
3. Project Settings → API → copy the **Project URL** and the **anon public** key into `.env.local` as `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`, and into the Vercel env vars. Explain that `.env.local` is gitignored, and that the **service_role** key must never go into the frontend or git.
4. Authentication → URL Configuration: set the Site URL to `https://swot.iamnishant.in`. Add the redirect URLs `http://localhost:3000/**` and `https://swot.iamnishant.in/**`.
5. Authentication → Providers → Email: keep "Confirm email" on.
6. Authentication → SMTP Settings (Brevo): host `smtp-relay.brevo.com`, port `587`, with the username and SMTP key from Brevo → SMTP & API. Set the sender to a verified sender address.
7. Optional, Google: create an OAuth client in Google Cloud Console → Credentials, with authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase → Providers → Google.
8. Verify RLS: Table Editor shows "RLS enabled" on all 5 tables.
9. Free tier note: the project pauses after about 7 days without activity. The Phase 5 cron will keep it active.

Commit nothing yet.

---

### Task 2: Supabase client + AuthProvider (TDD)

**Files:**
- Modify: `package.json`. Run `npm install @supabase/supabase-js --cache "$TMPDIR/npm-cache"`, then delete `node_modules/fsevents` if it reappears.
- Create: `src/lib/supabase.js`
- Create: `src/context/AuthContext.jsx`
- Create: `src/context/AuthContext.test.jsx`
- Create: `src/test/fakeSupabase.js`
- Modify: `src/index.jsx` (wrap the app in `AuthProvider`)

**Step 1: Client**

```js
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when not configured: the app then runs guest-only and hides auth UI.
export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export const isAuthEnabled = supabase !== null;
```

**Step 2: Fake client for tests**

`src/test/fakeSupabase.js` exports `createFakeSupabase({ session = null, tables = {} })`, which returns an object with:
- `auth`:
  - `getSession()` → `{ data: { session } }`
  - `onAuthStateChange(cb)` → stores `cb` and returns `{ data: { subscription: { unsubscribe() {} } } }`
  - `signInWithPassword`, `signUp`, `signInWithOAuth`, `resetPasswordForEmail`, `updateUser` and `signOut`, each a `vi.fn` resolving `{ data: {}, error: null }`
  - `_emit(event, session)` to trigger the callback
- `from(table)`: a chainable query builder over the in-memory `tables[table]` array. It supports:
  - `select()`, `eq(col, v)` (chainable, filters), `in(col, arr)`, `single()`, `maybeSingle()`
  - `insert(rows)`, `upsert(rows, { onConflict })`, `update(patch)` + `eq` filters, `delete()` + `eq` filters
  - It is awaitable (a thenable) and resolves `{ data, error: null }`.
  - Every call is recorded in `calls` for assertions.
  - Setting `failNext = true` makes the next operation resolve with `{ error: { message: 'boom' } }`.

Keep it small (~120 lines) and generic. Unit-test only what the other tests need.

**Step 3: Failing test**

```jsx
// src/context/AuthContext.test.jsx
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { createFakeSupabase } from '@/test/fakeSupabase';

function Probe() {
  const { user, loading, enabled } = useAuth();
  return <div>{loading ? 'loading' : `${enabled}|${user?.email ?? 'guest'}`}</div>;
}

test('disabled when no client', () => {
  render(<AuthProvider client={null}><Probe /></AuthProvider>);
  expect(screen.getByText('false|guest')).toBeInTheDocument();
});

test('loads existing session and reacts to auth events', async () => {
  const client = createFakeSupabase({ session: { user: { id: 'u1', email: 'a@b.c' } } });
  render(<AuthProvider client={client}><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('true|a@b.c')).toBeInTheDocument());
  act(() => client.auth._emit('SIGNED_OUT', null));
  expect(screen.getByText('true|guest')).toBeInTheDocument();
});
```

**Step 4: Implement `AuthContext.jsx`**

- `AuthProvider({ client = supabase, children })`.
- State: `session`, and `loading` (true until `getSession()` resolves; false immediately when `client` is null).
- Subscribe with `onAuthStateChange((event, s) => setSession(s))` and unsubscribe on unmount.
- Keep the last auth `event` in state; the reset-password page needs `PASSWORD_RECOVERY`.
- Context value:
  - `{ enabled: !!client, loading, session, user: session?.user ?? null, event, client }`
  - `signIn(email, password)` → `client.auth.signInWithPassword`
  - `signUp(email, password, fullName)` → `client.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: `${location.origin}/` } })`
  - `signInWithGoogle()` → `signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })`
  - `sendReset(email)` → `resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })`
  - `updatePassword(pw)` → `updateUser({ password: pw })`
  - `signOut()`
  - Every method returns `{ error }`, and none of them throw.
- `useAuth()` throws when used outside the provider.

Wire `<AuthProvider>` in `src/index.jsx` inside `ThemeProvider`, around `StockProvider`.

**Step 5:** Run the tests. Expect PASS. Then run `npm test`, and all tests must pass.

---

### Task 3: Pure mapping + diff (TDD)

**Files:**
- Create: `src/lib/sync.js`
- Create: `src/lib/sync.test.js`

**Contract:**
- `rowsToWatchlist(watchRows, alertRows)` returns items `{ symbol, name, alertHigh, alertLow, addedAt }`:
  - Sorted by `added_at` ascending.
  - `alertHigh` comes from the active `above` row's `target`, `alertLow` from the active `below` row's. Otherwise each is `null`.
- `rowsToHoldings(rows)` returns `{ id, symbol, name, buyPrice: Number(buy_price), quantity: Number(quantity), buyDate: buy_date }`.
- `diffWatchlist(prev, next)` returns `{ insertItems: [...], deleteSymbols: [...], upsertAlerts: [{symbol, name, condition, target}], deleteAlerts: [{symbol, condition}] }`:
  - Items are keyed by `symbol`.
  - An added item → `insertItems`, plus an `upsertAlerts` entry if its `alertHigh`/`alertLow` is set.
  - A removed item → `deleteSymbols`, plus `deleteAlerts` for both conditions.
  - A changed `alertHigh`: set to a number → upsert `above`; set to null → delete `above`. `alertLow` works the same way with `below`.
- `diffHoldings(prev, next)` returns `{ insert: [...], update: [...], delete: [ids] }`, keyed by `id`:
  - New ids → insert.
  - Missing ids → delete.
  - Same id with any of `symbol`, `name`, `buyPrice`, `quantity` or `buyDate` changed → update.
  - Skip items with `isDemo`.
- `watchlistToRows(items, userId, market)`, `holdingToRow(h, userId, market)` and `alertRow(userId, market, a)` map camelCase to snake_case. `holdingToRow` keeps `id`, so client-generated UUIDs are preserved.

**Step 1: Write the tests**

Cover every rule above with concrete arrays. Minimum:
- watchlist add with an alert
- watchlist remove
- alert set, change and clear
- holdings add, edit and remove
- the demo item is ignored
- `rowsToWatchlist` merge, including an inactive alert, which is ignored
- round trip: `rowsToHoldings(holdingToRow(h))` deep-equals `h` (minus `user_id`/`market`)

**Step 2:** Run the tests. Expect FAIL.

**Step 3:** Implement the functions as pure code with no Supabase imports.

**Step 4:** Run the tests. Expect PASS.

---

### Task 4: Repository (TDD with the fake client)

**Files:**
- Create: `src/lib/userDataRepo.js`
- Create: `src/lib/userDataRepo.test.js`

**API:**
- `loadAll(client, userId)` returns `{ in: { watchlist, holdings }, us: { watchlist, holdings } }`.
  - It runs 3 queries: `watchlist_items`, `holdings` and `price_alerts` (with `active = true`), each filtered by `user_id` (RLS enforces this anyway; the filter is for clarity).
  - It then groups by market and maps through `sync.js`.
- `applyWatchlistDiff(client, userId, market, diff)` runs these steps in order, stopping at the first error and returning `{ error }`:
  1. Insert items: upsert on conflict `user_id,market,symbol`.
  2. Upsert alerts: on conflict `user_id,market,symbol,condition`, with `active: true`.
  3. Delete alerts, matched with `eq` on `user_id`, `market`, `symbol` and `condition`.
  4. Delete items, matched with `eq` on `user_id` and `market` plus `in('symbol', deleteSymbols)`.
- `applyHoldingsDiff(client, userId, market, diff)`:
  1. Insert.
  2. Update each item with `update(...).eq('id', id)`.
  3. Delete with `in('id', ids)`.
- `getProfile(client, userId)` returns the profile. `updateProfile(client, userId, patch)` updates it.
- `importLocal(client, userId, { in: {watchlist, holdings}, us: {...} })`:
  - Upserts all watchlist items and alerts, and holdings (upsert on `id`, so running it twice doesn't duplicate).
  - Then sets `profiles.imported_at = now()`.
  - Returns `{ counts: { watchlist, holdings, alerts }, error }`.
- `markImported(client, userId)` sets `imported_at` only; used for "skip".

**Tests:** use the fake client:
- `loadAll` groups and merges correctly.
- The apply functions issue the expected calls; assert on `calls`.
- An error from step 1 stops before step 2.
- Calling `importLocal` twice leaves no duplicates in the fake tables.

---

### Task 5: UserDataProvider + hooks (TDD)

**Files:**
- Create: `src/context/UserDataContext.jsx`
- Create: `src/context/UserDataContext.test.jsx`
- Modify: `src/index.jsx` (wrap in `UserDataProvider` inside `AuthProvider` and `MarketProvider`)

**Behaviour:**
- **Guest** (no user):
  - `useWatchlist(m)` is exactly `useLocalStorage(`stockpulse_watchlist_${m}`, [])`.
  - `useHoldings(m)` is exactly `useLocalStorage(`stockpulse_portfolio_${m}`, [])`.
- **Signed-in:**
  - On user change, call `loadAll` and set `status` to 'loading' then 'ready'.
  - The setter accepts a value or an updater, like useLocalStorage:
    1. Compute `next`.
    2. `setState(next)` (optimistic).
    3. `diff = diffX(prev, next)`.
    4. If the diff isn't empty, call `applyX`.
    5. On `{ error }`: `toast.error('Couldn't save — reloaded your data')`, then `loadAll` again.
  - Serialize writes per collection and market with a promise chain, so rapid edits apply in order.
- `useUserDataStatus()` returns `{ mode: 'guest' | 'account', status: 'loading' | 'ready' }`.
- **Sign-out:** clear the account state, so the hooks go back to localStorage. Guest data was never touched.

**Implementation notes:**
- Hooks can't be called conditionally. Inside each hook, always call `useLocalStorage` (for guest mode) and read the context. Return the local tuple when `mode === 'guest'`, and the context-backed tuple otherwise.
- Keep the provider's account state as `{ in: {watchlist, holdings}, us: {...} }` in one `useState`, updated immutably.

**Tests** (with the fake client and `AuthProvider client={fake}`):
1. Guest: adding via the setter writes to localStorage under the existing key.
2. Signed-in: the initial data comes from the fake tables. Guest localStorage data is NOT shown.
3. Signed-in: adding an item calls upsert on `watchlist_items`, and state updates immediately.
4. Signed-in: when the fake has `failNext`, state reloads to the server data and `toast.error` is called (mock `sonner`).
5. Signing out (emit `SIGNED_OUT`) shows guest localStorage data again.

---

### Task 6: Wire pages to the hooks

**Files:**
- `src/components/WatchlistPage.jsx`: line ~126, `useLocalStorage(\`stockpulse_watchlist_${market}\`…)` → `useWatchlist(market)`
- `src/components/PortfolioPage.jsx`: lines ~154 and ~156, holdings → `useHoldings(market)`, watchlist → `useWatchlist(market)`. Keep `SEEN_FLAG_KEY` on localStorage, since it's a device-level UI flag.
- `src/components/TaxCalculatorPage.jsx`: line ~58 → `useHoldings(market)`
- `src/hooks/useAlertNotifications.js`:
  - Read both markets through the hooks: `const [wIn] = useWatchlist('in'); const [wUs] = useWatchlist('us');`.
  - Keep the legacy `stockpulse_watchlist` read for guests only.
  - The check logic stays the same; it now iterates the combined array passed in.
  - Keep the check in a ref-stable callback so the interval doesn't reset on every render.

Page logic is otherwise unchanged, because the setter API is the same. Run `npm test`; the existing tests must pass. They render with no Supabase client, so guest mode is active.

Add one test in `UserDataContext.test.jsx`: `useAlertNotifications` sees items from both markets. Or, if that's too coupled, document a manual check instead.

---

### Task 7: Auth pages + TopBar user menu

**Files:**
- Create: `src/components/auth/AuthLayout.jsx`
- Create: `src/components/auth/LoginPage.jsx`
- Create: `src/components/auth/SignupPage.jsx`
- Create: `src/components/auth/ForgotPasswordPage.jsx`
- Create: `src/components/auth/ResetPasswordPage.jsx`
- Create: `src/components/auth/auth.test.jsx`
- Create: `src/components/layout/UserMenu.jsx`
- Modify: `src/routes.jsx` (add `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/settings`)
- Modify: `src/nav.test.js` (add these paths to `NON_NAV`)
- Modify: `src/components/layout/TopBar.jsx`

**UI** (use shadcn `Card`, `Input`, `Button`, and `Label`, adding `label` via shadcn if needed; apply the shadcn fix-up rule from the Phase 3b notes):
- `AuthLayout`: a centred `max-w-sm` card inside `PageContainer`, with the title, description and children.
- **Login:**
  - Email and password with `<form>` submit, then "Sign in".
  - A divider, then "Continue with Google" (outline button).
  - Links to "Forgot password?" and "Create account".
  - On success, `navigate(location.state?.from ?? '/')`. On error, show `text-loss` with `role="alert"`.
- **Signup:**
  - Name, email and password (min 8, with `aria-describedby` hint text).
  - On success, show "Check your email to confirm your account." and don't navigate.
- **Forgot:** email → `sendReset` → "If an account exists, a reset link is on its way." Show this same message whether or not the account exists.
- **Reset:**
  - If `event === 'PASSWORD_RECOVERY'` or a session exists, show the new-password form, then call `updatePassword`, then a success toast and `navigate('/')`.
  - Otherwise show "Open the reset link from your email."
- If `!enabled`: every auth page renders `EmptyState` "Accounts aren't configured on this deployment."
- **UserMenu** in `TopBar`, after the theme toggle:
  - Hidden when `!enabled`.
  - Guest: a `Button variant="outline" size="sm"` linking to "Sign in".
  - Signed-in: a `DropdownMenu` whose trigger is an avatar circle (`bg-primary text-primary-foreground`, first initial, `aria-label="Account menu"`). The content has the email (muted), Settings, and Sign out.
  - Signing out calls `signOut`, then `toast('Signed out')`, then `navigate('/')`.

**Tests:**
- Login submits and calls `signIn` with the typed values.
- A shown error has `role="alert"`.
- Signup shows the confirmation message.
- Forgot shows the neutral message.
- Pages show the disabled state with no client.
- UserMenu shows "Sign in" for a guest and the avatar menu for a user.

---

### Task 8: Settings page

**Files:**
- Create: `src/components/SettingsPage.jsx`
- Create: `src/components/SettingsPage.test.jsx`

**Behaviour:**
- If there's no user: redirect to `/login`, with `state.from = '/settings'`.
- Load the profile through `getProfile`, then show:
  - Display name (`Input`).
  - Default market (`selectClass` select: IN / US).
  - Email alerts toggle.
  - Daily digest toggle.
  - Digest market select.
  - Toggles are native checkboxes styled with `accent-primary size-4` and a `<label>`, or a shadcn `switch` if added.
- "Save" calls `updateProfile`, then `toast.success('Saved')`.
- A "Danger zone" section holds only "Sign out". Account deletion is out of scope.
- The default market doesn't auto-switch the app. It's used by later phases (digest).

**Test:** the form loads the profile values from the fake, and Save calls update with the changed fields.

---

### Task 9: Guest → account import (TDD)

**Files:**
- Create: `src/components/auth/ImportLocalDataDialog.jsx`
- Create: `src/components/auth/ImportLocalDataDialog.test.jsx`
- Modify: `src/App.jsx` (render the dialog once, inside `AppShell`)

**Behaviour:**
- When a user signs in and the profile has `imported_at === null`, read the guest localStorage for both markets (watchlist, holdings excluding `isDemo`, and alerts derived from `alertHigh`/`alertLow`).
- If any counts are > 0, open a `Dialog`:
  - Title: "Bring your local data?"
  - Body: "Import N watchlist stocks, M holdings and K price alerts from this browser into your account."
- Buttons:
  - "Import" → `importLocal`, then `toast.success`, then reload the provider (expose `reload()` from `UserDataProvider`).
  - "Skip" → `markImported`, so it won't ask again.
  - Closing with Esc or the overlay doesn't mark anything; it asks again next session.
- Guest localStorage is never modified.

**Tests:**
- The dialog appears with the correct counts.
- Import calls `importLocal` with the local data and then `reload`.
- Skip calls `markImported`.
- The dialog does not appear when `imported_at` is set or local data is empty.

---

### Task 10: Verify + user end-to-end

1. `npm test` passes (all tests), `npm run lint` shows 0 errors, and `npx vite build` succeeds (then `rm -rf build`).
2. **Without env vars** (the current dev server): the app behaves exactly as before, with no auth UI.
3. **User-only steps:**
   1. Follow `docs/setup/supabase.md`.
   2. Put the URL and anon key in `.env.local`.
   3. Restart the dev server.
   4. Then check:
      - Sign up, confirm the email (it arrives through Brevo), and sign in.
      - The import dialog offers your local data. Import it, and the watchlist and portfolio show the same items.
      - Add or remove a stock, set an alert and add a holding, then reload the page: the changes persist. Open a second browser, sign in, and the same data appears.
      - Sign out: the guest data is still there, unchanged.
      - Forgot password: the email arrives, the reset link opens `/reset-password`, and the new password works.
      - Google sign-in, if configured.
      - Settings saves and persists after a reload.
      - RLS: in the Supabase SQL editor, run `select count(*) from watchlist_items;` as the anon role (it returns 0 rows), or sign in as a second user and confirm the first user's data is not visible.
4. Commit when the user approves:
   ```bash
   git add -A -- . ':!backend/main.py' ':!.env'
   git commit -m "feat(auth): Supabase accounts with synced watchlist, portfolio and alerts"
   ```

## Out of scope (later phases)

- `/alerts` page, alert history and percentage alerts in the UI (Phase 5).
- Backend jobs, email alerts, digest, welcome email, and the GitHub Actions cron (Phases 5–6).
- Account deletion, and syncing chart drawings.
