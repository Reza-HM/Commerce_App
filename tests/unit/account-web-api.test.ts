import { apiOrigin, createAccountApi } from '../../apps/web/src/accounts/api';

test('verification uses fixed noncredentialed POST and distinguishes sign-in feedback', async () => {
  const send = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createAccountApi(undefined, send);
  send.mockResolvedValue(
    new Response(
      JSON.stringify({ status: 'accepted', message: 'Verification request processed.' }),
      { status: 202 },
    ),
  );
  expect(await api('requestVerification', { email: 'reader@example.test' })).toEqual({
    ok: true,
  });
  expect(send).toHaveBeenLastCalledWith(
    'http://127.0.0.1:3001/accounts/email-verification/request',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'X-Commerce-Request': '1' },
    }),
  );
  send.mockResolvedValue(
    new Response(JSON.stringify({ status: 'verified' }), { status: 200 }),
  );
  expect(
    await api('confirmVerification', { token: 'synthetic', password: 'synthetic' }),
  ).toEqual({ ok: true });
  send.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'verification_required',
        message: 'Email verification required',
        requestId: 'synthetic',
      }),
      { status: 403 },
    ),
  );
  expect(
    await api('signIn', { email: 'reader@example.test', password: 'synthetic' }),
  ).toEqual({ ok: false, code: 'verificationRequired' });
  send.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'http_403',
        message: 'Request rejected',
        requestId: 'synthetic',
      }),
      { status: 403 },
    ),
  );
  expect(
    await api('signIn', { email: 'reader@example.test', password: 'synthetic' }),
  ).toEqual({ ok: false, code: 'forbidden' });
});

test('public origin defaults only when absent and rejects destinations outside an origin', () => {
  expect(apiOrigin(undefined)).toBe('http://127.0.0.1:3001');
  expect(apiOrigin(undefined, 'localhost')).toBe('http://localhost:3001');
  expect(apiOrigin(undefined, 'example.test')).toBe('http://127.0.0.1:3001');
  expect(apiOrigin('https://example.test', 'localhost')).toBe('https://example.test');
  expect(apiOrigin('https://example.test/')).toBe('https://example.test');
  for (const value of [
    '',
    ' https://example.test',
    'ftp://example.test',
    'https://u:p@example.test',
    'https://@example.test',
    'https://example.test/path',
    'https://example.test?',
    'https://example.test#',
    'https:\\example.test',
  ])
    expect(apiOrigin(value)).toBeUndefined();
});

test('fixed paths preserve registration and session credential boundaries and raw inputs', async () => {
  const send = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'accepted',
          message: 'Registration request processed.',
        }),
        { status: 202 },
      ),
    );
  const api = createAccountApi(undefined, send);
  const input = {
    email: ' Person@Example.test ',
    password: '  Synthetic Unicode e\u0301 passphrase  ',
  };
  expect(await api('register', input)).toEqual({ ok: true });
  expect(send).toHaveBeenLastCalledWith(
    'http://127.0.0.1:3001/accounts/register',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      redirect: 'error',
    }),
  );
  send.mockResolvedValue(
    new Response(JSON.stringify({ status: 'signed_in' }), { status: 201 }),
  );
  expect(await api('signIn', input)).toEqual({ ok: true });
  expect(send).toHaveBeenLastCalledWith(
    'http://127.0.0.1:3001/accounts/sessions',
    expect.objectContaining({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Commerce-Request': '1' },
    }),
  );
  send.mockResolvedValue(
    new Response(
      JSON.stringify({
        status: 'signed_in',
        accountId: '11111111-1111-4111-8111-111111111111',
      }),
    ),
  );
  expect(await api('current')).toEqual({ ok: true });
  expect(send).toHaveBeenLastCalledWith(
    expect.stringContaining('/current'),
    expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'X-Commerce-Request': '1' },
    }),
  );
  send.mockResolvedValue(new Response(null, { status: 204 }));
  expect(await api('signOut')).toEqual({ ok: true });
  expect(send).toHaveBeenLastCalledWith(
    expect.stringContaining('/current'),
    expect.objectContaining({ method: 'DELETE' }),
  );
});

test('responses map only safe codes and reject unexpected success and malformed data', async () => {
  const send = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createAccountApi(undefined, send);
  for (const [status, body, code] of [
    [
      400,
      {
        error: 'invalid_registration',
        field: 'password',
        code: 'password_length',
        message: 'do not echo',
      },
      'passwordLength',
    ],
    [
      400,
      { error: 'invalid_registration', field: 'email', code: '__proto__' },
      'invalid',
    ],
    [
      400,
      { error: 'invalid_registration', field: 'email', code: 'password_length' },
      'invalid',
    ],
    [401, {}, 'credentials'],
    [403, {}, 'forbidden'],
    [429, {}, 'limited'],
    [503, {}, 'unavailable'],
    [202, { status: 'accepted', message: 'wrong' }, 'unavailable'],
    [200, { status: 'signed_in', accountId: 'invalid' }, 'unavailable'],
  ] as const) {
    send.mockResolvedValue(new Response(JSON.stringify(body), { status }));
    expect(
      await api(status === 400 || status === 202 ? 'register' : 'current'),
    ).toMatchObject({ ok: false, code });
  }
  send.mockResolvedValue(new Response('<html>private failure</html>', { status: 500 }));
  expect(await api('signIn')).toEqual({ ok: false, code: 'unavailable' });
  const invalid = createAccountApi('', send);
  send.mockClear();
  expect(await invalid('signIn')).toEqual({ ok: false, code: 'configuration' });
  expect(send).not.toHaveBeenCalled();
});

test('deadline covers response decoding, aborts work, and never retries', async () => {
  jest.useFakeTimers();
  try {
    const send = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({
        json: () => new Promise(() => {}),
        status: 200,
      } as unknown as Response);
    const pending = createAccountApi(undefined, send)('current');
    await jest.advanceTimersByTimeAsync(15000);
    expect(await pending).toEqual({ ok: false, code: 'timeout' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('caller cancellation settles once without waiting for a late response', async () => {
  const controller = new AbortController();
  let resolve!: (response: Response) => void;
  const send = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  const pending = createAccountApi(undefined, send)(
    'current',
    undefined,
    controller.signal,
  );
  controller.abort();
  expect(await pending).toEqual({ ok: false, code: 'cancelled' });
  resolve(
    new Response(
      JSON.stringify({
        status: 'signed_in',
        accountId: '11111111-1111-4111-8111-111111111111',
      }),
    ),
  );
  expect(send).toHaveBeenCalledTimes(1);
});
