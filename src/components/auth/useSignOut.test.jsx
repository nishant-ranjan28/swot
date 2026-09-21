import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { useOptionalAuth } from '@/context/AuthContext';
import { useUserDataActions } from '@/context/UserDataContext';
import { useSignOut } from './useSignOut';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useOptionalAuth: vi.fn() }));
vi.mock('@/context/UserDataContext', () => ({ useUserDataActions: vi.fn() }));

function setup({ flush = vi.fn(async () => {}) } = {}) {
  const auth = { signOut: vi.fn(async () => ({ error: null })) };
  useOptionalAuth.mockReturnValue(auth);
  useUserDataActions.mockReturnValue({ flush, reload: vi.fn() });
  const { result } = renderHook(() => useSignOut(), { wrapper: MemoryRouter });
  return { auth, flush, result };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

test('flushes, signs out, toasts and exposes busy while running', async () => {
  let release;
  const flush = vi.fn(() => new Promise((r) => (release = r)));
  const { auth, result } = setup({ flush });
  expect(result.current.busy).toBe(false);
  let done;
  act(() => {
    done = result.current.signOut();
  });
  expect(result.current.busy).toBe(true);
  await act(async () => {
    release();
    await done;
  });
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith('Signed out');
  expect(result.current.busy).toBe(false);
});

test('a double call runs signOut once', async () => {
  const { auth, flush, result } = setup();
  await act(async () => {
    await Promise.all([result.current.signOut(), result.current.signOut()]);
  });
  expect(flush).toHaveBeenCalledTimes(1);
  expect(auth.signOut).toHaveBeenCalledTimes(1);
});

test('a hung flush still signs out after 3s and warns that changes may be lost', async () => {
  vi.useFakeTimers();
  const flush = vi.fn(() => new Promise(() => {}));
  const { auth, result } = setup({ flush });
  let done;
  act(() => {
    done = result.current.signOut();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999);
  });
  expect(auth.signOut).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
    await done;
  });
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(toast.warning).toHaveBeenCalledWith('Some recent changes may not have saved');
  expect(toast).toHaveBeenCalledWith('Signed out');
});
