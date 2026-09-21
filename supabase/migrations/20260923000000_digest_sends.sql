-- Migration 3: daily watchlist digest send log.
--
-- One digest per user per market per day. The backend (service role) claims a row
-- before sending; the unique key makes re-runs idempotent. Users can read their own
-- history. `digest_date` is the market-local date (IST for 'in', New York for 'us').
--
-- Only the service role writes: all privileges are revoked from anon/authenticated,
-- then SELECT alone is granted back to authenticated (RLS limits it to own rows).
create table public.digest_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null check (market in ('in','us')),
  digest_date date not null,
  status text not null default 'claimed' check (status in ('claimed','sent','failed','skipped')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, market, digest_date)
);

create index on public.digest_sends (digest_date, market);

alter table public.digest_sends enable row level security;
create policy "read own digests" on public.digest_sends
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.digest_sends from anon, authenticated;
grant select on public.digest_sends to authenticated;
