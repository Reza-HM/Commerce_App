import { randomBytes, randomUUID } from 'node:crypto';
import type { RecoveryRepository } from '@commerce/database';
import { RegistrationAdmission, RegistrationRejection } from './admission';
import { hashPassword } from './password-hasher';
import { isRegistrationDependencyUnavailable, type RegistrationService } from './service';
import {
  RegistrationValidationError,
  validateEmail,
  type RegistrationCode,
} from './validation';
import { validVerificationToken, verificationDigest } from './verification';

export interface RecoverySender {
  sendRecovery(email: string, token: string): Promise<void>;
  notifyReset(email: string): Promise<void>;
}
export class RecoveryError extends Error {
  constructor(
    readonly status: 400 | 401,
    readonly code?: RegistrationCode,
  ) {
    super('Request rejected');
  }
}
function fields(body: unknown, names: string[]): Record<string, string> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(body))
  )
    throw new RecoveryError(400);
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length !== names.length ||
    names.some((name) => !Object.hasOwn(input, name) || typeof input[name] !== 'string')
  )
    throw new RecoveryError(400);
  return input as Record<string, string>;
}

export class RecoveryService {
  private readonly requests = new RegistrationAdmission();
  private readonly confirmations = new RegistrationAdmission();
  constructor(
    private readonly repository: RecoveryRepository,
    private readonly registration: RegistrationService,
    private readonly sender: RecoverySender,
    private readonly event: (name: string) => void = () => {},
    private readonly delivery = new RegistrationAdmission(),
    private readonly hash: typeof hashPassword = hashPassword,
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
  private screen(password: string, email?: string): string {
    try {
      return this.registration.screenNewPassword(password, email);
    } catch (error) {
      if (error instanceof RegistrationValidationError)
        throw new RecoveryError(400, error.code);
      throw error;
    }
  }
  private dispatch(
    work: () => Promise<void>,
    release: () => void,
    purpose: 'recovery' | 'reset_notification',
  ): void {
    void Promise.resolve()
      .then(work)
      .then(
        () => this.event(`${purpose}_delivery_accepted`),
        () => this.event(`${purpose}_delivery_failed`),
      )
      .finally(release)
      .catch(() => {});
  }
  async request(body: unknown, peer: string): Promise<void> {
    this.requests.admit(peer);
    let email: string;
    try {
      email = validateEmail(fields(body, ['email']).email!);
    } catch {
      throw new RecoveryError(400);
    }
    const release = this.delivery.acquire();
    let dispatched = false;
    try {
      const token = randomBytes(32).toString('base64url');
      const issued = await this.db(() =>
        this.repository.issue(email, randomUUID(), verificationDigest(token)),
      );
      if (!issued) return;
      dispatched = true;
      this.dispatch(() => this.sender.sendRecovery(email, token), release, 'recovery');
    } finally {
      if (!dispatched) release();
    }
  }
  async confirm(body: unknown, peer: string): Promise<void> {
    this.confirmations.admit(peer);
    const input = fields(body, ['token', 'password']);
    if (!validVerificationToken(input.token)) throw new RecoveryError(400);
    const token = input.token;
    const password = this.screen(input.password!);
    const release = this.registration.acquirePasswordWork();
    try {
      const digest = verificationDigest(token);
      const proof = await this.db(() => this.repository.lookup(digest));
      if (!proof) throw new RecoveryError(401);
      this.screen(password, proof.emailNormalized);
      const passwordHash = await this.hash(password);
      if (!(await this.db(() => this.repository.confirm(digest, proof, passwordHash))))
        throw new RecoveryError(401);
      // The committed reset is authoritative even if notification cannot start.
      try {
        const releaseMail = this.delivery.acquire();
        this.dispatch(
          () => this.sender.notifyReset(proof.emailNormalized),
          releaseMail,
          'reset_notification',
        );
      } catch {
        this.event('reset_notification_delivery_suppressed');
      }
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
