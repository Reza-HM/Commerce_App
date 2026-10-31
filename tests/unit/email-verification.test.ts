import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  VerificationService,
  validVerificationToken,
  verificationDigest,
} from '../../apps/api/src/accounts/verification';
import { RegistrationService } from '../../apps/api/src/accounts/service';
import {
  LocalVerificationSender,
  readMailConfiguration,
} from '../../apps/api/src/accounts/mail';
import { PostgresVerificationRepository } from '../../packages/database/src/email-verifications';
import { SessionService } from '../../apps/api/src/accounts/sessions';
const load = createRequire(resolve('package.json'));
const { createSmtpCapture, capturedToken } = load('./tests/fixtures/smtp-capture.cjs');
const token = randomBytes(32).toString('base64url');
const proof = { accountId: 'account', passwordHash: 'synthetic-hash' };

function harness() {
  const repository = {
    issue: jest.fn().mockResolvedValue(true),
    lookup: jest.fn().mockResolvedValue(proof),
    confirm: jest.fn().mockResolvedValue(true),
  };
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const send = jest.fn().mockResolvedValue(undefined),
    event = jest.fn(),
    verify = jest.fn().mockResolvedValue(true);
  return {
    repository,
    registration,
    send,
    event,
    verify,
    service: new VerificationService(repository, registration, { send }, event, verify),
  };
}

test('issuance canonicalizes identity, stores only a digest, and drains actual delivery', async () => {
  const h = harness();
  let finish!: () => void;
  h.send.mockImplementation(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  await h.service.request({ email: ' Person@Example.test ' }, 'peer');
  expect(h.repository.issue).toHaveBeenCalledWith(
    'person@example.test',
    expect.any(String),
    expect.stringMatching(/^[0-9a-f]{64}$/),
  );
  expect(h.send).toHaveBeenCalledTimes(1);
  let drained = false;
  const drain = h.service.drain().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  finish();
  await drain;
  expect(h.event).toHaveBeenCalledWith('verification_delivery_accepted');
});

test('registration attempts initial mail only for committed new accounts and preserves acceptance after preparation failure', async () => {
  const initial = jest.fn().mockRejectedValue(new Error('synthetic mail failure'));
  for (const existing of [false, true]) {
    const registration = new RegistrationService(
      {
        create: async () =>
          existing ? { kind: 'existing' } : { kind: 'created', id: 'new-account' },
      },
      {
        hash: async () => 'synthetic-hash',
        commonPasswords: new Set(),
        verification: { initial },
      },
    );
    await expect(
      registration.register(
        { email: 'initial@example.test', password: 'Synthetic initial mail phrase' },
        'peer',
      ),
    ).resolves.toBeUndefined();
  }
  expect(initial).toHaveBeenCalledTimes(1);
});

test('confirmation binds unchanged NFC password to the challenge, never changing credentials', async () => {
  const h = harness();
  await h.service.confirm({ token, password: ' e\u0301 ' }, 'peer');
  expect(h.verify).toHaveBeenCalledWith(' é ', proof.passwordHash);
  expect(h.repository.confirm).toHaveBeenCalledWith(verificationDigest(token), proof);
  h.verify.mockResolvedValue(false);
  await expect(
    h.service.confirm({ token, password: 'wrong' }, 'peer'),
  ).rejects.toMatchObject({ status: 401 });
  expect(h.repository.confirm).toHaveBeenCalledTimes(1);
  h.repository.lookup.mockResolvedValue(undefined);
  await expect(
    h.service.confirm({ token, password: 'wrong' }, 'peer'),
  ).rejects.toMatchObject({ status: 401 });
  expect(h.verify).toHaveBeenCalledTimes(3);
  expect(validVerificationToken(token + '=')).toBe(false);
});

test('validation, budgets, shared hashing, and delivery failures fail safely', async () => {
  const h = harness();
  for (const body of [null, { email: 'bad' }, { email: 'a@example.test', extra: true }])
    await expect(h.service.request(body, 'bad')).rejects.toMatchObject({ status: 400 });
  expect(h.repository.issue).not.toHaveBeenCalled();
  const one = h.registration.acquirePasswordWork(),
    two = h.registration.acquirePasswordWork();
  await expect(h.service.confirm({ token, password: 'x' }, 'peer')).rejects.toMatchObject(
    { status: 503 },
  );
  one();
  two();
  h.send.mockRejectedValue(new Error('PRIVATE_SMTP_DATA'));
  await h.service.request({ email: 'a@example.test' }, 'send');
  await h.service.drain();
  expect(h.event.mock.calls.flat().join(' ')).not.toContain('PRIVATE');
  h.service.stop();
  await expect(
    h.service.request({ email: 'a@example.test' }, 'new'),
  ).rejects.toMatchObject({ status: 503 });
});

test('repository keeps locking, cooldown, expiry, credential proof and mutation in bound transactions', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const repository = new PostgresVerificationRepository({
    transaction: (work) => work({ query } as never),
  });
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'account', email_verified_at: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'token' }] });
  expect(await repository.issue('a@example.test', 'token', 'digest')).toBe(true);
  expect(query.mock.calls[1]![0]).toContain('FOR UPDATE');
  expect(query.mock.calls[3]![0]).toContain("interval '60 seconds'");
  expect(query.mock.calls[3]![0]).toContain('< 3');
  query.mockClear();
  query
    .mockResolvedValueOnce({ rows: [{ id: 'account' }] })
    .mockResolvedValueOnce({ rows: [{ account_id: 'account' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'token' }] });
  expect(await repository.confirm('digest', proof)).toBe(true);
  expect(query.mock.calls[0]![0]).toContain('FOR UPDATE');
  expect(query.mock.calls[1]![1]).toEqual(['account', proof.passwordHash]);
  expect(query.mock.calls.map((call) => call[0]).join(' ')).toContain(
    'COALESCE(revoked_at',
  );
  expect(query.mock.calls.at(-1)![1]).toEqual(['account']);
});

