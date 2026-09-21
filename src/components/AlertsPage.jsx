import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, BellRing, History, Plus, RotateCcw, Trash2 } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOptionalAuth } from '@/context/AuthContext';
import { useUserDataActions, useWatchlist } from '@/context/UserDataContext';
import { useMarket } from '@/context/MarketContext';
import {
  createAlert,
  deleteAlert,
  getProfile,
  listAlertEvents,
  listAlerts,
  normalizeAlertSymbol,
  rearmAlert,
} from '@/lib/userDataRepo';
import { selectClass } from '@/lib/select';
import { segmentClass } from '@/lib/segment';
import { cn } from '@/lib/utils';

const DESCRIPTION = 'We check every 15 minutes during market hours and email you when an alert triggers.';
const CONDITIONS = [
  { value: 'above', label: 'Price above' },
  { value: 'below', label: 'Price below' },
  { value: 'pct_up', label: 'Up % today' },
  { value: 'pct_down', label: 'Down % today' },
];
const MARKETS = [
  { value: 'in', label: 'India' },
  { value: 'us', label: 'US' },
];
const isPct = (condition) => condition === 'pct_up' || condition === 'pct_down';
const currencyOf = (market) => (market === 'us' ? '$' : '₹');

/** 2500 → "2,500", 179.5 → "179.50" (Indian grouping for the in market). */
function formatNumber(value, market) {
  const n = Number(value);
  const digits = Number.isInteger(n) ? 0 : 2;
  return n.toLocaleString(market === 'us' ? 'en-US' : 'en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
}

const formatPrice = (value, market) => `${currencyOf(market)}${formatNumber(value, market)}`;
const SAVE_FAILED = "Couldn't save the alert — try again";
const DONE_TITLE = 'Emailed, or skipped because email alerts are off';

/** "Above ₹2,500", "Below $180", "Up 5% today", "Down 3% today". */
function conditionText({ condition, target, market }) {
  switch (condition) {
    case 'above':
      return `Above ${formatPrice(target, market)}`;
    case 'below':
      return `Below ${formatPrice(target, market)}`;
    case 'pct_up':
      return `Up ${formatNumber(target, market)}% today`;
    case 'pct_down':
      return `Down ${formatNumber(target, market)}% today`;
    default:
      return condition;
  }
}

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AlertsPage() {
  const auth = useOptionalAuth();
  if (!auth?.enabled) {
    return (
      <PageContainer className="max-w-5xl">
        <PageHeader title="Alerts" />
        <EmptyState icon={Bell} title="Accounts aren't configured on this deployment." />
      </PageContainer>
    );
  }
  if (auth.loading) return <AlertsSkeleton />;
  if (!auth.user) {
    return (
      <PageContainer className="max-w-5xl">
        <PageHeader title="Alerts" />
        <EmptyState
          icon={Bell}
          title="Sign in to get email alerts"
          description="Set price targets on your Watchlist, or sign in to get an email when they hit."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/login" state={{ from: '/alerts' }}>
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/watchlist">Go to Watchlist</Link>
              </Button>
            </div>
          }
        />
      </PageContainer>
    );
  }
  return <AlertsManager key={auth.user.id} client={auth.client} userId={auth.user.id} />;
}

function AlertsSkeleton() {
  return (
    <PageContainer className="max-w-5xl">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </PageContainer>
  );
}

