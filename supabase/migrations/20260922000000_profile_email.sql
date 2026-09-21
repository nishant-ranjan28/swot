-- supabase/migrations/20260922000000_profile_email.sql
-- Copy the auth email onto profiles so backend jobs (price-alert emails) can read the
-- recipient and their preferences in one query.
--
-- Users can read their own email (the "read own profile" policy + table-level SELECT)
-- but cannot change it: migration 1 revoked table-level UPDATE on profiles from
-- `authenticated` and granted UPDATE only on (display_name, default_market,
-- email_alerts, daily_digest, digest_market, imported_at). `email` is not in that list,
-- so it is written only by the security-definer triggers below (and the service role).

alter table public.profiles add column email text;

-- backfill existing users
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

-- new users: same display-name logic as migration 1, plus the email
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  );
  return new;
end;
$$;

-- keep profiles.email in sync when a user changes their auth email
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

-- ---------------------------------------------------------------------------
-- Price-alert job support (backend service role only)
-- ---------------------------------------------------------------------------

-- Send claims: the job stamps claimed_at on a user's unsent events before emailing
-- them and only sends the rows it claimed, so overlapping runs can't double-send.
-- A claim older than 10 minutes is treated as stale (the run died) and can be retaken.
alter table public.alert_events add column claimed_at timestamptz;

-- Fire an alert atomically: deactivate it and record its event in one transaction.
-- Returns NULL (PostgREST: an empty/all-null row) when the alert is already inactive,
-- so an alert fires at most once even if two job runs overlap.
create function public.fire_alert(p_alert_id uuid, p_price numeric) returns public.alert_events
language plpgsql security definer set search_path = '' as $$
declare a public.price_alerts; e public.alert_events;
begin
  update public.price_alerts set active = false, last_triggered_at = now()
   where id = p_alert_id and active returning * into a;
  if not found then return null; end if;
  insert into public.alert_events (alert_id, user_id, price) values (a.id, a.user_id, p_price) returning * into e;
  return e;
end; $$;
revoke all on function public.fire_alert(uuid, numeric) from public, anon, authenticated;
grant execute on function public.fire_alert(uuid, numeric) to service_role;

-- Bound symbol length (the job also skips longer symbols and email rendering truncates).
alter table public.price_alerts add constraint price_alerts_symbol_length
  check (char_length(symbol) <= 32);
alter table public.watchlist_items add constraint watchlist_items_symbol_length
  check (char_length(symbol) <= 32);
