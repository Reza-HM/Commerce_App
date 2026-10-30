import {
  RegistrationValidationError,
  validateRegistration,
} from '../../apps/api/src/accounts/validation';

const password = 'an acceptable test passphrase';
const validate = (body: unknown) => validateRegistration(body, new Set());
function rejected(body: unknown, field: string, code: string) {
  try {
    validate(body);
    throw Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(RegistrationValidationError);
    expect(error).toMatchObject({ field, code });
  }
}

test.each([undefined, null, [], 42, 'body'])(
  'invalid body %p is rejected safely',
  (body) => rejected(body, 'body', 'invalid_body'),
);
test.each([
  'role',
  'isAdmin',
  'emailVerifiedAt',
  'storeApproved',
  '__proto__',
  'PRIVATE_FIELD',
])('extra %s never assigns privilege or echoes the field', (field) => {
  const body = JSON.parse(
    JSON.stringify({ email: 'p@example.com', password }).slice(0, -1) +
      `,"${field}":true}`,
  );
  rejected(body, 'body', 'unexpected_field');
});
test('missing/types and error precedence are deterministic', () => {
  rejected({}, 'email', 'required');
  rejected({ email: 1 }, 'email', 'invalid_type');
  rejected({ email: 'invalid', password: 1 }, 'email', 'invalid_email');
  rejected({ email: 'p@example.com' }, 'password', 'required');
  rejected({ email: 'p@example.com', password: false }, 'password', 'invalid_type');
});
test('ASCII case/outer SP TAB canonicalize without removing aliases', () => {
  expect(validate({ email: ' \tPerson+shop@Example.COM\t ', password })).toEqual({
    emailNormalized: 'person+shop@example.com',
    passwordNormalized: password,
  });
  for (const email of [
    'person@example.com',
    'per.son+shop@example.com',
    "o'hara@xn--bcher-kva.example",
  ])
    expect(validate({ email, password }).emailNormalized).toBe(email);
});
test.each([
  '.a@example.com',
  'a.@example.com',
  'a..b@example.com',
  'a@localhost',
  'a@-example.com',
  'a@example-.com',
  'a@exam_ple.com',
  'a@example.com.',
  'a@[127.0.0.1]',
  '"a"@example.com',
  'a b@example.com',
  'a\tb@example.com',
  '\ra@example.com',
  'a@example.com\n',
  'a@ex\u00e4mple.com',
  '\u212a@example.com',
  'a'.repeat(65) + '@example.com',
  'a@' + 'b'.repeat(64) + '.com',
  'a@' +
    'b'.repeat(63) +
    '.' +
    'c'.repeat(63) +
    '.' +
    'd'.repeat(63) +
    '.' +
    'e'.repeat(63),
  ' '.repeat(1025) + 'a@example.com',
])('email rejects unsupported input %p', (email) =>
  rejected({ email, password }, 'email', 'invalid_email'),
);
test('local/domain and total boundaries accept their maximum values', () => {
  expect(
    validate({ email: 'a'.repeat(64) + '@example.com', password }).emailNormalized,
  ).toHaveLength(76);
  const email =
    'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61);
  expect(email).toHaveLength(254);
  expect(validate({ email, password }).emailNormalized).toBe(email);
  rejected({ email: email + 'd', password }, 'email', 'invalid_email');
});
test.each([14, 15, 128, 129])('normalized code point length %i', (length) => {
  const body = { email: 'p@example.com', password: '\u{1f680}'.repeat(length) };
  if (length === 15 || length === 128)
    expect(validate(body).passwordNormalized).toBe(body.password);
  else rejected(body, 'password', 'password_length');
});
test('NFC is stable while spaces and case remain significant', () => {
  const body = { email: 'p@example.com', password: '  AbC e\u0301 passphrase  ' };
  expect(validate(body).passwordNormalized).toBe('  AbC \u00e9 passphrase  ');
  expect(validate({ ...body, password: '\u00e9'.repeat(15) }).passwordNormalized).toBe(
    '\u00e9'.repeat(15),
  );
});
test.each(['\ud800', '\udfff'])('unpaired surrogate is rejected', (bad) =>
  rejected(
    { email: 'p@example.com', password: password + bad },
    'password',
    'password_encoding',
  ),
);
test('raw byte limit applies before NFC; no truncation or silent repair', () => {
  rejected(
    { email: 'p@example.com', password: 'e\u0301'.repeat(400) },
    'password',
    'password_too_large',
  );
});
test('whole common/contextual matches reject, substrings in passphrases remain allowed', () => {
  const common = new Set(['longlistedpassword']);
  for (const candidate of [
    'LongListedPassword',
    'commerceapp12345',
    'commerce_app12345',
    'commerce-app12345',
    'p@example.invalid',
  ]) {
    expect(() =>
      validateRegistration({ email: 'p@example.invalid', password: candidate }, common),
    ).toThrow(RegistrationValidationError);
  }
  expect(() =>
    validateRegistration(
      { email: 'longlistedpassword@example.invalid', password: 'longlistedpassword' },
      new Set(),
    ),
  ).toThrow(RegistrationValidationError);
  expect(
    validateRegistration(
      { email: 'p@example.com', password: 'prefix longlistedpassword suffix' },
      common,
    ).passwordNormalized,
  ).toBe('prefix longlistedpassword suffix');
});
