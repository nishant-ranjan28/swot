import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useOptionalAuth } from '@/context/AuthContext';
import AuthLayout, { AuthDisabled, Field, FormError, FormNotice, MIN_PASSWORD, errorText, invalidProps, linkClass } from './AuthLayout';

const ERROR_ID = 'reset-error';

export const OPEN_LINK = 'Open the reset link from your email.';

export default function ResetPasswordPage() {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // `event` only keeps the latest auth event (a TOKEN_REFRESHED can replace it), so
  // remember that we saw PASSWORD_RECOVERY.
  const [recovering, setRecovering] = useState(false);
  if (auth?.event === 'PASSWORD_RECOVERY' && !recovering) setRecovering(true);

  if (!auth?.enabled) return <AuthDisabled />;

  const footer = (
    <Link to="/login" className={linkClass}>
      Back to sign in
    </Link>
  );

  if (auth.loading && !recovering) {
    return (
      <AuthLayout title="Choose a new password" footer={footer}>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </AuthLayout>
    );
  }

  if (!recovering && !auth.user) {
    return (
      <AuthLayout title="Choose a new password" footer={footer}>
        <FormNotice>{OPEN_LINK}</FormNotice>
        <p className="text-sm text-muted-foreground">
          Link expired or lost?{' '}
          <Link to="/forgot-password" className={linkClass}>
            Send a new one
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error: err } = await auth.updatePassword(password);
    setBusy(false);
    if (err) {
      setError(errorText(err, "Couldn't update your password."));
      return;
    }
    toast.success('Password updated');
    navigate('/', { replace: true });
  };

  return (
    <AuthLayout title="Choose a new password" footer={footer}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="reset-password" label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...invalidProps(error, ERROR_ID)}
          />
        </Field>
        <Field id="reset-confirm" label="Confirm password">
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            {...invalidProps(error, ERROR_ID)}
          />
        </Field>
        <FormError id={ERROR_ID}>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
