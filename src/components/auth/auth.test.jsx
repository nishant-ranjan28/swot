import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { createFakeSupabase } from '@/test/fakeSupabase';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const USER = { id: 'u1', email: 'a@b.c' };

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderPage(element, { client = createFakeSupabase(), path = '/page', state } = {}) {
  render(
    <AuthProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return client;
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => vi.clearAllMocks());

describe('disabled (no Supabase client)', () => {
  test.each([
    ['login', <LoginPage key="l" />],
    ['signup', <SignupPage key="s" />],
    ['forgot', <ForgotPasswordPage key="f" />],
    ['reset', <ResetPasswordPage key="r" />],
  ])('%s page shows the not-configured state', (_name, element) => {
    renderPage(element, { client: null });
    expect(screen.getByText("Accounts aren't configured on this deployment.")).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('also without any AuthProvider', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Accounts aren't configured on this deployment.")).toBeInTheDocument();
  });
});

// Like supabase-js: a successful password sign-in emits SIGNED_IN before resolving.
function signInEmits(client) {
  client.auth.signInWithPassword.mockImplementation(async () => {
    client.auth._emit('SIGNED_IN', { user: USER });
    return { data: { user: USER, session: { user: USER } }, error: null };
  });
  return client;
}

describe('LoginPage', () => {
  test('submits the typed values to signIn and goes to the page it came from', async () => {
    const client = renderPage(<LoginPage />, { client: signInEmits(createFakeSupabase()), state: { from: '/portfolio' } });
    await screen.findByRole('button', { name: 'Sign in' });
    type('Email', ' a@b.c ');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/portfolio'));
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'secret123' });
  });

  test('goes home when there is no from state', async () => {
    renderPage(<LoginPage />, { client: signInEmits(createFakeSupabase()) });
    type('Email', 'a@b.c');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  test.each([['//evil.com'], ['/\\evil.com'], ['https://evil.com'], ['/\tevil']])(
    'an unsafe from (%j) sends a signed-in user home',
    async (from) => {
      renderPage(<LoginPage />, { client: createFakeSupabase({ session: { user: USER } }), state: { from } });
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    },
  );

  test('redirects via the signed-in state, not by navigating itself', async () => {
    // signIn resolves OK but no SIGNED_IN arrives: there is no user yet, so stay put.
    const client = renderPage(<LoginPage />);
    type('Email', 'a@b.c');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(client.auth.signInWithPassword).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    act(() => client.auth._emit('SIGNED_IN', { user: USER }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  test('invalid credentials show a neutral role="alert" error wired to the inputs', async () => {
    const client = createFakeSupabase();
    client.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });
    renderPage(<LoginPage />, { client });
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    type('Email', 'a@b.c');
    type('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't sign in. Check your email and password.");
    expect(alert).not.toHaveTextContent('Invalid login credentials');
    expect(alert).toHaveClass('text-loss');
    expect(alert.id).toBeTruthy();
    for (const label of ['Email', 'Password']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.getAttribute('aria-describedby').split(' ')).toContain(alert.id);
    }
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  test('an unconfirmed email asks the user to check their inbox', async () => {
    const client = createFakeSupabase();
    client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Email not confirmed' } });
    renderPage(<LoginPage />, { client });
    type('Email', 'a@b.c');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please confirm your email first. Check your inbox.');
  });

  test('Continue with Google calls the OAuth sign-in', async () => {
    const client = renderPage(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(client.auth.signInWithOAuth).toHaveBeenCalled());
    expect(client.auth.signInWithOAuth.mock.calls[0][0].provider).toBe('google');
  });

  test('links to forgot password and create account', () => {
    renderPage(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/signup');
  });
});

describe('SignupPage', () => {
  function fill() {
    type('Name', 'Asha');
    type('Email', 'a@b.c');
    type('Password', 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  }

  test('password field has a hint wired with aria-describedby', () => {
    renderPage(<SignupPage />);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('minLength', '8');
    const hint = document.getElementById(pw.getAttribute('aria-describedby'));
    expect(hint).toHaveTextContent(/at least 8 characters/i);
  });

  function expectNeutralConfirmation() {
    const heading = screen.getByRole('heading', { name: 'Check your email' });
    expect(screen.getByText(/isn't registered yet, we've sent a confirmation link/)).toHaveTextContent(
      "If a@b.c isn't registered yet, we've sent a confirmation link.",
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'reset your password' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    return heading;
  }

  test('shows the neutral confirmation, focuses its heading and does not navigate', async () => {
    const client = createFakeSupabase();
    client.auth.signUp.mockResolvedValue({ data: { user: { ...USER, identities: [{ id: 'i1' }] }, session: null }, error: null });
    renderPage(<SignupPage />, { client });
    fill();
    const heading = await screen.findByRole('heading', { name: 'Check your email' });
    expectNeutralConfirmation();
    expect(heading).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(heading).toHaveFocus());
    const [args] = client.auth.signUp.mock.calls[0];
    expect(args).toMatchObject({ email: 'a@b.c', password: 'longenough', options: { data: { full_name: 'Asha' } } });
  });

  test('an existing email (fake user with no identities) gets the same neutral confirmation', async () => {
    const client = createFakeSupabase();
    client.auth.signUp.mockResolvedValue({ data: { user: { ...USER, identities: [] }, session: null }, error: null });
    renderPage(<SignupPage />, { client });
    fill();
    await screen.findByRole('heading', { name: 'Check your email' });
    expectNeutralConfirmation();
  });

  test('a "User already registered" error also gets the neutral confirmation', async () => {
    const client = createFakeSupabase();
    client.auth.signUp.mockResolvedValue({ data: null, error: { message: 'User already registered', code: 'user_already_exists' } });
    renderPage(<SignupPage />, { client });
    fill();
    await screen.findByRole('heading', { name: 'Check your email' });
    expectNeutralConfirmation();
  });

  test('goes home when sign-up returns a session', async () => {
    const client = createFakeSupabase();
    client.auth.signUp.mockResolvedValue({ data: { user: USER, session: { user: USER } }, error: null });
    renderPage(<SignupPage />, { client });
    fill();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  test('rejects a short password without calling signUp', async () => {
    const client = renderPage(<SignupPage />);
    type('Name', 'Asha');
    type('Email', 'a@b.c');
    type('Password', 'short');
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/at least 8 characters/i);
    expect(client.auth.signUp).not.toHaveBeenCalled();
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('aria-invalid', 'true');
    // The error joins the hint rather than replacing it.
    expect(pw.getAttribute('aria-describedby').split(' ')).toEqual(expect.arrayContaining([alert.id, 'signup-password-hint']));
  });
});

describe('ForgotPasswordPage', () => {
  test('sends the reset email and shows the neutral message', async () => {
    const client = renderPage(<ForgotPasswordPage />);
    type('Email', 'a@b.c');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If an account exists, a reset link is on its way.')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Reset your password' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', expect.objectContaining({ redirectTo: expect.stringMatching(/\/reset-password$/) }));
  });
});

describe('ResetPasswordPage', () => {
  test('without a recovery event or session asks for the email link', async () => {
    renderPage(<ResetPasswordPage />);
    expect(await screen.findByText('Open the reset link from your email.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  test('latches PASSWORD_RECOVERY, updates the password, toasts and goes home', async () => {
    const client = renderPage(<ResetPasswordPage />);
    await screen.findByText('Open the reset link from your email.');
    act(() => client.auth._emit('PASSWORD_RECOVERY', null));
    // A later event replaces `event`; the form must stay.
    act(() => client.auth._emit('TOKEN_REFRESHED', null));
    type('New password', 'newpassword');
    type('Confirm password', 'newpassword');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(toast.success).toHaveBeenCalled();
  });

  test('shows the form for a signed-in user and checks the passwords match', async () => {
    const client = renderPage(<ResetPasswordPage />, { client: createFakeSupabase({ session: { user: USER } }) });
    type(await screen.findByLabelText('New password').then(() => 'New password'), 'newpassword');
    type('Confirm password', 'different1');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/don't match/i);
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
});
