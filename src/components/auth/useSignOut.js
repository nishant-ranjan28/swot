import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useOptionalAuth } from '@/context/AuthContext';
import { useUserDataActions } from '@/context/UserDataContext';

export const FLUSH_TIMEOUT_MS = 3000;
const TIMED_OUT = Symbol('timed out');

/**
 * Sign out safely: write pending account changes first (Supabase drops the session
 * before SIGNED_OUT fires, so later writes would be rejected), then sign out, toast
 * and go home. The flush gets FLUSH_TIMEOUT_MS; a hung one can't block sign-out.
 * Repeated calls while one is running are ignored.
 * @returns {{ signOut: () => Promise<void>, busy: boolean }}
 */
export function useSignOut() {
  const auth = useOptionalAuth();
  const { flush } = useUserDataActions();
  const navigate = useNavigate();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async () => {
    if (!auth || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), FLUSH_TIMEOUT_MS);
      });
      // Failures are ignored here: the provider already toasts save failures.
      let flushed;
      try {
        flushed = Promise.resolve(flush()).catch(() => {});
      } catch {
        flushed = Promise.resolve();
      }
      const outcome = await Promise.race([flushed, timeout]);
      clearTimeout(timer);
      if (outcome === TIMED_OUT) toast.warning('Some recent changes may not have saved');

      const { error } = await auth.signOut();
      if (error) {
        toast.error("Couldn't sign out — try again");
        return;
      }
      toast('Signed out');
      navigate('/');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [auth, flush, navigate]);

  return { signOut, busy };
}
