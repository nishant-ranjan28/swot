# Leaked News API Keys: Rotate, Remove Dead Client Code, Prevent Recurrence

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:**
- Make every news/market API key that was ever committed to this **public** repo worthless.
- Remove the last client-side code that reads a news key.
- Stop secrets reaching git or the browser bundle again.

**Findings (2026-09-22):**
- `.env` was tracked in git history from Feb 2025 until `30f7274` (2026-09-21). The repo is public, so assume every value in it is compromised.
- Variables that were committed:

  | Provider | Variables |
  |---|---|
  | GNews | `REACT_APP_GNEWS_API_KEY`, `REACT_APP_GNEWS_API_KEY_1` … `_6` (7 keys) |
  | NewsAPI.org | `REACT_APP_NEWS_API_KEY`, `REACT_APP_NEWSAPI_KEY` |
  | NewsData.io | `REACT_APP_NEWSDATA_API_KEY` |
  | Finnhub | `REACT_APP_FINNHUB_API_KEY` |
  | Marketstack | `REACT_APP_MARKETSTACK_API_KEY` |

- A scan of the full history found no key literals hardcoded in `src/` or `backend/`.
- **News fetching already happens on the backend.** `NewsPage` calls `/api/stocks/news…`, which uses Google News RSS and yfinance. No key is needed.
- `src/services/newsService.js` is dead code. Nothing imports it, but it still reads `REACT_APP_NEWSAPI_KEY` and calls newsapi.org. Vite drops unimported modules, so it isn't in the bundle today; the risk is that someone re-imports it.

**Architecture:** no new features. This is mostly key rotation by the user, plus a small code cleanup and a guard test.

**Branch:** `fix/news-keys-cleanup`, created from `main` with `git switch --no-track -c`. The sandbox can't write `.git/config`, so push without `-u`.

---

## Environment notes

- The local checkout is on `main`. `backend/main.py` carries the user's uncommitted `LOCAL_DEV` patch. This plan doesn't touch that file, so switching branches is fine.
- **Never check out old local branches.** Some of them still track `.env`, and checking one out would overwrite the real file.
- `node_modules/fsevents` must not exist when vite or vitest runs. The backup is at `$TMPDIR/fsevents.bak`.
- Never read or print `.env` values. Key *names* are fine.

---

### Task 1: Rotate every leaked key (user-only; do first)

Revoking is what protects you. Deleting history does not: clones, forks and caches already have it.

For each provider: sign in, **delete or regenerate the key**, and if the app no longer uses that provider, don't create a replacement. The current app uses none of them, because news comes from Google News RSS.

1. **GNews** (gnews.io → Dashboard): regenerate or delete all keys. The 7 committed keys may belong to several accounts, so check each account you used.
2. **NewsAPI.org** (newsapi.org/account): regenerate the API key.
3. **NewsData.io** (newsdata.io → Dashboard → API Key): regenerate.
4. **Finnhub** (finnhub.io/dashboard): regenerate.
5. **Marketstack** (marketstack.com/dashboard): reset the access key.

For each one, also check the dashboard's usage graph for unexpected traffic. If a paid plan is attached to any of these accounts, look for charges since Feb 2025.

---

### Task 2: Remove dead client-side key code (TDD)

**Files:**
- Delete: `src/services/newsService.js`. Delete `src/services/` too if it ends up empty.
- Create: `src/security/noClientSecrets.test.js`

**Step 1: Write the guard test.** It scans source files and fails if client code reads a secret-looking env var or calls a keyed news API.

```js
// src/security/noClientSecrets.test.js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
// Public by design: the Supabase anon key is protected by RLS.
const ALLOWED = new Set(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'REACT_APP_API_URL']);
const SECRET_ENV = /import\.meta\.env\.((?:VITE|REACT_APP)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)/g;
const KEYED_HOSTS = /(newsapi\.org|gnews\.io|newsdata\.io|finnhub\.io|marketstack\.com)/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(js|jsx)$/.test(name) && !/\.test\.jsx?$/.test(name) ? [p] : [];
  });
}

test('client code reads no secret env vars besides the public allow-list', () => {
  const offenders = [];
  for (const f of files(SRC)) {
    for (const [, name] of readFileSync(f, 'utf8').matchAll(SECRET_ENV)) {
      if (!ALLOWED.has(name)) offenders.push(`${f}: ${name}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('client code never calls keyed third-party news/market APIs directly', () => {
  const offenders = files(SRC).filter((f) => KEYED_HOSTS.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});
```

**Step 2:** Run `npx vitest run src/security`. Expect it to FAIL on `src/services/newsService.js`: `REACT_APP_NEWSAPI_KEY` and newsapi.org.

**Step 3:** Run `grep -rn "newsService" src` and confirm there are no imports. Then `git rm src/services/newsService.js`.

**Step 4:** Run `npx vitest run src/security` and expect PASS. Then run `npm test`; all tests must pass.

**Step 5: Bundle check.** Run `npx vite build --outDir "$TMPDIR/build-keys" --emptyOutDir`, then:

```bash
grep -rlE "newsapi\.org|gnews\.io|newsdata\.io|finnhub\.io|marketstack\.com|REACT_APP_(GNEWS|NEWS|NEWSDATA|FINNHUB|MARKETSTACK)" "$TMPDIR/build-keys" || echo "bundle clean"
rm -rf "$TMPDIR/build-keys"
```

Expect `bundle clean`.

---

### Task 3: Docs

- `README.md`: remove any mention of news API keys or `REACT_APP_*NEWS*`/`GNEWS` variables, if present. State that news comes from the backend and needs no keys. Keep `REACT_APP_API_URL` and the Supabase variables.
- `SECURITY.md`: add a short "Secrets" section:
  - Never commit `.env*`; it's gitignored.
  - Frontend env vars are public: only `REACT_APP_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong there.
  - Every other key lives on the backend host.
  - Report leaks to the maintainer.

---

### Task 4: Hosting and repo settings (user-only)

1. **Vercel → Settings → Environment Variables:** delete every `REACT_APP_*KEY*` variable (GNEWS, NEWS, NEWSDATA, FINNHUB, MARKETSTACK) in all environments. Keep `REACT_APP_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. **GitHub → repo Settings → Code security:** enable **Secret scanning** and **Push protection**. Both are free for public repos, and push protection blocks future pushes that contain recognized secrets.
3. **GitHub → Security → Secret scanning alerts:** review any alerts. Close the ones for keys you rotated in Task 1 as "revoked".

---

### Task 5 (optional, not recommended): Purge history

Rewriting history (`git filter-repo --path .env --invert-paths`, then force-pushing every branch and tag) removes `.env` from GitHub's current view. But:
- existing clones, forks and caches keep it;
- it changes every commit id, which breaks open PRs and links;
- GitHub's cached views may still show old blobs until support purges them.

Task 1 already makes the keys useless. Only do this if you need the history clean, and coordinate first: it's a force-push to `main` on a public repo.

---

### Task 6: Verify and ship

1. `npm test` passes, `npm run lint` reports 0 errors, and the bundle check says `bundle clean`.
2. Commit on `fix/news-keys-cleanup`: "chore(security): remove dead client news-key code; guard against client-side secrets". Push without `-u`, open a PR to `main`, and let the user merge.
3. User checklist: Task 1 rotation done for all 5 providers, Task 4 Vercel variables deleted, push protection on.
