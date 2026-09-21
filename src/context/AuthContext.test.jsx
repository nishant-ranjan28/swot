import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { createFakeSupabase } from '@/test/fakeSupabase';

function renderAuth(client) {
  const wrapper = ({ children }) => <AuthProvider client={client}>{children}</AuthProvider>;
  return renderHook(() => useAuth(), { wrapper }).result;
}

function Probe() {
  const { user, loading, enabled } = useAuth();
  return <div>{loading ? 'loading' : `${enabled}|${user?.email ?? 'guest'}`}</div>;
}

test('disabled when no client', () => {
  render(
    <AuthProvider client={null}>
      <Probe />
    </AuthProvider>,
  );
  expect(screen.getByText('false|guest')).toBeInTheDocument();
});

test('loads existing session and reacts to auth events', async () => {
  const client = createFakeSupabase({ session: { user: { id: 'u1', email: 'a@b.c' } } });
  render(
    <AuthProvider client={client}>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('true|a@b.c')).toBeInTheDocument());
  act(() => client.auth._emit('SIGNED_OUT', null));
  expect(screen.getByText('true|guest')).toBeInTheDocument();
});

test('keeps the last auth event', async () => {
  const client = createFakeSupabase();
  const result = renderAuth(client);
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => client.auth._emit('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@b.c' } }));
  expect(result.current.event).toBe('PASSWORD_RECOVERY');
  expect(result.current.user.email).toBe('a@b.c');
});

test('an auth event that arrives before getSession resolves is not overwritten by it', async () => {
  const client = createFakeSupabase();
  let resolveSession;
  client.auth.getSession.mockImplementationOnce(() => new Promise((r) => (resolveSession = r)));
  const result = renderAuth(client);
  expect(result.current.loading).toBe(true);

  act(() => client.auth._emit('SIGNED_IN', { user: { id: 'u2', email: 'new@b.c' } }));
  await act(async () => resolveSession({ data: { session: null }, error: null })); // stale
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user.email).toBe('new@b.c');
  expect(result.current.event).toBe('SIGNED_IN');
});

test('methods call supabase auth with the right arguments and return { data, error }', async () => {
  const client = createFakeSupabase();
  const result = renderAuth(client);
  await waitFor(() => expect(result.current.loading).toBe(false));
  const origin = window.location.origin;

  expect(await result.current.signIn('a@b.c', 'pw')).toEqual({ data: {}, error: null });
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });

  await result.current.signUp('a@b.c', 'password1', 'Ann');
  expect(client.auth.signUp).toHaveBeenCalledWith({
    email: 'a@b.c',
    password: 'password1',
    options: { data: { full_name: 'Ann' }, emailRedirectTo: `${origin}/` },
  });

  await result.current.signInWithGoogle();
  expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${origin}/` } });

  await result.current.sendReset('a@b.c');
  expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', { redirectTo: `${origin}/reset-password` });

  await result.current.updatePassword('newpass12');
  expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass12' });

  await result.current.signOut();
  expect(client.auth.signOut).toHaveBeenCalled();
});

test('methods return errors instead of throwing', async () => {
  const client = createFakeSupabase();
  client.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { message: 'Invalid login credentials' } });
  client.auth.signOut.mockRejectedValueOnce(new Error('network down'));
  const result = renderAuth(client);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(await result.current.signIn('a@b.c', 'bad')).toEqual({ data: {}, error: { message: 'Invalid login credentials' } });
  const res = await result.current.signOut();
  expect(res.data).toBeNull();
  expect(res.error.message).toBe('network down');
});

test('a response without data or error resolves { data: null, error: null }', async () => {
  const client = createFakeSupabase();
  client.auth.signOut.mockResolvedValueOnce(undefined);
  const result = renderAuth(client);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(await result.current.signOut()).toEqual({ data: null, error: null });
});

test('methods return an error when accounts are disabled', async () => {
  const result = renderAuth(null);
  const res = await result.current.signIn('a@b.c', 'pw');
  expect(res).toEqual({ data: null, error: expect.objectContaining({ message: expect.any(String) }) });
});

test('unsubscribes on unmount', async () => {
  const client = createFakeSupabase();
  const unsubscribe = vi.fn();
  const original = client.auth.onAuthStateChange;
  client.auth.onAuthStateChange = (cb) => {
    original(cb);
    return { data: { subscription: { unsubscribe } } };
  };
  const { unmount } = render(
    <AuthProvider client={client}>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('true|guest')).toBeInTheDocument());
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});

test('useAuth throws outside the provider', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow(/AuthProvider/);
  spy.mockRestore();
});
