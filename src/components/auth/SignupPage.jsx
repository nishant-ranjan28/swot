import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOptionalAuth } from '@/context/AuthContext';
import AuthLayout, {
  AuthDisabled,
  Field,
  FormError,
  MIN_PASSWORD,
  errorText,
  invalidProps,
  isAlreadyRegistered,
  linkClass,
} from './AuthLayout';

const ERROR_ID = 'signup-error';

export default function SignupPage() {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  // Shown for new and already-registered emails alike, so sign-up never reveals an account.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!auth?.enabled) return <AuthDisabled />;
  if (!auth.loading && auth.user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    setBusy(true);
    const { data, error: err } = await auth.signUp(email.trim(), password, name.trim());
    setBusy(false);
    // An existing email comes back as a fake user with no identities (or, depending on
    // project settings, a "User already registered" error): both get the neutral state.
    if (err && !isAlreadyRegistered(err)) setError(errorText(err, "Couldn't create your account."));
    else if (data?.session) navigate('/', { replace: true });
    else setConfirming(true);
  };

  const footer = (
    <span>
      Already have an account?{' '}
      <Link to="/login" className={linkClass}>
        Sign in
      </Link>
    </span>
  );

  if (confirming) {
    return (
      <AuthLayout title="Check your email" focusTitle>
        <p role="status" className="text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{email.trim()}</span> isn&apos;t registered yet, we&apos;ve sent a
          confirmation link.
        </p>
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className={linkClass}>
            Sign in
          </Link>{' '}
          or{' '}
          <Link to="/forgot-password" className={linkClass}>
            reset your password
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create account" description="Free. Keep your watchlist, portfolio and alerts in sync." footer={footer}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="signup-name" label="Name">
          <Input id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="signup-email" label="Email">
          <Input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} {...invalidProps(error, ERROR_ID)} />
        </Field>
        <Field id="signup-password" label="Password" hint={`At least ${MIN_PASSWORD} characters.`}>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...invalidProps(error, ERROR_ID)}
          />
        </Field>
        <FormError id={ERROR_ID}>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
