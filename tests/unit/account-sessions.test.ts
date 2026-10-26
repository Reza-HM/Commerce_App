import {hashPassword, verifyPassword} from '../../apps/api/src/accounts/password-hasher';
import {validateSignIn} from '../../apps/api/src/accounts/validation';
import {sessionToken} from '../../apps/api/src/accounts/sessions';
import {SessionService, SessionError} from '../../apps/api/src/accounts/sessions';
import {RegistrationService} from '../../apps/api/src/accounts/service';
import {RegistrationRejection} from '../../apps/api/src/accounts/admission';

test('sign-in uses canonical email and NFC without new-password policy', () => {
  expect(validateSignIn({email: ' Person@Example.com ', password: 'e\u0301'})).toEqual({emailNormalized: 'person@example.com', passwordNormalized: 'é'});
  expect(() => validateSignIn({email: 'person@example.com', password: '\ud800'})).toThrow();
  expect(() => validateSignIn({email: 'person@example.com', password: 'x', extra: 1})).toThrow();
});

test('verification accepts existing scrypt credentials and rejects malformed parameters', async () => {
  const hash = await hashPassword('synthetic verification password');
  expect(await verifyPassword('synthetic verification password', hash)).toBe(true);
  expect(await verifyPassword('another synthetic password', hash)).toBe(false);
  await expect(verifyPassword('synthetic', hash.replace('131072', '999999999'))).rejects.toThrow();
  const parts = hash.split('$');
  parts[5] = 'AAAAAAAAAAAAAAAAAAAAAB';
  await expect(verifyPassword('synthetic', parts.join('$'))).rejects.toThrow();
}, 15000);

test('session cookie parser rejects duplicates and noncanonical values', () => {
  const token = Buffer.alloc(32, 1).toString('base64url');
  expect(sessionToken(`__Host-commerce_session=${token}`)).toBe(token);
  expect(sessionToken(`__Host-commerce_session=${token}; __Host-commerce_session=${token}`)).toBeUndefined();
  expect(sessionToken('__Host-commerce_session=bad')).toBeUndefined();
});

test('unknown credentials never create a session', async () => {
  const create = jest.fn();
  const registration = new RegistrationService({create: async () => ({kind:'existing'})});
  const service = new SessionService({credential: async () => undefined, create, renew: async () => undefined, revoke: async () => {}}, registration);
  await expect(service.signIn({email:'missing@example.test',password:'synthetic'}, '127.0.0.1')).rejects.toBeInstanceOf(SessionError);
  expect(create).not.toHaveBeenCalled();
}, 15000);

test('a matching dummy verifier cannot authenticate an absent account', async () => {
  const create = jest.fn();
  const registration = new RegistrationService({create: async () => ({kind:'existing'})});
  const service = new SessionService({credential: async () => undefined, create, renew: async () => undefined, revoke: async () => {}}, registration, async () => true);
  await expect(service.signIn({email:'missing@example.test',password:'synthetic'}, '127.0.0.1')).rejects.toBeInstanceOf(SessionError);
  expect(create).not.toHaveBeenCalled();
});

test('sign-in shares registration password-work capacity and rejects saturation', async () => {
  const credential = jest.fn();
  const registration = new RegistrationService({create: async () => ({kind:'existing'})});
  const service = new SessionService({credential, create: async () => new Date(), renew: async () => undefined, revoke: async () => {}}, registration);
  const releaseFirst = registration.acquirePasswordWork();
  const releaseSecond = registration.acquirePasswordWork();
  try {
    await expect(service.signIn({email:'person@example.test',password:'synthetic'}, '127.0.0.1')).rejects.toBeInstanceOf(RegistrationRejection);
    expect(credential).not.toHaveBeenCalled();
  } finally { releaseFirst(); releaseSecond(); }
});

test('sign-in rate limits parsed attempts per peer without account lookup', async () => {
  const credential = jest.fn();
  const registration = new RegistrationService({create: async () => ({kind:'existing'})});
  const service = new SessionService({credential, create: async () => new Date(), renew: async () => undefined, revoke: async () => {}}, registration);
  for (let i = 0; i < 5; i++) await expect(service.signIn({}, '127.0.0.1')).rejects.toBeInstanceOf(SessionError);
  await expect(service.signIn({}, '127.0.0.1')).rejects.toMatchObject({status:429, retryAfter:expect.any(Number)});
  expect(credential).not.toHaveBeenCalled();
});

test('shutdown drains an admitted sign-in until its verifier settles', async () => {
  let finish!: (value: boolean) => void;
  let started!: () => void;
  const verifying = new Promise<void>(resolve => { started = resolve; });
  const wait = new Promise<boolean>(resolve => { finish = resolve; });
  const registration = new RegistrationService({create: async () => ({kind:'existing'})});
  const service = new SessionService({credential: async () => ({accountId:'id',passwordHash:'hash'}), create: async () => new Date(), renew: async () => undefined, revoke: async () => {}}, registration,
    async () => { started(); return wait; });
  const pending = service.signIn({email:'person@example.test',password:'synthetic'}, '127.0.0.1');
  await verifying;
  registration.stop();
  let drained = false;
  const drain = registration.drain().then(() => { drained = true; });
  await Promise.resolve(); expect(drained).toBe(false);
  finish(false);
  await expect(pending).rejects.toBeInstanceOf(SessionError);
  await drain; expect(drained).toBe(true);
});
