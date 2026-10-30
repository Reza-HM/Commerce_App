import { logEvent, logStartupFailure } from '../../apps/api/src/logging';

test('framework logger emits structured operational context and masks sensitive keys', () => {
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    logEvent({
      event: 'request_complete',
      requestId: 'generated',
      status: 200,
      authorization: 'AUTH_SECRET',
      password: 'PASSWORD_SECRET',
    });
    const line = String(stdout.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      event: 'request_complete',
      requestId: 'generated',
      status: 200,
    });
    expect(line).not.toMatch(/AUTH_SECRET|PASSWORD_SECRET/);
    logStartupFailure('Invalid or missing configuration: DATABASE_URL');
    const failure = String(stderr.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(failure).message).toEqual({
      event: 'startup_failed',
      message: 'Invalid or missing configuration: DATABASE_URL',
    });
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
});
