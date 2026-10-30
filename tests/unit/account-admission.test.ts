import {
  RegistrationAdmission,
  RegistrationRejection,
} from '../../apps/api/src/accounts/admission';

test('fixed windows normalize mapped addresses, round Retry-After and expire at the boundary', () => {
  let now = 0;
  const gate = new RegistrationAdmission(() => now);
  for (let i = 0; i < 5; i++) gate.admit(i % 2 ? '::ffff:127.0.0.1' : '127.0.0.1');
  now = 59001;
  expect(() => gate.admit('127.0.0.1')).toThrow(
    expect.objectContaining({ status: 429, retryAfter: 1 }),
  );
  now = 60000;
  expect(() => gate.admit('127.0.0.1')).not.toThrow();
});

test('bucket capacity never evicts a live peer; expiry frees capacity', () => {
  let now = 0;
  const gate = new RegistrationAdmission(() => now);
  for (let i = 0; i < 1024; i++) gate.admit(`peer-${i}`);
  expect(() => gate.admit('new-peer')).toThrow(
    expect.objectContaining({ status: 429, retryAfter: 60 }),
  );
  for (let i = 1; i < 5; i++) gate.admit('peer-0');
  expect(() => gate.admit('peer-0')).toThrow(RegistrationRejection);
  now = 60000;
  expect(() => gate.admit('new-peer')).not.toThrow();
});

test('slots are bounded, releases idempotent, drain waits and stop refuses more work', async () => {
  const gate = new RegistrationAdmission();
  const first = gate.acquire(),
    second = gate.acquire();
  expect(() => gate.acquire()).toThrow(
    expect.objectContaining({ status: 503, retryAfter: 1 }),
  );
  let drained = false;
  const pending = gate.drain().then(() => {
    drained = true;
  });
  first();
  first();
  await Promise.resolve();
  expect(drained).toBe(false);
  gate.stop();
  expect(() => gate.admit('peer')).toThrow(RegistrationRejection);
  expect(() => gate.acquire()).toThrow(RegistrationRejection);
  second();
  await pending;
  expect(drained).toBe(true);
});
