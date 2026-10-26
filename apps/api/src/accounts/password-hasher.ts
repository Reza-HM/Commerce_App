import {randomBytes, scrypt} from 'node:crypto';

export const SCRYPT_OPTIONS = Object.freeze({N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024});

export async function hashPassword(normalizedPassword: string): Promise<string> {
  const password = Buffer.from(normalizedPassword.normalize('NFC'), 'utf8');
  const salt = randomBytes(16);
  let key: Buffer | undefined;
  try {
    key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, derived) => error ? reject(error) : resolve(derived));
    });
    return `scrypt$v1$131072$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
  } finally {
    password.fill(0);
    salt.fill(0);
    key?.fill(0);
  }
}
