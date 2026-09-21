// Shared chrome for the auth pages: a centred card, form fields and the disabled state.
import { Children, cloneElement, isValidElement, useEffect, useRef } from 'react';
import { UserX } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import EmptyState from '@/components/common/EmptyState';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const NOT_CONFIGURED = "Accounts aren't configured on this deployment.";

/**
 * `focusTitle`: move focus to the heading (e.g. when a form is replaced by a
 * confirmation), so keyboard and screen-reader users land on the new content.
 */
export default function AuthLayout({ title, description, footer, focusTitle = false, children }) {
  const titleRef = useRef(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  return (
    <PageContainer className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1
            ref={titleRef}
            tabIndex={focusTitle ? -1 : undefined}
            className="text-xl leading-none font-semibold outline-none"
          >
            {title}
          </h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
        {footer && <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>}
      </Card>
    </PageContainer>
  );
}

/** Shown on every auth page (and Settings) when there's no Supabase client. */
export function AuthDisabled() {
  return (
    <PageContainer>
      <EmptyState
        icon={UserX}
        title={NOT_CONFIGURED}
        description="You can keep using StockPulse as a guest; your watchlist and portfolio stay in this browser."
      />
    </PageContainer>
  );
}

/** Space-separated id list with blanks and duplicates dropped, or undefined if empty. */
export function joinIds(...ids) {
  const list = [...new Set(ids.flatMap((v) => (v ? String(v).split(/\s+/) : [])).filter(Boolean))];
  return list.length ? list.join(' ') : undefined;
}

/** Label + input (+ hint). The hint's id is merged into the input's aria-describedby. */
export function Field({ id, label, hint, children }) {
  const hintId = hint ? `${id}-hint` : null;
  const control =
    hintId && Children.count(children) === 1 && isValidElement(children)
      ? cloneElement(children, { 'aria-describedby': joinIds(children.props['aria-describedby'], hintId) })
      : children;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Give inputs `aria-invalid` and add `id` to their aria-describedby while it shows. */
export function FormError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-sm text-loss">
      {children}
    </p>
  );
}

export function FormNotice({ children, className }) {
  if (!children) return null;
  return (
    <p role="status" className={cn('rounded-md border border-border bg-muted/50 px-3 py-2 text-sm', className)}>
      {children}
    </p>
  );
}

/** Underlined link in the foreground colour (primary yellow is unreadable on light). */
export const linkClass = 'font-medium text-foreground underline-offset-4 hover:underline';

export const MIN_PASSWORD = 8;
export const errorText = (error, fallback) => error?.message || fallback;

/** Props for an input described by a form error (spread onto the input). */
export const invalidProps = (error, errorId) =>
  error ? { 'aria-invalid': 'true', 'aria-describedby': errorId } : {};

// Supabase auth errors that would reveal whether an email has an account.
const INVALID_CREDENTIALS = { codes: ['invalid_credentials'], messages: ['Invalid login credentials'] };
const EMAIL_NOT_CONFIRMED = { codes: ['email_not_confirmed'], messages: ['Email not confirmed'] };
const ALREADY_REGISTERED = {
  codes: ['user_already_exists', 'email_exists'],
  messages: ['User already registered', 'A user with this email address has already been registered'],
};
const matches = (error, { codes, messages }) =>
  !!error && (codes.includes(error.code) || messages.includes(error.message));

export const SIGN_IN_FAILED = "Couldn't sign in. Check your email and password.";
export const CONFIRM_FIRST = 'Please confirm your email first. Check your inbox.';

/** Sign-in error text. "Not confirmed" only follows a correct password, so it's safe. */
export function signInErrorText(error) {
  if (matches(error, INVALID_CREDENTIALS)) return SIGN_IN_FAILED;
  if (matches(error, EMAIL_NOT_CONFIRMED)) return CONFIRM_FIRST;
  return errorText(error, SIGN_IN_FAILED);
}

/** True when a sign-up error only says the email is taken (shown as the neutral confirmation). */
export const isAlreadyRegistered = (error) => matches(error, ALREADY_REGISTERED);
