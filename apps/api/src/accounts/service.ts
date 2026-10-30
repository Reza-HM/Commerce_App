import { randomUUID } from 'node:crypto';
import type { AccountRegistrationRepository } from '@commerce/database';
import { RegistrationAdmission, RegistrationRejection } from './admission';
import { hashPassword } from './password-hasher';
import { loadCommonPasswords } from './password-policy';
import { validateRegistration } from './validation';

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
}

export class RegistrationService {
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
  }

  async register(body: unknown, directPeer: string): Promise<void> {
    this.admission.admit(directPeer);
    const input = validateRegistration(body, this.commonPasswords);
    const release = this.admission.acquire();
    try {
      const passwordHash = await this.hash(input.passwordNormalized);
      try {
        await this.repository.create({
          id: this.uuid(),
          emailNormalized: input.emailNormalized,
          passwordHash,
        });
      } catch (error) {
        if (isRegistrationDependencyUnavailable(error))
          throw new RegistrationRejection(503, 1);
        throw error;
      }
    } finally {
      release();
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
}
