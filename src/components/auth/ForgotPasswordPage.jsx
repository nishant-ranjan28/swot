import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOptionalAuth } from '@/context/AuthContext';
import AuthLayout, { AuthDisabled, Field, FormError, FormNotice, errorText, invalidProps, linkClass } from './AuthLayout';

const ERROR_ID = 'forgot-error';

export const RESET_SENT = 'If an account exists, a reset link is on its way.';

export default function ForgotPasswordPage() {
  const auth = useOptionalAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!auth?.enabled) return <AuthDisabled />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Supabase answers the same for unknown emails, so this never reveals an account.
    const { error: err } = await auth.sendReset(email.trim());
    setBusy(false);
    if (err) setError(errorText(err, "Couldn't send the reset link. Try again in a minute."));
    else setSent(true);
  };

  return (
    <AuthLayout
      title="Reset your password"
      focusTitle={sent}
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <FormNotice>{RESET_SENT}</FormNotice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="forgot-email" label="Email">
            <Input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} {...invalidProps(error, ERROR_ID)} />
          </Field>
          <FormError id={ERROR_ID}>{error}</FormError>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
