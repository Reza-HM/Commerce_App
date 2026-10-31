import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { VerificationRepository } from '@commerce/database';
import { RegistrationAdmission, RegistrationRejection } from './admission';
import type { RegistrationService } from './service';
import { isRegistrationDependencyUnavailable } from './service';
import { dummyCredential } from './sessions';
import { verifyPassword } from './password-hasher';
import { validateSignIn } from './validation';

export interface VerificationSender {
  send(email: string, token: string): Promise<void>;
}
export class VerificationError extends Error {
  constructor(readonly status: 400 | 401) {
    super('Request rejected');
  }
}
export function verificationDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function validVerificationToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, 'base64url').toString('base64url') === token
  );
}
function fields(body: unknown, names: string[]): Record<string, string> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(body))
  )
    throw new VerificationError(400);
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length !== names.length ||
    names.some((name) => !Object.hasOwn(input, name) || typeof input[name] !== 'string')
  )
    throw new VerificationError(400);
  return input as Record<string, string>;
}

export class VerificationService {
  private readonly requests = new RegistrationAdmission();
  private readonly confirmations = new RegistrationAdmission();
  constructor(
    private readonly repository: VerificationRepository,
    private readonly registration: RegistrationService,
    private readonly sender: VerificationSender,
    private readonly event: (name: string) => void = () => {},
    private readonly verify: typeof verifyPassword = verifyPassword,
    private readonly delivery = new RegistrationAdmission(),
  ) {}

  private async db<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isRegistrationDependencyUnavailable(error))
        throw new RegistrationRejection(503, 1);
      throw error;
    }
  }

  private async issue(email: string): Promise<void> {
    const release = this.delivery.acquire();
    let dispatched = false;
    try {
      const token = randomBytes(32).toString('base64url');
      const issued = await this.db(() =>
        this.repository.issue(email, randomUUID(), verificationDigest(token)),
      );
      if (!issued) return;
      // Capacity/drain track this task until the actual SMTP operation settles.
      // No queue, retry, or unhandled detached rejection is created.
      dispatched = true;
      void Promise.resolve()
        .then(() => this.sender.send(email, token))
        .then(
          () => this.event('verification_delivery_accepted'),
          () => this.event('verification_delivery_failed'),
        )
        .finally(release)
        .catch(() => {});
    } finally {
      if (!dispatched) release();
    }
  }

  async initial(email: string): Promise<void> {
    try {
      await this.issue(email);
    } catch {
      this.event('verification_delivery_suppressed');
    }
  }

  async request(body: unknown, peer: string): Promise<void> {
    this.requests.admit(peer);
    let email: string;
    try {
      const input = fields(body, ['email']);
      email = validateSignIn({ email: input.email, password: '' }).emailNormalized;
    } catch {
      throw new VerificationError(400);
    }
    await this.issue(email);
  }

  async confirm(body: unknown, peer: string): Promise<void> {
    this.confirmations.admit(peer);
    let token: string, password: string;
    try {
      const input = fields(body, ['token', 'password']);
      if (!validVerificationToken(input.token)) throw new VerificationError(400);
      token = input.token;
      password = validateSignIn({
        email: 'validation@example.test',
        password: input.password,
      }).passwordNormalized;
    } catch {
      throw new VerificationError(400);
    }
    const release = this.registration.acquirePasswordWork();
    try {
      const digest = verificationDigest(token);
      const proof = await this.db(() => this.repository.lookup(digest));
      const valid = await this.verify(password, proof?.passwordHash ?? dummyCredential);
      if (
        !proof ||
        !valid ||
        !(await this.db(() => this.repository.confirm(digest, proof)))
      )
        throw new VerificationError(401);
    } finally {
      release();
    }
  }
  stop(): void {
    this.requests.stop();
    this.confirmations.stop();
    this.delivery.stop();
  }
  drain(): Promise<void> {
    return this.delivery.drain();
  }
}
