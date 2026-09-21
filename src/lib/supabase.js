import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when not configured: the app then runs guest-only and hides auth UI.
// Only the anon (public) key belongs in the frontend; RLS protects every table.
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

export const isAuthEnabled = supabase !== null;