test('local SMTP captures the intended message and actually cancels stalled sockets', async () => {
  const capture = await createSmtpCapture();
  try {
    const sender = new LocalVerificationSender({
      host: '127.0.0.1',
      port: capture.port,
      webOrigin: 'http://localhost:3000',
    });
    await sender.send('synthetic@example.test', token);
    expect(capture.messages.length).toBe(1);
    expect(capturedToken(capture.messages[0]) === token).toBe(true);
    expect(capture.messages[0].includes('PRIVATE_PASSWORD')).toBe(false);
  } finally {
    await capture.close();
  }
  const stalled = await createSmtpCapture({ stall: true });
  try {
    const started = performance.now();
    await expect(
      new LocalVerificationSender({
        host: '127.0.0.1',
        port: stalled.port,
        webOrigin: 'http://localhost:3000',
      }).send('synthetic@example.test', token),
    ).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(6500);
  } finally {
    await stalled.close();
  }
}, 15000);

test('issuance capacity has no queue, suppresses initial mail, and peer budgets reject before lookup', async () => {
  const h = harness();
  const releases: (() => void)[] = [];
  h.send.mockImplementation(() => new Promise<void>((done) => releases.push(done)));
  await h.service.request({ email: 'a@example.test' }, 'one');
  await h.service.request({ email: 'b@example.test' }, 'two');
  await expect(
    h.service.request({ email: 'unknown@example.test' }, 'three'),
  ).rejects.toMatchObject({ status: 503 });
  await h.service.initial('c@example.test');
  expect(h.repository.issue).toHaveBeenCalledTimes(2);
  for (const release of releases) release();
  await h.service.drain();
  h.repository.issue.mockResolvedValue(false);
  for (let i = 0; i < 5; i++)
    await h.service.request({ email: 'unknown@example.test' }, 'limited');
  const before = h.repository.issue.mock.calls.length;
  await expect(
    h.service.request({ email: 'unknown@example.test' }, 'limited'),
  ).rejects.toMatchObject({ status: 429 });
  expect(h.repository.issue).toHaveBeenCalledTimes(before);
});

test('partial SMTP acceptance is uncertain and the owned socket is canceled', async () => {
  const capture = await createSmtpCapture({ stallAt: 'data' });
  try {
    await expect(
      new LocalVerificationSender({
        host: '127.0.0.1',
        port: capture.port,
        webOrigin: 'http://localhost:3000',
      }).send('synthetic@example.test', token),
    ).rejects.toThrow();
    expect(capture.messages.length).toBe(1);
  } finally {
    await capture.close();
  }
}, 15000);

test('mail configuration restricts transport and fixed links without exposing inputs', () => {
  const valid = {
    NODE_ENV: 'development',
    MAIL_PROVIDER: 'capture',
    MAIL_SMTP_HOST: '127.0.0.1',
    MAIL_SMTP_PORT: '1025',
    VERIFICATION_WEB_ORIGIN: 'http://localhost:3000',
  };
  expect(readMailConfiguration(valid, ['http://localhost:3000'])).toMatchObject({
    port: 1025,
    provider: 'capture',
  });
  for (const values of [
    { MAIL_SMTP_HOST: 'remote.invalid' },
    { MAIL_SMTP_HOST: '127.0.0.1.invalid' },
    { MAIL_SMTP_PORT: '0' },
    { VERIFICATION_WEB_ORIGIN: 'https://PRIVATE@example.invalid/path' },
  ]) {
    expect(() =>
      readMailConfiguration({ ...valid, ...values }, ['http://localhost:3000']),
    ).toThrow('Invalid or missing configuration');
  }
});

test('unverified accounts cannot sign in even with a matching password', async () => {
  const h = harness();
  const create = jest.fn();
  const service = new SessionService(
    {
      credential: async () => ({ ...proof, emailVerified: false }),
      create,
      renew: async () => undefined,
      revoke: async () => {},
    },
    h.registration,
    async () => true,
  );
  await expect(
    service.signIn({ email: 'a@example.test', password: 'x' }, 'peer'),
  ).rejects.toMatchObject({ status: 403, verificationRequired: true });
  expect(create).not.toHaveBeenCalled();
});
