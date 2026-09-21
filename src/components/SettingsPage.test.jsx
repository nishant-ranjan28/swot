import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import * as repo from '@/lib/userDataRepo';
import { AuthProvider } from '@/context/AuthContext';
import { UserDataProvider } from '@/context/UserDataContext';
import { createFakeSupabase } from '@/test/fakeSupabase';
import SettingsPage from './SettingsPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/userDataRepo', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, updateProfile: vi.fn(actual.updateProfile), getProfile: vi.fn(actual.getProfile) };
});

const USER = { id: 'u1', email: 'asha@example.com' };
const PROFILE = {
  id: 'u1',
  display_name: 'Asha',
  default_market: 'us',
  email_alerts: true,
  daily_digest: false,
  digest_market: 'us',
  imported_at: '2026-09-01T00:00:00.000Z',
  welcome_sent_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
};

function Where() {
  const { pathname, state } = useLocation();
  return (
    <>
      <div data-testid="where">{pathname}</div>
      <div data-testid="from">{state?.from ?? ''}</div>
    </>
  );
}

function renderSettings(client) {
  render(
    <AuthProvider client={client}>
      <UserDataProvider>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </UserDataProvider>
    </AuthProvider>,
  );
}

const signedIn = () => createFakeSupabase({ session: { user: USER }, tables: { profiles: [{ ...PROFILE }] } });

beforeEach(() => vi.clearAllMocks());

test('shows the not-configured state without a Supabase client', () => {
  renderSettings(null);
  expect(screen.getByText("Accounts aren't configured on this deployment.")).toBeInTheDocument();
});

test('shows a skeleton while auth loads, then redirects a guest to /login with from=/settings', async () => {
  renderSettings(createFakeSupabase());
  expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
  expect(screen.getByTestId('from')).toHaveTextContent('/settings');
});

test('loads the profile values into the form', async () => {
  renderSettings(signedIn());
  expect(await screen.findByDisplayValue('Asha')).toBeInTheDocument();
  expect(screen.getByLabelText('Default market')).toHaveValue('us');
  expect(screen.getByLabelText(/email me when a price alert/i)).toBeChecked();
  expect(screen.getByLabelText(/daily market digest/i)).not.toBeChecked();
  expect(screen.getByLabelText('Digest market')).toHaveValue('us');
  expect(screen.getByText('asha@example.com')).toBeInTheDocument();
});

test('Save sends only the changed fields and toasts', async () => {
  const client = signedIn();
  renderSettings(client);
  fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'Asha K' } });
  fireEvent.click(screen.getByLabelText(/email me when a price alert/i));
  fireEvent.change(screen.getByLabelText('Default market'), { target: { value: 'in' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved'));
  expect(repo.updateProfile).toHaveBeenCalledWith(client, 'u1', {
    display_name: 'Asha K',
    email_alerts: false,
    default_market: 'in',
  });
  expect(client.tables.profiles[0]).toMatchObject({ display_name: 'Asha K', email_alerts: false, default_market: 'in' });
});

test('Save is disabled until something changes', async () => {
  renderSettings(signedIn());
  await screen.findByDisplayValue('Asha');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('a failed save shows an error toast', async () => {
  const client = signedIn();
  renderSettings(client);
  fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'X' } });
  client.failNext = true;
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(toast.success).not.toHaveBeenCalled();
});

test('a save that updates no row (profile missing) is a failure, not "Saved"', async () => {
  const client = signedIn();
  renderSettings(client);
  fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'X' } });
  // The row vanished after loading: update().select().maybeSingle() → { data: null, error: null }.
  client.tables.profiles.length = 0;
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save your settings — try again"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/profile row.*missing/i), 'u1');
    // Still dirty, so the user can retry.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  } finally {
    error.mockRestore();
  }
});

test('danger zone signs out', async () => {
  const client = signedIn();
  renderSettings(client);
  await screen.findByDisplayValue('Asha');
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(client.auth.signOut).toHaveBeenCalled());
  await waitFor(() => expect(toast).toHaveBeenCalledWith('Signed out'));
});
