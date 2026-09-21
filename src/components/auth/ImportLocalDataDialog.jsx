// On a user's first sign-in, offer to copy this browser's guest data into the account.
//
// Reads guest localStorage directly (the watchlist/holdings hooks return account data
// once signed in) and never modifies it. Shown at most once per browser session per
// user, and only when the profile is loaded with imported_at === null and there's
// something to import. Import → importLocal, Skip → markImported; Esc / overlay just
// closes, so it asks again next session.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOptionalAuth } from '@/context/AuthContext';
import { useUserDataActions } from '@/context/UserDataContext';
import { getProfile, importLocal, importableHoldings, markImported } from '@/lib/userDataRepo';
import { itemAlerts } from '@/lib/sync';

const MARKETS = ['in', 'us'];
const promptedKey = (userId) => `stockpulse_import_prompted_${userId}`;

function readList(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Guest data for both markets, demo holdings dropped. */
export function readGuestData() {
  const local = {};
  for (const m of MARKETS) {
    local[m] = {
      watchlist: readList(`stockpulse_watchlist_${m}`),
      holdings: readList(`stockpulse_portfolio_${m}`).filter((h) => h && !h.isDemo),
    };
  }
  return local;
}

/** What importLocal would send: unique watchlist symbols, their alerts, importableHoldings. */
export function countGuestData(local) {
  const counts = { watchlist: 0, holdings: 0, alerts: 0 };
  for (const m of MARKETS) {
    const seen = new Set();
    for (const item of local[m].watchlist) {
      if (!item?.symbol || seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      counts.watchlist += 1;
      counts.alerts += itemAlerts(item).length;
    }
    counts.holdings += importableHoldings(local[m].holdings).length;
  }
  return counts;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function listPhrase(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export function importSummary(counts) {
  const parts = [];
  if (counts.watchlist) parts.push(plural(counts.watchlist, 'watchlist stock', 'watchlist stocks'));
  if (counts.holdings) parts.push(plural(counts.holdings, 'holding', 'holdings'));
  if (counts.alerts) parts.push(plural(counts.alerts, 'price alert', 'price alerts'));
  return listPhrase(parts);
}

function wasPrompted(userId) {
  try {
    return window.sessionStorage.getItem(promptedKey(userId)) === '1';
  } catch {
    return false;
  }
}

function markPrompted(userId) {
  try {
    window.sessionStorage.setItem(promptedKey(userId), '1');
  } catch {
    /* private mode: may ask again, which is harmless */
  }
}

export default function ImportLocalDataDialog() {
  const auth = useOptionalAuth();
  const { reload } = useUserDataActions();
  const client = auth?.client ?? null;
  const userId = auth?.user?.id ?? null;
  const { pathname } = useLocation();
  // Mid password reset: don't interrupt (and don't use up the once-per-session ask).
  const recovering = pathname === '/reset-password' || auth?.event === 'PASSWORD_RECOVERY';
  const [offer, setOffer] = useState(null); // { userId, local, counts }
  const [busy, setBusy] = useState(null); // 'import' | 'skip' | null

  // Signing out or switching user drops the offer, so the same user signing back in
  // this session doesn't see it again (it was already marked as asked).
  const [offerFor, setOfferFor] = useState(userId);
  if (offerFor !== userId) {
    setOfferFor(userId);
    setOffer(null);
    setBusy(null);
  }

  useEffect(() => {
    if (!client || !userId || recovering || wasPrompted(userId)) return undefined;
    let active = true;
    getProfile(client, userId).then(({ data, error }) => {
      if (!active || error || !data || data.imported_at !== null) return;
      if (wasPrompted(userId)) return;
      const local = readGuestData();
      const counts = countGuestData(local);
      if (!counts.watchlist && !counts.holdings && !counts.alerts) return;
      markPrompted(userId);
      setOffer({ userId, local, counts });
    });
    return () => {
      active = false;
    };
  }, [client, userId, recovering]);

  const open = !!offer && offer.userId === userId && !recovering;
  if (!open) return null;

  const close = () => {
    setOffer(null);
    setBusy(null);
  };

  const onImport = async () => {
    setBusy('import');
    const { counts, error } = await importLocal(client, userId, offer.local);
    if (error) {
      setBusy(null);
      toast.error("Couldn't import your data — try again");
      return;
    }
    toast.success(`Imported ${importSummary(counts ?? offer.counts) || 'your data'} into your account`);
    close();
    await reload();
  };

  const onSkip = async () => {
    setBusy('skip');
    const { error } = await markImported(client, userId);
    close();
    if (error) toast.error("Couldn't save your choice — we'll ask again next time");
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && close()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Bring your local data?</DialogTitle>
          <DialogDescription>
            Import {importSummary(offer.counts)} from this browser into your account.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Your browser copy stays as it is, and is what you'll see again after signing out.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onSkip} disabled={!!busy}>
            {busy === 'skip' ? 'Skipping…' : 'Skip'}
          </Button>
          <Button onClick={onImport} disabled={!!busy}>
            {busy === 'import' ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
