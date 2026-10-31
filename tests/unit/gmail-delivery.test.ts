import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { connect, type ConnectionOptions } from 'node:tls';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readMailConfiguration,
  SmtpVerificationSender,
  type GmailMailConfiguration,
} from '../../apps/api/src/accounts/mail';

const load = createRequire(resolve('package.json'));
const { tlsCertificate } = load('./tests/fixtures/tls-certificate.cjs');
const { createSmtpCapture, capturedToken } = load('./tests/fixtures/smtp-capture.cjs');
const user = 'synthetic.sender@gmail.com',
  pass = 'abcdefghijklmnop';
const origin = 'http://localhost:3000';
const configuration: GmailMailConfiguration = {
  provider: 'gmail',
  user,
  appPassword: pass,
  webOrigin: origin,
};
let certificate: ReturnType<typeof tlsCertificate>;

test('real recovery acceptance refuses noninteractive setup before any mail or database work', () => {
  for (const extra of [
    {},
    { RECOVERY_ACCEPTANCE_API_PORT: '4310' },
    { RECOVERY_ACCEPTANCE_WEB_DIR: 'apps' },
  ]) {
    const result = spawnSync(process.execPath, ['scripts/accept-gmail-recovery.cjs'], {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        ...extra,
        GMAIL_SMTP_APP_PASSWORD: 'PRIVATE_REFUSAL_MARKER',
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('failed at private setup');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_REFUSAL_MARKER');
  }
});
beforeAll(() => {
  certificate = tlsCertificate();
}, 20000);

test('recovery setup explains App Password configuration failure without exposing input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commerce-recovery-prompt-'));
  const preload = join(dir, 'synthetic-prompt.cjs');
  try {
    writeFileSync(
      preload,
      `require.cache[require.resolve(${JSON.stringify(resolve('scripts/gmail-prompt.cjs'))})] = { exports: {
        gmailEnvironment: async () => ({ MAIL_PROVIDER: 'gmail', GMAIL_SMTP_USER: 'synthetic.sender@gmail.com', GMAIL_SMTP_APP_PASSWORD: 'PRIVATE_REFUSAL_MARKER' })
      } };
      const Module = require('node:module');
      const load = Module._load;
      Module._load = function(request, ...args) {
        if (request === '../apps/api/dist/accounts/mail') return {
          readMailConfiguration() { throw Object.assign(new Error('PRIVATE_REFUSAL_MARKER'), {setting:'GMAIL_SMTP_APP_PASSWORD'}); }
        };
        return load.call(this, request, ...args);
      };`,
    );
    const result = spawnSync(
      process.execPath,
      ['--require', preload, 'scripts/accept-gmail-recovery.cjs'],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('failed at Gmail configuration validation');
    expect(result.stderr).toContain('16-letter Google App Password');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_REFUSAL_MARKER');
    expect(result.stdout + result.stderr).not.toContain('synthetic.sender@gmail.com');
  } finally {
    unlinkSync(preload);
    rmdirSync(dir);
  }
});
afterAll(() => certificate.cleanup());

test('Gmail is default, requires private credentials and rejects unsafe origin/provider inputs', () => {
  const env = {
    NODE_ENV: 'development',
    GMAIL_SMTP_USER: ' Synthetic.Sender@gmail.com ',
    GMAIL_SMTP_APP_PASSWORD: 'abcd efgh ijkl mnop',
    VERIFICATION_WEB_ORIGIN: origin,
  };
  const config = readMailConfiguration(env, [origin]);
  expect(config.provider).toBe('gmail');
  if (config.provider !== 'gmail') throw new Error('Expected Gmail');
  expect(config.user === user).toBe(true);
  expect(config.appPassword === pass).toBe(true);
  for (const extra of [
    { GMAIL_SMTP_USER: undefined },
    { GMAIL_SMTP_APP_PASSWORD: undefined },
    { GMAIL_SMTP_USER: 'attacker@example.test' },
    { GMAIL_SMTP_USER: 'synthetic@gmail.com\r\nBcc:other@example.test' },
    { GMAIL_SMTP_APP_PASSWORD: 'PRIVATE_INVALID_PASSWORD' },
    { MAIL_PROVIDER: 'unknown' },
    { VERIFICATION_WEB_ORIGIN: 'http://public.example.com' },
    { VERIFICATION_WEB_ORIGIN: 'https://private@public.example.com' },
    { VERIFICATION_WEB_ORIGIN: origin + '/path' },
  ]) {
    expect(() => readMailConfiguration({ ...env, ...extra }, [origin])).toThrow(
      'Invalid or missing configuration',
    );
  }
  expect(() => readMailConfiguration({ NODE_ENV: 'development' }, [origin])).toThrow();
  expect(
    readMailConfiguration(
      { ...env, VERIFICATION_WEB_ORIGIN: 'https://app.example.com' },
      ['https://app.example.com'],
    ).provider,
  ).toBe('gmail');
});

