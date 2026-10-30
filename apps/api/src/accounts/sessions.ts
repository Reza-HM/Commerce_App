import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SessionRepository } from '@commerce/database';
import { RegistrationAdmission, RegistrationRejection } from './admission';
import { isRegistrationDependencyUnavailable, type RegistrationService } from './service';
import { verifyPassword } from './password-hasher';
import { validateSignIn } from './validation';

// Public synthetic credential; no account can authenticate with it.
const dummy =
  'scrypt$v1$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$bQbiN6Mfr3bkb6DjqTR2YqlqvN6gIv46C4kOjUaCecWcmJBpjLd-HbIAXvxRBqVJEau1alORl5tYpMxyV8OF2Q';
export class SessionError extends Error {
  constructor(readonly status: 400 | 401 | 403) {
    super('Request rejected');
  }
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function sessionToken(cookie: string | undefined): string | undefined {
  const entries = (cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('__Host-commerce_session='));
  if (entries.length !== 1) return undefined;
  const token = entries[0]!.slice('__Host-commerce_session='.length);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    Buffer.from(token, 'base64url').length !== 32 ||
    Buffer.from(token, 'base64url').toString('base64url') !== token
  )
    return undefined;
  return token;
}

export class SessionService {
  private readonly peers = new RegistrationAdmission();
  constructor(
    private readonly repository: SessionRepository,
    private readonly registration: RegistrationService,
    private readonly verify: typeof verifyPassword = verifyPassword,
  ) {}
  private async db<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isRegistrationDependencyUnavailable(error))
        throw new RegistrationRejection(503, 1);
      throw error;
    }
  }
  async signIn(body: unknown, peer: string): Promise<{ token: string; expires: Date }> {
    this.peers.admit(peer);
    let input: ReturnType<typeof validateSignIn>;
    try {
      input = validateSignIn(body);
    } catch {
      throw new SessionError(400);
    }
    const release = this.registration.acquirePasswordWork();
    try {
      const credential = await this.db(() =>
        this.repository.credential(input.emailNormalized),
      );
      const valid = await this.verify(
        input.passwordNormalized,
        credential?.passwordHash ?? dummy,
      );
      if (!credential || !valid) throw new SessionError(401);
      const token = randomBytes(32).toString('base64url');
      const expires = await this.db(() =>
        this.repository.create(randomUUID(), credential.accountId, digest(token)),
      );
      return { token, expires };
    } finally {
      release();
    }
  }
  async current(token: string | undefined): Promise<string> {
    if (!token) throw new SessionError(401);
    const id = await this.db(() => this.repository.renew(digest(token)));
    if (!id) throw new SessionError(401);
    return id;
  }
  async signOut(token: string | undefined): Promise<void> {
    if (token) await this.db(() => this.repository.revoke(digest(token)));
  }
}
