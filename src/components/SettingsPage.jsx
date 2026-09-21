import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthDisabled } from '@/components/auth/AuthLayout';
import { useSignOut } from '@/components/auth/useSignOut';
import { useOptionalAuth } from '@/context/AuthContext';
import { getProfile, updateProfile } from '@/lib/userDataRepo';
import { selectClass } from '@/lib/select';
import { cn } from '@/lib/utils';

const FIELDS = ['display_name', 'default_market', 'email_alerts', 'daily_digest', 'digest_market'];
const MARKETS = [
  { value: 'in', label: 'India (NSE/BSE)' },
  { value: 'us', label: 'United States' },
];

function toForm(profile, fallbackName) {
  return {
    display_name: profile?.display_name ?? fallbackName,
    default_market: profile?.default_market ?? 'in',
    email_alerts: profile?.email_alerts ?? true,
    daily_digest: profile?.daily_digest ?? true,
    digest_market: profile?.digest_market ?? 'in',
  };
}

function SettingsSkeleton() {
  return (
    <PageContainer className="max-w-2xl">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </PageContainer>
  );
}

export default function SettingsPage() {
  const auth = useOptionalAuth();
  if (!auth?.enabled) return <AuthDisabled />;
  if (auth.loading) return <SettingsSkeleton />;
  if (!auth.user) return <Navigate to="/login" replace state={{ from: '/settings' }} />;
  return <SettingsForm key={auth.user.id} client={auth.client} user={auth.user} />;
}

function SettingsForm({ client, user }) {
  const { signOut, busy: signingOut } = useSignOut();
  const [saved, setSaved] = useState(null); // form values as last loaded/saved
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const userId = user.id;
  const fallbackName = user.user_metadata?.full_name ?? '';

  // Keyed on the id, not the user object: TOKEN_REFRESHED hands out a new object and
  // must not wipe unsaved edits.
  useEffect(() => {
    let active = true;
    getProfile(client, userId).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setLoadError(error);
        return;
      }
      const values = toForm(data, fallbackName);
      setLoadError(null);
      setSaved(values);
      setForm(values);
    });
    return () => {
      active = false;
    };
  }, [client, userId, fallbackName, attempt]);

  if (loadError) {
    return (
      <PageContainer className="max-w-2xl">
        <PageHeader title="Settings" />
        <ErrorState message="Couldn't load your settings." onRetry={() => setAttempt((n) => n + 1)} />
      </PageContainer>
    );
  }
  if (!form) return <SettingsSkeleton />;

  const changed = {};
  for (const k of FIELDS) {
    const value = k === 'display_name' ? form[k].trim() : form[k];
    if (value !== saved[k]) changed[k] = value;
  }
  const dirty = Object.keys(changed).length > 0;
  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    const patch = { ...changed };
    if (patch.display_name === '') patch.display_name = null;
    const { data, error } = await updateProfile(client, userId, patch);
    setSaving(false);
    // No error but no row back: the update matched nothing (profile row missing).
    if (!error && !data) console.error('Settings not saved: the profile row is missing for user', userId);
    if (error || !data) {
      toast.error("Couldn't save your settings — try again");
      return;
    }
    const next = { ...saved, ...changed };
    setSaved(next);
    setForm(next);
    toast.success('Saved');
  };

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Settings" description="Your profile and email preferences." />

      <form onSubmit={onSave} className="space-y-6">
        <SectionCard title="Profile" contentClassName="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-sm font-medium">
              Display name
            </label>
            <Input id="settings-name" autoComplete="name" value={form.display_name} onChange={set('display_name')} maxLength={80} />
          </div>
          <div className="space-y-2">
            <label htmlFor="settings-market" className="text-sm font-medium">
              Default market
            </label>
            <select id="settings-market" className={cn(selectClass, 'w-full')} value={form.default_market} onChange={set('default_market')}>
              {MARKETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Used for your daily digest and future account features.</p>
          </div>
        </SectionCard>

        <SectionCard title="Email" contentClassName="space-y-4">
          <Toggle id="settings-email-alerts" checked={form.email_alerts} onChange={set('email_alerts')}>
            Email me when a price alert triggers
          </Toggle>
          <Toggle id="settings-digest" checked={form.daily_digest} onChange={set('daily_digest')}>
            Daily market digest email
          </Toggle>
          <div className="space-y-2">
            <label htmlFor="settings-digest-market" className="text-sm font-medium">
              Digest market
            </label>
            <select
              id="settings-digest-market"
              className={cn(selectClass, 'w-full')}
              value={form.digest_market}
              onChange={set('digest_market')}
              disabled={!form.daily_digest}
            >
              {MARKETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>

      <SectionCard title="Danger zone" className="border-loss/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Sign out of your account on this device.</p>
          <Button type="button" variant="outline" disabled={signingOut} onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </SectionCard>
    </PageContainer>
  );
}

function Toggle({ id, checked, onChange, children }) {
  return (
    <div className="flex items-center gap-3">
      <input id={id} type="checkbox" className="size-4 accent-primary" checked={checked} onChange={onChange} />
      <label htmlFor={id} className="text-sm font-medium">
        {children}
      </label>
    </div>
  );
}
