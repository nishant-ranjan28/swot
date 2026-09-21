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
  unique (user_id, market, symbol, condition),
  -- price targets must be positive; pct_* targets are percentages
  check (condition in ('pct_up','pct_down') or target > 0)
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
create index on public.alert_events (user_id);
create index on public.alert_events (alert_id);

alter table public.profiles enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.holdings enable row level security;
alter table public.price_alerts enable row level security;
alter table public.alert_events enable row level security;

-- (select auth.uid()) is evaluated once per statement instead of once per row.
-- profiles: the trigger below inserts the row; users can read and update it, never
-- insert or delete it.
create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own watchlist" on public.watchlist_items
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own holdings" on public.holdings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own alerts" on public.price_alerts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- events are written by the backend (service role); users may only read their own
create policy "read own alert events" on public.alert_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- Explicit grants (don't rely on Supabase's default privileges). RLS still applies.
grant select, insert, update, delete on public.watchlist_items, public.holdings, public.price_alerts to authenticated;
grant select on public.alert_events to authenticated;
-- profiles: select, plus update on user-editable columns only. welcome_sent_at is
-- server-owned (set by the backend with the service role); id and created_at never
-- change. imported_at stays client-writable: markImported() sets it.
-- Postgres ignores a column-level REVOKE while the role holds table-level UPDATE
-- (which Supabase's default privileges give), so `revoke update (welcome_sent_at)`
-- alone would do nothing: drop the table-level privileges, then grant per column.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, default_market, email_alerts, daily_digest, digest_market, imported_at)
  on public.profiles to authenticated;

-- auto-create a profile row for every new auth user
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
