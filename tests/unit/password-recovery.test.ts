import { randomBytes } from 'node:crypto';
import { RecoveryService } from '../../apps/api/src/accounts/recovery';
import { RegistrationService } from '../../apps/api/src/accounts/service';
import { RegistrationAdmission } from '../../apps/api/src/accounts/admission';
import {
  VerificationService,
  verificationDigest,
} from '../../apps/api/src/accounts/verification';
import { PostgresRecoveryRepository } from '../../packages/database/src/password-recoveries';
import { accountMail } from '../../apps/api/src/accounts/mail-content';

const token = randomBytes(32).toString('base64url');
const password = ' A new synthetic recovery phrase ';
const proof = {
  accountId: 'account',
  emailNormalized: 'owner@example.test',
  passwordHash: 'old-hash',
};
function harness() {
  const repository = {
    issue: jest.fn().mockResolvedValue(true),
    lookup: jest.fn().mockResolvedValue(proof),
    confirm: jest.fn().mockResolvedValue(true),
  };
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const delivery = new RegistrationAdmission();
  const sender = {
    sendRecovery: jest.fn().mockResolvedValue(undefined),
    notifyReset: jest.fn().mockResolvedValue(undefined),
  };
  const event = jest.fn(),
    hash = jest.fn().mockResolvedValue('fresh-salted-hash');
  return {
    repository,
    registration,
    delivery,
    sender,
    event,
    hash,
    service: new RecoveryService(repository, registration, sender, event, delivery, hash),
  };
}

test('recovery canonicalizes email and persists only a digest before bounded asynchronous SMTP', async () => {
  const h = harness();
  let finish!: () => void;
  h.sender.sendRecovery.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await h.service.request({ email: ' OWNER@Example.test ' }, 'peer');
  expect(h.repository.issue).toHaveBeenCalledWith(
    proof.emailNormalized,
    expect.any(String),
    expect.stringMatching(/^[0-9a-f]{64}$/),
  );
  const raw = h.sender.sendRecovery.mock.calls[0]![1];
  expect(h.repository.issue.mock.calls[0]![2]).toBe(verificationDigest(raw));
  let drained = false;
  const drain = h.service.drain().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  finish();
  await drain;
  expect(h.event).toHaveBeenCalledWith('recovery_delivery_accepted');
});

test('confirmation screens the bound identity, stores a fresh NFC hash, and notifies only after commit', async () => {
  const h = harness();
  h.repository.confirm.mockImplementation(async () => {
    expect(h.sender.notifyReset).not.toHaveBeenCalled();
    return true;
  });
  await h.service.confirm({ token, password: password + 'e\u0301' }, 'peer');
  await h.service.drain();
  expect(h.hash).toHaveBeenCalledWith(password + 'é');
  expect(h.repository.confirm).toHaveBeenCalledWith(
    verificationDigest(token),
    proof,
    'fresh-salted-hash',
  );
  expect(h.sender.notifyReset).toHaveBeenCalledWith(proof.emailNormalized);
  h.repository.confirm.mockResolvedValue(false);
  await expect(h.service.confirm({ token, password }, 'peer')).rejects.toMatchObject({
    status: 401,
  });
  expect(h.sender.notifyReset).toHaveBeenCalledTimes(1);
});

test('invalid requests and new-password policy fail before hashing and never consume a challenge', async () => {
  const h = harness();
  for (const body of [
    null,
    [],
    { token },
    { token, password, email: proof.emailNormalized },
    { token: token + '=', password },
  ]) {
    await expect(
      h.service.confirm(body, randomBytes(4).toString('hex')),
    ).rejects.toMatchObject({ status: 400 });
  }
  for (const [input, code] of [
    ['short', 'password_length'],
    ['\ud800', 'password_encoding'],
    ['x'.repeat(1025), 'password_too_large'],
    ['commerceapp12345', 'password_blocklisted'],
  ]) {
    await expect(
      h.service.confirm({ token, password: input }, 'policy'),
    ).rejects.toMatchObject({ status: 400, code });
  }
  expect(h.hash).not.toHaveBeenCalled();
  expect(h.repository.confirm).not.toHaveBeenCalled();
  await expect(
    h.service.confirm({ token, password: proof.emailNormalized }, 'context'),
  ).rejects.toMatchObject({ status: 400, code: 'password_blocklisted' });
  h.repository.lookup.mockResolvedValue(undefined);
  await expect(
    h.service.confirm({ token, password: proof.emailNormalized }, 'unknown'),
  ).rejects.toMatchObject({ status: 401, code: undefined });
});

