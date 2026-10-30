import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const SCRYPT_OPTIONS = Object.freeze({
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 192 * 1024 * 1024,
});

export async function hashPassword(normalizedPassword: string): Promise<string> {
  const password = Buffer.from(normalizedPassword.normalize('NFC'), 'utf8');
  const salt = randomBytes(16);
  let key: Buffer | undefined;
  try {
    key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, derived) =>
        error ? reject(error) : resolve(derived),
      );
    });
    return `scrypt$v1$131072$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
  } finally {
    password.fill(0);
    salt.fill(0);
    key?.fill(0);
  }
}

export async function verifyPassword(
  normalizedPassword: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split('$');
  if (
    parts.length !== 7 ||
    parts.slice(0, 5).join('$') !== 'scrypt$v1$131072$8$1' ||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[5] ?? '') ||
    !/^[A-Za-z0-9_-]{86}$/.test(parts[6] ?? '')
  )
    throw new Error('Invalid credential');
  const salt = Buffer.from(parts[5]!, 'base64url');
  const expected = Buffer.from(parts[6]!, 'base64url');
  if (
    salt.length !== 16 ||
    expected.length !== 64 ||
    salt.toString('base64url') !== parts[5] ||
    expected.toString('base64url') !== parts[6]
  )
    throw new Error('Invalid credential');
  const password = Buffer.from(normalizedPassword.normalize('NFC'), 'utf8');
  let key: Buffer | undefined;
  try {
    key = await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, derived) =>
        error ? reject(error) : resolve(derived),
      ),
    );
    return timingSafeEqual(key, expected);
  } finally {
    password.fill(0);
    salt.fill(0);
    expected.fill(0);
    key?.fill(0);
  }
}
