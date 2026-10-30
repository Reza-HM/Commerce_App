import { AccountSession } from '../../apps/web/src/accounts/session';
import type { Result } from '../../apps/web/src/accounts/api';

test('inspection distinguishes unauthorized from unavailable and never persists an account identity', async () => {
  const request = jest.fn().mockResolvedValue({ ok: true });
  const navigate = jest.fn();
  const session = new AccountSession(request, navigate);
  expect(session.snapshot()).toBe('checking');
  await session.inspect();
  expect(session.snapshot()).toBe('signedIn');
  request.mockResolvedValue({ ok: false, code: 'unavailable' });
  await session.inspect();
  expect(session.snapshot()).toBe('unavailable');
  expect(navigate).not.toHaveBeenCalled();
  request.mockResolvedValue({ ok: false, code: 'credentials' });
  await session.inspect();
  expect(session.snapshot()).toBe('checking');
  expect(navigate).toHaveBeenCalledWith('/sign-in?reason=session-required');
});

test('late inspection cannot revive presentation after sign-out and concurrent triggers coalesce', async () => {
  let resolve!: (value: Result) => void;
  const request = jest.fn().mockImplementation(
    () =>
      new Promise<Result>((done) => {
        resolve = done;
      }),
  );
  const navigate = jest.fn();
  const session = new AccountSession(request, navigate);
  const inspection = session.inspect();
  await session.inspect();
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValue({ ok: true });
  await session.signOut();
  expect(request.mock.calls[0]![2].aborted).toBe(true);
  resolve({ ok: true });
  await inspection;
  expect(session.snapshot()).toBe('checking');
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/sign-in?reason=signed-out');
});

test('uncertain revocation survives inspection triggers and retry does not need inspection', async () => {
  const request = jest.fn().mockResolvedValue({ ok: false, code: 'unavailable' });
  const navigate = jest.fn();
  const session = new AccountSession(request, navigate);
  await session.signOut();
  expect(session.snapshot()).toBe('unconfirmed');
  await session.inspect();
  expect(request).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  request.mockResolvedValue({ ok: true });
  await session.signOut();
  expect(request.mock.calls.map((call) => call[0])).toEqual(['signOut', 'signOut']);
  expect(navigate).toHaveBeenCalledWith('/sign-in?reason=signed-out');
});

test('leaving cancels work and suppresses old navigation and state changes', async () => {
  let resolve!: (value: Result) => void;
  const request = jest.fn().mockImplementation(
    () =>
      new Promise<Result>((done) => {
        resolve = done;
      }),
  );
  const navigate = jest.fn();
  const session = new AccountSession(request, navigate);
  const listener = jest.fn();
  const unsubscribe = session.subscribe(listener);
  const inspection = session.inspect();
  session.stop();
  resolve({ ok: false, code: 'credentials' });
  await inspection;
  expect(navigate).not.toHaveBeenCalled();
  expect(session.snapshot()).toBe('checking');
  unsubscribe();
  expect(listener).toHaveBeenCalledTimes(1);
});

test('leaving during sign-out preserves uncertainty and ignores a late success', async () => {
  let resolve!: (value: Result) => void;
  const request = jest.fn().mockImplementation(
    () =>
      new Promise<Result>((done) => {
        resolve = done;
      }),
  );
  const navigate = jest.fn();
  const session = new AccountSession(request, navigate);
  const signOut = session.signOut();
  session.stop();
  expect(session.snapshot()).toBe('unconfirmed');
  resolve({ ok: true });
  await signOut;
  await session.inspect();
  expect(navigate).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});
