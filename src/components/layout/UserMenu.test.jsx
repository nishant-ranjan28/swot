import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { useUserDataActions } from '@/context/UserDataContext';
import { createFakeSupabase } from '@/test/fakeSupabase';
import UserMenu from './UserMenu';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/context/UserDataContext', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useUserDataActions: vi.fn(actual.useUserDataActions) };
});

const USER = { id: 'u1', email: 'asha@example.com', user_metadata: { full_name: 'asha k' } };

function Where() {
  const { pathname, state } = useLocation();
  return (
    <>
      <div data-testid="where">{pathname}</div>
      <div data-testid="from">{state?.from ?? ''}</div>
    </>
  );
}

function renderMenu(client, path = '/watchlist') {
  return render(
    <AuthProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <UserMenu />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Keyboard-open, as a keyboard user would: focus the trigger, then ArrowDown. (Without the
// focus, jsdom's stale activeElement from a previous test makes Radix dismiss at once.)
const openMenu = (trigger) => {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
};

beforeEach(() => vi.clearAllMocks());

test('renders nothing without a Supabase client', () => {
  const { container } = render(
    <AuthProvider client={null}>
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    </AuthProvider>,
  );
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing outside an AuthProvider', () => {
  const { container } = render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>,
  );
  expect(container).toBeEmptyDOMElement();
});

test('guest sees a Sign in link that remembers the current page', async () => {
  renderMenu(createFakeSupabase());
  const link = await screen.findByRole('link', { name: 'Sign in' });
  expect(link).toHaveAttribute('href', '/login');
  fireEvent.click(link);
  expect(screen.getByTestId('where')).toHaveTextContent('/login');
  expect(screen.getByTestId('from')).toHaveTextContent('/watchlist');
});

test('the remembered page keeps its query string and hash', async () => {
  renderMenu(createFakeSupabase(), '/screener?sector=it#results');
  fireEvent.click(await screen.findByRole('link', { name: 'Sign in' }));
  expect(screen.getByTestId('from')).toHaveTextContent('/screener?sector=it#results');
});

test('signed-in user sees the avatar menu with email, Settings and Sign out', async () => {
  renderMenu(createFakeSupabase({ session: { user: USER } }));
  const trigger = await screen.findByRole('button', { name: 'Account menu' });
  expect(trigger).toHaveTextContent('A');
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  openMenu(trigger);
  expect(await screen.findByText('asha@example.com')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
});

test('sign out flushes pending writes first, then signs out, toasts and goes home', async () => {
  const order = [];
  const flush = vi.fn(async () => {
    await Promise.resolve();
    order.push('flush');
  });
  useUserDataActions.mockReturnValue({ flush, reload: vi.fn() });
  const client = createFakeSupabase({ session: { user: USER } });
  client.auth.signOut.mockImplementation(async () => {
    order.push('signOut');
    return { data: {}, error: null };
  });
  renderMenu(client);
  openMenu(await screen.findByRole('button', { name: 'Account menu' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith('Signed out'));
  expect(order).toEqual(['flush', 'signOut']);
  expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
});