test('real SMTP client authenticates only inside verified TLS and preserves message/sender boundaries', async () => {
  const capture = await createSmtpCapture({ tls: certificate, auth: { user, pass } });
  const connectors: ConnectionOptions[] = [];
  try {
    const sender = new SmtpVerificationSender(configuration, (options) => {
      connectors.push(options);
      return connect({
        ...options,
        host: '127.0.0.1',
        port: capture.port,
        ca: certificate.cert,
      });
    });
    const token = randomBytes(32).toString('base64url');
    await sender.send('recipient@example.test', token);
    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      servername: 'smtp.gmail.com',
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
    expect(capture.authenticated).toBe(1);
    expect(capture.messages).toHaveLength(1);
    expect(capturedToken(capture.messages[0]) === token).toBe(true);
    expect(
      capture.messages[0].includes('From: Commerce <synthetic.sender@gmail.com>'),
    ).toBe(true);
    expect(capture.messages[0].includes('To: recipient@example.test')).toBe(true);
    expect(capture.messages[0].includes('Content-Type: multipart/alternative')).toBe(
      true,
    );
    expect(capture.messages[0].includes(pass)).toBe(false);
  } finally {
    await capture.close();
  }
});

test.each(['untrusted-certificate', 'wrong-hostname', 'auth', 'recipient'])(
  'Gmail rejects %s without leaking provider details or delivering a message',
  async (failure) => {
    const capture = await createSmtpCapture({
      tls: certificate,
      auth: { user, pass: failure === 'auth' ? 'wrong-private-value' : pass },
      rejectRecipient: failure === 'recipient',
    });
    try {
      const sender = new SmtpVerificationSender(configuration, (options) =>
        connect({
          ...options,
          host: '127.0.0.1',
          port: capture.port,
          ...(failure === 'untrusted-certificate' ? {} : { ca: certificate.cert }),
          ...(failure === 'wrong-hostname' ? { servername: 'wrong.example.test' } : {}),
        }),
      );
      await expect(
        sender.send('recipient@example.test', randomBytes(32).toString('base64url')),
      ).rejects.toThrow('Mail delivery failed');
      expect(capture.messages).toHaveLength(0);
    } finally {
      await capture.close();
    }
  },
);

test.each(['handshake', 'auth', 'data'])(
  'Gmail total deadline cancels a stalled %s phase',
  async (phase) => {
    const capture = await createSmtpCapture({
      tls: phase === 'handshake' ? undefined : certificate,
      auth: { user, pass },
      stall: phase === 'handshake',
      stallAt: phase,
    });
    try {
      const sender = new SmtpVerificationSender(configuration, (options) =>
        connect({
          ...options,
          host: '127.0.0.1',
          port: capture.port,
          ca: certificate.cert,
        }),
      );
      const start = performance.now();
      await expect(
        sender.send('recipient@example.test', randomBytes(32).toString('base64url')),
      ).rejects.toThrow('Mail delivery failed');
      expect(performance.now() - start).toBeLessThan(6500);
      expect(capture.authenticated).toBe(phase === 'data' ? 1 : 0);
      expect(capture.messages).toHaveLength(phase === 'data' ? 1 : 0);
    } finally {
      await capture.close();
    }
  },
  15000,
);
