import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(undefined);

const DISABLED = { message: "Accounts aren't configured on this deployment." };

// Runs a supabase auth call and always resolves { data, error } (never throws).
async function safe(client, fn) {
  if (!client) return { data: null, error: DISABLED };
  try {
    const res = await fn(client.auth);
    return { data: res?.data ?? null, error: res?.error ?? null };
  } catch (error) {
    return { data: null, error };
  }
}

export function AuthProvider({ client = supabase, children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!client);
  const [event, setEvent] = useState(null);

  useEffect(() => {
    if (!client) return undefined;
    let active = true;
    // An auth event is newer than whatever getSession() resolves with afterwards.
    let heardEvent = false;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (active && !heardEvent) setSession(data?.session ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data } = client.auth.onAuthStateChange((evt, s) => {
      heardEvent = true;
      setEvent(evt);
      setSession(s ?? null);
    });
    return () => {
      active = false;
      data?.subscription?.unsubscribe();
    };
  }, [client]);

  const value = useMemo(() => {
    const origin = () => window.location.origin;
    return {
      enabled: !!client,
      loading,
      session,
      user: session?.user ?? null,
      /**
       * The most recent auth event (e.g. 'SIGNED_IN', 'PASSWORD_RECOVERY'), or null.
       * Only the latest one is kept, so a later event (a TOKEN_REFRESHED, say) replaces
       * it. A page that needs PASSWORD_RECOVERY should latch it in its own state.
       */
      event,
      client,
      signIn: (email, password) => safe(client, (auth) => auth.signInWithPassword({ email, password })),
      signUp: (email, password, fullName) =>
        safe(client, (auth) =>
          auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${origin()}/` } }),
        ),
      signInWithGoogle: () =>
        safe(client, (auth) => auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin()}/` } })),
      sendReset: (email) =>
        safe(client, (auth) => auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/reset-password` })),
      updatePassword: (password) => safe(client, (auth) => auth.updateUser({ password })),
      signOut: () => safe(client, (auth) => auth.signOut()),
    };
  }, [client, loading, session, event]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Like useAuth, but null outside <AuthProvider> (callers treat that as a guest). */
export function useOptionalAuth() {
  return useContext(AuthContext) ?? null;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
