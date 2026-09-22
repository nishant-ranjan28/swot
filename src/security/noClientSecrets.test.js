// Frontend env vars end up in the public JS bundle. This guard keeps secrets out of it:
// client code may only read the public allow-list below, and must never call keyed
// third-party news/market APIs directly (news comes from our backend).
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
      if (!ALLOWED.has(name)) offenders.push(`${f.slice(SRC.length + 1)}: ${name}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('client code never calls keyed third-party news/market APIs directly', () => {
  const offenders = files(SRC)
    .filter((f) => KEYED_HOSTS.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(SRC.length + 1));
  expect(offenders).toEqual([]);
});
