import { test as base, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { NewAccount } from '../../packages/database/src/accounts';
import type { SessionRepository } from '../../packages/database/src/sessions';
import type { VerificationRepository } from '../../packages/database/src/email-verifications';
import type { Page } from '@playwright/test';

const load = createRequire(resolve('package.json'));
const { createRuntime } = load(
  './apps/api/dist/runtime.js',
) as typeof import('../../apps/api/src/runtime');
const { readApiConfiguration } = load(
  './apps/api/dist/configuration.js',
) as typeof import('../../apps/api/src/configuration');
const { RegistrationService } = load(
  './apps/api/dist/accounts/service.js',
) as typeof import('../../apps/api/src/accounts/service');
const { SessionService } = load(
  './apps/api/dist/accounts/sessions.js',
) as typeof import('../../apps/api/src/accounts/sessions');
const { VerificationService } = load(
  './apps/api/dist/accounts/verification.js',
) as typeof import('../../apps/api/src/accounts/verification');
const { LocalVerificationSender } = load(
  './apps/api/dist/accounts/mail.js',
) as typeof import('../../apps/api/src/accounts/mail');
const { createSmtpCapture, capturedToken } = load('./tests/fixtures/smtp-capture.cjs');

export type Fixture = {
  expire: () => void;
  expireChallenges: () => void;
  failRevocation: (fail: boolean) => void;
  logs: string[];
  counts: { current: number; signOut: number };
  verificationLink(): Promise<string>;
};
export async function confirmEmail(page: Page, api: Fixture, password: string) {
  await page.goto(await api.verificationLink());
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Confirm email address', exact: true }).click();
  await expect(page.getByText('Your email is confirmed', { exact: true })).toBeVisible();
}
export const test = base.extend<{ api: Fixture }>({
  api: [
    async ({ page }, use) => {
      void page;
      const accounts = new Map<string, NewAccount>();
      const verified = new Set<string>();
      const challenges = new Map<
        string,
        { accountId: string; passwordHash: string; issued: number }
      >();
      const capture = await createSmtpCapture();
      const sessions = new Map<string, string>();
      const logs: string[] = [];
      const counts = { current: 0, signOut: 0 };
      let revocationFails = false;
      const registration = new RegistrationService({
        create: async (account) => {
          if (accounts.has(account.emailNormalized)) return { kind: 'existing' };
          accounts.set(account.emailNormalized, account);
          return { kind: 'created', id: account.id };
        },
      });
      const repository: SessionRepository = {
        credential: async (email) => {
          const account = accounts.get(email);
          return account
            ? {
                accountId: account.id,
                passwordHash: account.passwordHash,
                emailVerified: verified.has(account.id),
              }
            : undefined;
        },
        create: async (_id, accountId, digest) => {
          if (!verified.has(accountId)) return undefined;
          sessions.set(digest, accountId);
          return new Date(Date.now() + 12 * 3600000);
        },
        renew: async (digest) => {
          counts.current++;
          return sessions.get(digest);
        },
        revoke: async (digest) => {
          counts.signOut++;
          if (revocationFails)
            throw Object.assign(new Error('fixture unavailable'), {
              code: 'ECONNREFUSED',
            });
          sessions.delete(digest);
        },
      };
      const localDefaults = process.env.LOCAL_DEFAULT_TEST === '1';
      const origins = localDefaults ? 'http://localhost:4183' : 'http://127.0.0.1:4173';
      const verificationRepository: VerificationRepository = {
        issue: async (email, _id, digest) => {
          const account = accounts.get(email);
          if (!account || verified.has(account.id)) return false;
          const existing = [...challenges.values()].filter(
            (entry) =>
              entry.accountId === account.id && entry.issued + 1800000 > Date.now(),
          );
          if (
            existing.length >= 3 ||
            existing.some((entry) => entry.issued + 60000 > Date.now())
          )
            return false;
          challenges.set(digest, {
            accountId: account.id,
            passwordHash: account.passwordHash,
            issued: Date.now(),
          });
          return true;
        },
        lookup: async (digest) => {
          const value = challenges.get(digest);
          return value &&
            !verified.has(value.accountId) &&
            value.issued + 1800000 > Date.now()
            ? value
            : undefined;
        },
        confirm: async (digest, proof) => {
          const value = challenges.get(digest);
          if (
            !value ||
            verified.has(value.accountId) ||
            value.issued + 1800000 <= Date.now() ||
            value.accountId !== proof.accountId ||
            value.passwordHash !== proof.passwordHash
          )
            return false;
          verified.add(value.accountId);
          for (const [key, challenge] of challenges)
            if (challenge.accountId === value.accountId) challenges.delete(key);
          for (const [key, accountId] of sessions)
            if (accountId === value.accountId) sessions.delete(key);
          return true;
        },
      };
      const verification = new VerificationService(
        verificationRepository,
        registration,
        new LocalVerificationSender({
          host: '127.0.0.1',
          port: capture.port,
          webOrigin: origins,
        }),
      );
      registration.setVerification(verification);
      const config = readApiConfiguration({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://fixture:synthetic@127.0.0.1/test',
        WEB_ORIGINS: origins,
      });
      const runtime = await createRuntime(
        config,
        { ready: async () => true, close: async () => {} },
        (event) => logs.push(JSON.stringify(event)),
        registration,
        new SessionService(repository, registration),
        verification,
      );
      try {
        // Bind explicitly; a collision fails rather than reusing an unknown process.
        await runtime.listen(localDefaults ? 4184 : 4174);
        await use({
          expire: () => sessions.clear(),
          expireChallenges: () => {
            for (const value of challenges.values()) value.issued = Date.now() - 1800000;
          },
          failRevocation: (fail) => {
            revocationFails = fail;
          },
          logs,
          counts,
          verificationLink: async () => {
            await expect.poll(() => capture.messages.length).toBeGreaterThan(0);
            const token = capturedToken(capture.messages.at(-1));
            expect(!!token).toBe(true);
            return origins + '/verify-email#token=' + token;
          },
        });
      } finally {
        expect(await runtime.close()).toBe(0);
        await capture.close();
      }
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';
