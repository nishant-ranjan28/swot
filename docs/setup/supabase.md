# Supabase setup (accounts + synced data)

StockPulse works without Supabase: if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
not set, the app runs guest-only (localStorage) and hides all sign-in UI. Follow these steps
to turn accounts on.

1. **Create a project.** Sign up at [supabase.com](https://supabase.com) and create a free
   project. Pick the region nearest your users (e.g. Mumbai, `ap-south-1`). Save the database
   password somewhere safe.

2. **Run the migration.** Open **SQL Editor → New query**, paste the contents of
   `supabase/migrations/20260921000000_init.sql`, and click **Run**. It creates the
   `profiles`, `watchlist_items`, `holdings`, `price_alerts` and `alert_events` tables, their
   RLS policies and grants, and a trigger that creates a profile for each new user.

   The migration is not re-runnable: it uses plain `create table` / `create policy` /
   `create function`. To run it again, use a fresh project, or first drop the objects it
   created (the trigger `on_auth_user_created` on `auth.users`, the function
   `public.handle_new_user`, and the five tables).

   Alternatively, with the Supabase CLI installed:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

3. **Add the frontend env vars.** Go to **Project Settings → API** and copy:
   - the **Project URL**
   - the **anon public** key

   Put them in `.env.local` in the repo root:

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

   Add the same two variables in **Vercel → Project → Settings → Environment Variables**.

   - `.env.local` is gitignored, so it never gets committed.
   - The anon key is safe in the browser because RLS limits every user to their own rows.
   - The **service_role** key bypasses RLS. Never put it in the frontend, in `.env.local`,
     in Vercel's frontend env vars, or in git. Only a trusted backend may use it.

   Restart `npm run dev` after editing `.env.local`.

4. **URL configuration.** Go to **Authentication → URL Configuration**:
   - **Site URL:** `https://swot.iamnishant.in`
   - **Redirect URLs:** add `http://localhost:3000/**` and `https://swot.iamnishant.in/**`
   - *(Optional)* To sign in on Vercel preview deployments, also add
     `https://*-<team>.vercel.app/**` (replace `<team>` with your Vercel team or account slug).

5. **Email provider.** Go to **Authentication → Providers → Email** and:
   - keep **Confirm email** turned on;
   - set **Minimum password length** to `8`;
   - turn on **Secure password change** (recommended), so changing the password
     requires a recent sign-in.

   The app refuses passwords shorter than 8 characters on the sign-up and reset forms,
   but that check only runs in the browser and can be bypassed by calling the Supabase
   API directly. The server-side minimum is the real guard, so keep it at 8 or higher.

6. **SMTP (Brevo).** Supabase's built-in mailer is heavily rate-limited, so send auth emails
   through Brevo. Go to **Authentication → SMTP Settings**, enable custom SMTP, and enter:
   - **Host:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Username** and **Password:** the SMTP login and SMTP key from
     **Brevo → SMTP & API**
   - **Sender email:** an address you've verified as a sender in Brevo
   - **Sender name:** `StockPulse`

7. **Google sign-in (optional).**
   1. In Google Cloud Console → **APIs & Services → Credentials**, create an
      **OAuth client ID** of type *Web application*.
   2. Add the authorized redirect URI
      `https://<project-ref>.supabase.co/auth/v1/callback`.
   3. Copy the client ID and client secret into **Supabase → Authentication → Providers →
      Google**, and enable the provider.

8. **Verify RLS.** Open **Table Editor**. All 5 tables (`profiles`, `watchlist_items`,
   `holdings`, `price_alerts`, `alert_events`) should show **RLS enabled**. As a spot check,
   sign in as two different users and confirm neither can see the other's watchlist.

9. **Free tier note.** Free projects pause after about 7 days without activity. The Phase 5
   cron job will keep the project active; until then, open the dashboard or the app
   occasionally, or un-pause it from the dashboard.
