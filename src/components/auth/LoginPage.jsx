import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOptionalAuth } from '@/context/AuthContext';
import { safeReturnTo } from '@/lib/safeReturnTo';
import AuthLayout, { AuthDisabled, Field, FormError, errorText, invalidProps, linkClass, signInErrorText } from './AuthLayout';

const ERROR_ID = 'login-error';

/** Where to go after signing in: the protected page that sent us here, else home. */
function useReturnTo() {
  return safeReturnTo(useLocation().state?.from);
}

export default function LoginPage() {
  const auth = useOptionalAuth();
  const returnTo = useReturnTo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!auth?.enabled) return <AuthDisabled />;
  if (!auth.loading && auth.user) return <Navigate to={returnTo} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await auth.signIn(email.trim(), password);
    setBusy(false);
    // On success the SIGNED_IN event sets `user` and the <Navigate> above redirects.
    if (err) setError(signInErrorText(err));
  };

  const onGoogle = async () => {
    setError(null);
    const { error: err } = await auth.signInWithGoogle();
    if (err) setError(errorText(err, "Couldn't start Google sign-in."));
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Sync your watchlist, portfolio and alerts across devices."
      footer={
        <span>
          New here?{' '}
          <Link to="/signup" className={linkClass}>
            Create account
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="login-email" label="Email">
          <Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} {...invalidProps(error, ERROR_ID)} />
        </Field>
        <Field id="login-password" label="Password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...invalidProps(error, ERROR_ID)}
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className={`${linkClass} text-sm`}>
            Forgot password?
          </Link>
        </div>
        <FormError id={ERROR_ID}>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
        Continue with Google
      </Button>
    </AuthLayout>
  );
}
