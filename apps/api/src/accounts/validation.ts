export type RegistrationField = 'body' | 'email' | 'password';
export type RegistrationCode = 'required' | 'invalid_type' | 'invalid_body' | 'unexpected_field' |
  'invalid_email' | 'password_encoding' | 'password_too_large' | 'password_length' | 'password_blocklisted';

export class RegistrationValidationError extends Error {
  constructor(readonly field: RegistrationField, readonly code: RegistrationCode) {
    super('Invalid registration request');
  }
}

const localPart = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const servicePasswords = new Set(['commerceapp12345', 'commerce_app12345', 'commerce-app12345']);

export function validateRegistration(body: unknown, commonPasswords: ReadonlySet<string>) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(body))) {
    throw new RegistrationValidationError('body', 'invalid_body');
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== 'email' && key !== 'password')) {
    throw new RegistrationValidationError('body', 'unexpected_field');
  }
  if (!Object.hasOwn(input, 'email')) throw new RegistrationValidationError('email', 'required');
  if (typeof input.email !== 'string') throw new RegistrationValidationError('email', 'invalid_type');
  const rawEmail = input.email;
  if (Buffer.byteLength(rawEmail, 'utf8') > 1024 || /[^\x20-\x7e\t]/.test(rawEmail)) {
    throw new RegistrationValidationError('email', 'invalid_email');
  }
  const emailNormalized = rawEmail.replace(/^[ \t]+|[ \t]+$/g, '').toLowerCase();
  const parts = emailNormalized.split('@');
  const local = parts[0] ?? '';
  const labels = (parts[1] ?? '').split('.');
  if (parts.length !== 2 || local.length > 64 || !localPart.test(local) || emailNormalized.length > 254 ||
    labels.length < 2 || !labels.every(label => domainLabel.test(label))) {
    throw new RegistrationValidationError('email', 'invalid_email');
  }
  if (!Object.hasOwn(input, 'password')) throw new RegistrationValidationError('password', 'required');
  if (typeof input.password !== 'string') throw new RegistrationValidationError('password', 'invalid_type');
  const rawPassword = input.password;
  for (const scalar of rawPassword) {
    const point = scalar.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) throw new RegistrationValidationError('password', 'password_encoding');
  }
  if (Buffer.byteLength(rawPassword, 'utf8') > 1024) throw new RegistrationValidationError('password', 'password_too_large');
  const passwordNormalized = rawPassword.normalize('NFC');
  const length = Array.from(passwordNormalized).length;
  if (length < 15 || length > 128) throw new RegistrationValidationError('password', 'password_length');
  const screened = passwordNormalized.toLowerCase();
  if (commonPasswords.has(screened) || servicePasswords.has(screened) || screened === emailNormalized || screened === local) {
    throw new RegistrationValidationError('password', 'password_blocklisted');
  }
  return {emailNormalized, passwordNormalized};
}