test('storage outages fail safely, but post-commit notification failure does not fail a reset', async () => {
  const h = harness();
  h.repository.issue.mockRejectedValue(
    Object.assign(new Error('PRIVATE'), { code: '42P01' }),
  );
  await expect(
    h.service.request({ email: proof.emailNormalized }, 'peer'),
  ).rejects.toMatchObject({ status: 503 });
  h.sender.notifyReset.mockRejectedValue(new Error('PRIVATE_SMTP_TOKEN'));
  await expect(h.service.confirm({ token, password }, 'peer')).resolves.toBeUndefined();
  await h.service.drain();
  expect(h.event).toHaveBeenCalledWith('reset_notification_delivery_failed');
  expect(JSON.stringify(h.event.mock.calls)).not.toContain('PRIVATE');
});

test('recovery shares actual mail capacity with verification and does not queue or release on disconnect', async () => {
  const h = harness();
  const finish: (() => void)[] = [];
  const send = () => new Promise<void>((resolve) => finish.push(resolve));
  h.sender.sendRecovery.mockImplementation(send);
  const verification = new VerificationService(
    {
      issue: async () => true,
      lookup: async () => undefined,
      confirm: async () => false,
    },
    h.registration,
    { send },
    () => {},
    undefined,
    h.delivery,
  );
  await verification.request({ email: proof.emailNormalized }, 'peer');
  await h.service.request({ email: proof.emailNormalized }, 'peer');
  await expect(
    h.service.request({ email: 'unknown@example.test' }, 'peer'),
  ).rejects.toMatchObject({ status: 503 });
  await h.service.confirm({ token, password }, 'peer');
  expect(h.sender.notifyReset).not.toHaveBeenCalled();
  expect(h.event).toHaveBeenCalledWith('reset_notification_delivery_suppressed');
  h.service.stop();
  await expect(
    h.service.request({ email: proof.emailNormalized }, 'new'),
  ).rejects.toMatchObject({ status: 503 });
  finish.forEach((resolve) => resolve());
  await h.service.drain();
});

test('recovery confirmation holds shared password work through persistence and drains on shutdown', async () => {
  const h = harness();
  let finish!: (value: string) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.hash.mockImplementation(() => {
    started();
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  const first = h.service.confirm({ token, password }, 'peer');
  await ready;
  const release = h.registration.acquirePasswordWork();
  await expect(h.service.confirm({ token, password }, 'peer')).rejects.toMatchObject({
    status: 503,
  });
  h.registration.stop();
  h.service.stop();
  let drained = false;
  const drain = h.registration.drain().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  release();
  finish('new-hash');
  await first;
  await drain;
  expect(h.repository.confirm).toHaveBeenCalledTimes(1);
});

test('recovery peer admission remains bounded and ignores submitted account identity', async () => {
  const h = harness();
  for (let i = 0; i < 5; i++)
    await expect(h.service.request({}, 'peer')).rejects.toMatchObject({ status: 400 });
  await expect(
    h.service.request({ email: proof.emailNormalized }, 'peer'),
  ).rejects.toMatchObject({ status: 429 });
  expect(h.repository.issue).not.toHaveBeenCalled();
});

test('recovery repository revalidates proof before any mutation and binds all SQL values', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const repository = new PostgresRecoveryRepository({
    transaction: (work) => work({ query } as never),
  });
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'account' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'challenge' }] });
  expect(await repository.issue(proof.emailNormalized, 'challenge', 'digest')).toBe(true);
  expect(query.mock.calls[2]![1]).toEqual([proof.emailNormalized]);
  query.mockClear();
  query
    .mockResolvedValueOnce({ rows: [{ id: 'account' }] })
    .mockResolvedValueOnce({ rows: [] });
  expect(await repository.confirm('digest', proof, 'new-hash')).toBe(false);
  expect(query).toHaveBeenCalledTimes(2);
  query.mockClear();
  query
    .mockResolvedValueOnce({ rows: [{ id: 'account' }] })
    .mockResolvedValueOnce({ rows: [{ account_id: 'account' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'challenge' }] });
  expect(await repository.confirm('digest', proof, 'new-hash')).toBe(true);
  expect(query.mock.calls[0]![0]).toContain('accounts WHERE');
  expect(query.mock.calls[1]![1]).toEqual(['account', 'old-hash']);
  expect(query.mock.calls[3]![1]).toEqual(['account', 'new-hash']);
  expect(query.mock.calls.at(-1)![0]).toContain(
    'DELETE FROM account_password_recoveries',
  );
});

test('mail purpose keeps reset notification free of recovery tokens and passwords', () => {
  const recovery = accountMail('recovery', 'http://127.0.0.1:3000', token);
  expect(recovery.text).toContain('/reset-password#token=' + token);
  expect(recovery.html).toContain('expires in 30 minutes');
  const notification = accountMail('notification', 'http://127.0.0.1:3000');
  expect(notification.text).toContain('all existing sessions have been revoked');
  expect(notification.html).not.toContain(token);
  expect(notification.html).not.toContain('#token=');
});