function AlertsManager({ client, userId }) {
  // The watchlist's alertHigh/alertLow are the same price_alerts rows (above/below).
  // Its edits are batched, so every read and write here flushes them first: otherwise a
  // late flush could re-create an alert deleted here, or overwrite a target set here.
  const { flush, reload } = useUserDataActions();
  const [watchIn] = useWatchlist('in');
  const [watchUs] = useWatchlist('us');
  const [lists, setLists] = useState(null); // { alerts, events }
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(() => new Set()); // ids of rows being changed ('create' for the form)
  const [emailAlerts, setEmailAlerts] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only drives the "email alerts are off" note; a failure just leaves it hidden.
  useEffect(() => {
    let active = true;
    getProfile(client, userId).then(({ data, error }) => {
      if (active && !error && data) setEmailAlerts(data.email_alerts !== false);
    });
    return () => {
      active = false;
    };
  }, [client, userId]);

  const fetchLists = useCallback(async () => {
    const [alerts, events] = await Promise.all([listAlerts(client, userId), listAlertEvents(client, userId)]);
    const error = alerts.error || events.error;
    if (error) return { error };
    return { data: { alerts: alerts.data || [], events: events.data || [] } };
  }, [client, userId]);

  useEffect(() => {
    let active = true;
    flush()
      .then(fetchLists)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error);
          toast.error("Couldn't load your alerts");
          return;
        }
        setLists(data);
      });
    return () => {
      active = false;
    };
  }, [flush, fetchLists, attempt]);

  // After a write: reload the account data so the watchlist's alertHigh/alertLow pick it
  // up (this also flushes anything edited meanwhile), then refresh this page's lists.
  const refresh = useCallback(async () => {
    await reload();
    const { data, error } = await fetchLists();
    if (!mounted.current) return;
    if (error) toast.error("Couldn't refresh your alerts");
    else setLists(data);
  }, [fetchLists, reload]);

  const setBusy = (id, busy) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const mutate = async (id, run, { ok, fail }) => {
    setBusy(id, true);
    await flush();
    const { error } = await run();
    if (error) {
      if (mounted.current) setBusy(id, false);
      toast.error(typeof fail === 'function' ? fail(error) : fail);
      return false;
    }
    toast.success(ok);
    await refresh();
    if (mounted.current) setBusy(id, false);
    return true;
  };

  if (loadError) {
    return (
      <PageContainer className="max-w-5xl">
        <PageHeader title="Alerts" description={DESCRIPTION} />
        <ErrorState
          message="Couldn't load your alerts."
          onRetry={() => {
            setLoadError(null);
            setAttempt((n) => n + 1);
          }}
        />
      </PageContainer>
    );
  }
  if (!lists) return <AlertsSkeleton />;

  const active = lists.alerts.filter((a) => a.active);
  const triggered = lists.alerts
    .filter((a) => !a.active && a.last_triggered_at)
    .sort((a, b) => (a.last_triggered_at < b.last_triggered_at ? 1 : -1));

  const onCreate = (input) => {
    const watched = (input.market === 'us' ? watchUs : watchIn).find((i) => i.symbol === input.symbol);
    const withName = watched?.name ? { ...input, name: watched.name } : input;
    return mutate('create', () => createAlert(client, userId, withName), {
      ok: `Alert set: ${input.symbol} ${conditionText(input)}`,
      // Validation messages are written for people; database errors aren't.
      fail: (error) => (error.invalid && error.message ? error.message : SAVE_FAILED),
    });
  };
  const onRearm = (a) =>
    mutate(a.id, () => rearmAlert(client, userId, a.id), {
      ok: `Re-armed ${a.symbol}`,
      fail: "Couldn't re-arm the alert — try again",
    });
  const onDelete = (a) =>
    mutate(a.id, () => deleteAlert(client, userId, a.id), {
      ok: `Deleted the ${a.symbol} alert`,
      fail: "Couldn't delete the alert — try again",
    });

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Alerts" description={DESCRIPTION} />

      <AddAlertForm busy={pending.has('create')} onCreate={onCreate} />

      <SectionCard
        aria-label="Active"
        title={`Active (${active.length})`}
        description="Each alert fires once, then moves to Triggered."
        contentClassName={active.length ? 'p-0' : undefined}
      >
        {active.length ? (
          <AlertTable
            alerts={active}
            dateLabel="Created"
            dateOf={(a) => formatDate(a.created_at)}
            pending={pending}
            onDelete={onDelete}
          />
        ) : (
          <EmptyState icon={Bell} title="No active alerts" description="Add one above, or set Alert High / Low on your Watchlist." />
        )}
      </SectionCard>

      <SectionCard
        aria-label="Triggered"
        title={`Triggered (${triggered.length})`}
        description="Re-arm an alert to have it fire again."
        contentClassName={triggered.length ? 'p-0' : undefined}
      >
        {triggered.length ? (
          <AlertTable
            alerts={triggered}
            dateLabel="Triggered"
            dateOf={(a) => formatDateTime(a.last_triggered_at)}
            pending={pending}
            onRearm={onRearm}
            onDelete={onDelete}
          />
        ) : (
          <EmptyState icon={BellRing} title="Nothing has triggered yet" />
        )}
      </SectionCard>

      <SectionCard
        aria-label="History"
        title="History"
        description="Your most recent 50 triggers."
        contentClassName="p-0"
      >
        {!emailAlerts && (
          <p className="border-b border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            Email alerts are off — triggers are recorded but not emailed. Turn them on in{' '}
            <Link to="/settings" className="font-medium text-foreground underline underline-offset-2">
              Settings
            </Link>
            .
          </p>
        )}
        {lists.events.length ? (
          <HistoryTable events={lists.events} />
        ) : (
          <div className="p-4">
            <EmptyState icon={History} title="No trigger history yet" />
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}

function AddAlertForm({ busy, onCreate }) {
  const { market: currentMarket } = useMarket();
  const [market, setMarket] = useState(currentMarket === 'us' ? 'us' : 'in');
  const [symbol, setSymbol] = useState('');
  const [condition, setCondition] = useState('above');
  const [target, setTarget] = useState('');
  const [errors, setErrors] = useState({});

  const normalized = normalizeAlertSymbol(market, symbol);
  const targetLabel = `Target (${isPct(condition) ? '%' : currencyOf(market)})`;

  const onSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!normalized) next.symbol = 'Enter a symbol';
    if (!(Number(target) > 0)) next.target = 'Target must be greater than 0';
    setErrors(next);
    if (Object.keys(next).length) return;
    const saved = await onCreate({ market, symbol: normalized, condition, target: Number(target) });
    if (saved) {
      setSymbol('');
      setTarget('');
    }
  };

  return (
    <SectionCard title="Add alert">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto_10rem_auto] md:items-start">
        <div className="space-y-2">
          <p className="text-sm font-medium" id="alert-market-label">
            Market
          </p>
          <div role="group" aria-labelledby="alert-market-label" className="inline-flex rounded-lg border border-border p-0.5">
            {MARKETS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={market === m.value}
                className={segmentClass(market === m.value)}
                onClick={() => setMarket(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="alert-symbol" className="text-sm font-medium">
            Symbol
          </label>
          <Input
            id="alert-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={market === 'in' ? 'RELIANCE' : 'AAPL'}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="uppercase placeholder:normal-case"
            aria-invalid={errors.symbol ? true : undefined}
            aria-describedby="alert-symbol-hint"
          />
          <div id="alert-symbol-hint" className="space-y-0.5 text-xs text-muted-foreground">
            <p>{market === 'in' ? 'NSE symbol — we add .NS for you (type .BO for BSE).' : 'US ticker, e.g. AAPL.'}</p>
            {normalized && <p className="font-medium text-foreground">Saved as {normalized}</p>}
          </div>
          {errors.symbol && (
            <p role="alert" className="text-xs font-medium text-loss">
              {errors.symbol}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="alert-condition" className="text-sm font-medium">
            Condition
          </label>
          <select
            id="alert-condition"
            className={cn(selectClass, 'w-full')}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="alert-target" className="text-sm font-medium">
            {targetLabel}
          </label>
          <Input
            id="alert-target"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="tabular-nums"
            aria-invalid={errors.target ? true : undefined}
          />
          {errors.target && (
            <p role="alert" className="text-xs font-medium text-loss">
              {errors.target}
            </p>
          )}
        </div>

        <div className="md:pt-7">
          <Button type="submit" disabled={busy} className="w-full md:w-auto">
            <Plus aria-hidden />
            {busy ? 'Adding…' : 'Add alert'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

const headClass = 'px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

function MarketBadge({ market }) {
  return (
    <Badge variant="outline" className="uppercase">
      {market === 'us' ? 'US' : 'IN'}
    </Badge>
  );
}

function AlertTable({ alerts, dateLabel, dateOf, pending, onRearm, onDelete }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className={headClass}>Symbol</TableHead>
          <TableHead className={headClass}>Market</TableHead>
          <TableHead className={headClass}>Condition</TableHead>
          <TableHead className={headClass}>{dateLabel}</TableHead>
          <TableHead className={cn(headClass, 'text-right')}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => {
          const text = conditionText(a);
          const busy = pending.has(a.id);
          return (
            <TableRow key={a.id}>
              <TableCell className="px-4 py-3">
                <div className="font-medium">{a.symbol}</div>
                {a.name && <div className="text-xs text-muted-foreground">{a.name}</div>}
              </TableCell>
              <TableCell className="px-4 py-3">
                <MarketBadge market={a.market} />
              </TableCell>
              <TableCell className="px-4 py-3 tabular-nums">{text}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">{dateOf(a)}</TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {onRearm && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-label={`Re-arm ${a.symbol} ${text}`}
                      onClick={() => onRearm(a)}
                    >
                      <RotateCcw aria-hidden />
                      Re-arm
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Delete ${a.symbol} ${text}`}
                    className="text-muted-foreground hover:text-loss"
                    onClick={() => onDelete(a)}
                  >
                    <Trash2 aria-hidden />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function HistoryTable({ events }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className={headClass}>Time</TableHead>
          <TableHead className={headClass}>Symbol</TableHead>
          <TableHead className={headClass}>Condition</TableHead>
          <TableHead className={cn(headClass, 'text-right')}>Trigger price</TableHead>
          <TableHead className={headClass}>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">{formatDateTime(e.triggered_at)}</TableCell>
            <TableCell className="px-4 py-3 font-medium">{e.alert?.symbol ?? 'Deleted alert'}</TableCell>
            <TableCell className="px-4 py-3 tabular-nums">{e.alert ? conditionText(e.alert) : '—'}</TableCell>
            <TableCell className="px-4 py-3 text-right tabular-nums">
              {e.price == null ? '—' : e.alert ? formatPrice(e.price, e.alert.market) : formatNumber(e.price)}
            </TableCell>
            <TableCell className="px-4 py-3">
              {/* emailed is also set when the email was skipped (email alerts off) */}
              {e.emailed ? (
                <Badge variant="gain" title={DONE_TITLE}>
                  Done
                </Badge>
              ) : (
                <Badge variant="warning">Queued</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
