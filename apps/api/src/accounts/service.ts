import { randomUUID } from 'node:crypto';
import type { AccountRegistrationRepository } from '@commerce/database';
import { RegistrationAdmission, RegistrationRejection } from './admission';
import { hashPassword } from './password-hasher';
import { loadCommonPasswords } from './password-policy';
import { validateNewPassword, validateRegistration } from './validation';

const temporaryCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '57014',
  '42P01',
]);
const temporaryMessages = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Query read timeout',
]);

export function isRegistrationDependencyUnavailable(error: unknown): boolean {
  for (let depth = 0; depth < 5 && error && typeof error === 'object'; depth++) {
    const value = error as { code?: unknown; message?: unknown; cause?: unknown };
    if (
      typeof value.code === 'string' &&
      (temporaryCodes.has(value.code) || /^08[0-9A-Z]{3}$/.test(value.code))
    )
      return true;
    if (typeof value.message === 'string' && temporaryMessages.has(value.message))
      return true;
    error = value.cause;
  }
  return false;
}

export interface RegistrationOptions {
  readonly hash?: (password: string) => Promise<string>;
  readonly commonPasswords?: ReadonlySet<string>;
  readonly now?: () => number;
  readonly uuid?: () => string;
  readonly verification?: { initial(email: string): Promise<void> };
}

export class RegistrationService {
  private verification: RegistrationOptions['verification'];
  private readonly admission: RegistrationAdmission;
  private readonly commonPasswords: ReadonlySet<string>;
  private readonly hash: (password: string) => Promise<string>;
  private readonly uuid: () => string;

  constructor(
    private readonly repository: AccountRegistrationRepository,
    options: RegistrationOptions = {},
  ) {
    this.commonPasswords = options.commonPasswords ?? loadCommonPasswords();
    this.admission = new RegistrationAdmission(options.now);
    this.hash = options.hash ?? hashPassword;
    this.uuid = options.uuid ?? randomUUID;
    this.verification = options.verification;
  }

  setVerification(verification: NonNullable<RegistrationOptions['verification']>): void {
    this.verification = verification;
  }

  async register(body: unknown, directPeer: string): Promise<void> {
    this.admission.admit(directPeer);
    const input = validateRegistration(body, this.commonPasswords);
    const release = this.admission.acquire();
    let created = false;
    try {
      const passwordHash = await this.hash(input.passwordNormalized);
      try {
        const result = await this.repository.create({
          id: this.uuid(),
          emailNormalized: input.emailNormalized,
          passwordHash,
        });
        created = result.kind === 'created';
      } catch (error) {
        if (isRegistrationDependencyUnavailable(error))
          throw new RegistrationRejection(503, 1);
        throw error;
      }
    } finally {
      release();
    }
    if (created && this.verification) {
      // The account has committed. Mail preparation cannot change its public
      // acceptance or invite callers to retry registration to replace a password.
      try {
        await this.verification.initial(input.emailNormalized);
      } catch {}
    }
  }

  stop(): void {
    this.admission.stop();
  }
  drain(): Promise<void> {
    return this.admission.drain();
  }
  acquirePasswordWork(): () => void {
    return this.admission.acquire();
  }
  screenNewPassword(password: string, email?: string): string {
    return validateNewPassword(password, this.commonPasswords, email);
  }
}
