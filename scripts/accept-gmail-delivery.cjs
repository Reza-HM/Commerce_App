// Explicit operator-only real-send acceptance. Never invoked by tests or CI.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const { gmailEnvironment, question } = require('./gmail-prompt.cjs');
const { commandEnvironment } = require('./database-environment.cjs');
const { createGuardedDatabase } = require('./integration-support.cjs');
const { OwnedAccounts } = require('./integration-accounts.cjs');
const {
  PostgresVerificationRepository,
  PostgresSessionRepository,
} = require('@commerce/database');
const {
  readMailConfiguration,
  SmtpVerificationSender,
} = require('../apps/api/dist/accounts/mail');
const { RegistrationService } = require('../apps/api/dist/accounts/service');
const { VerificationService } = require('../apps/api/dist/accounts/verification');
const { SessionService } = require('../apps/api/dist/accounts/sessions');
const { createRuntime } = require('../apps/api/dist/runtime');
const { readApiConfiguration } = require('../apps/api/dist/configuration');

let phase = 'private setup';
(async () => {
  const environment = await gmailEnvironment();
  const recipient =
    (await question('Acceptance recipient (Enter uses sender): ')).trim() ||
    environment.GMAIL_SMTP_USER;
  const origin = 'http://127.0.0.1:4310';
  environment.VERIFICATION_WEB_ORIGIN = origin;
  const mail = readMailConfiguration(environment, [origin]);
  process.stdout.write(
    'This command sends one real verification email, uses only the guarded test database, and requires free ports 4310/3001 plus an existing npm run build.\n',
  );
  if (
    (await question('Send the real email and run acceptance? Type yes: '))
      .trim()
      .toLowerCase() !== 'yes'
  )
    throw new Error('Acceptance cancelled');
  const env = commandEnvironment('test:integration', environment);
  const database = createGuardedDatabase(env),
    accounts = new OwnedAccounts(database);
  const id = randomUUID(),
    password = randomBytes(32).toString('base64url');
  let runtime, web, browser;
  let accepted = false;
  let evidence;
  const publicEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      [
        'PATH',
        'Path',
        'SystemRoot',
        'COMSPEC',
        'TEMP',
        'TMP',
        'USERPROFILE',
        'LOCALAPPDATA',
        'APPDATA',
      ].includes(name),
    ),
  );
  try {
    phase = 'guarded preflight';
    await database.transaction(async (client) => {
      await client.query('SELECT id FROM account_email_verifications LIMIT 0');
      await client.query('SELECT id FROM account_sessions LIMIT 0');
    });
    const registration = new RegistrationService(accounts, { uuid: () => id });
    const verification = new VerificationService(
      new PostgresVerificationRepository(database),
      registration,
      new SmtpVerificationSender(mail),
      (event) => {
        if (event === 'verification_delivery_accepted') accepted = true;
      },
    );
    registration.setVerification(verification);
    runtime = await createRuntime(
      readApiConfiguration({ ...env, API_PORT: '3001', WEB_ORIGINS: origin }),
      { ready: () => database.ready(), close: async () => {} },
      () => {},
      registration,
      new SessionService(new PostgresSessionRepository(database), registration),
      verification,
    );
    await runtime.listen(3001);
    phase = 'owned web startup';
    let webReady = false,
      webOutput = '';
    web = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'start',
        'apps/web',
        '-H',
        '127.0.0.1',
        '-p',
        '4310',
      ],
      {
        env: { ...publicEnv, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    for (const stream of [web.stdout, web.stderr])
      stream.on('data', (chunk) => {
        webOutput = (webOutput + chunk.toString()).slice(-4096);
        if (webOutput.includes('Ready in')) webReady = true;
      });
    web.on('error', () => {});
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (web.exitCode !== null || web.signalCode !== null)
        throw new Error('Owned web failed');
      try {
        if (webReady && (await fetch(origin)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!ready) throw new Error('Owned web not ready');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(),
      page = await context.newPage();
    phase = 'real registration and SMTP';
    await page.goto(origin + '/register');
    await page.getByLabel('Email address', { exact: true }).fill(recipient);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByText('Registration request processed.', { exact: true }).waitFor();
    await verification.drain();
    if (!accepted || accounts.records.get(id) !== 'confirmed')
      throw new Error('Delivery not accepted or recipient already registered');
    phase = 'real inbox receipt';
    process.stdout.write(
      'Google accepted the message. This alone does not prove receipt. Open the designated recipient Inbox (also check Spam), not the Sent copy.\n',
    );
    if (
      (await question('Has the verification message arrived in that Inbox? Type yes: '))
        .trim()
        .toLowerCase() !== 'yes'
    )
      throw new Error('Receipt not confirmed');
    let link = (
      await question(
        'Copy the confirmation link from the received email (paste hidden): ',
        { secret: true },
      )
    ).trim();
    const url = new URL(link);
    if (
      url.origin !== origin ||
      url.pathname !== '/verify-email' ||
      url.search ||
      !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash)
    )
      throw new Error('Unexpected verification link');
    phase = 'received-link confirmation';
    await page.goto(link);
    link = '';
    await page.getByLabel('Password', { exact: true }).waitFor();
    assert.equal(page.url(), origin + '/verify-email');
    assert.equal(
      (await context.cookies()).some(
        (cookie) => cookie.name === '__Host-commerce_session',
      ),
      false,
    );
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Confirm email address', exact: true })
      .click();
    await page.getByText('Your email is confirmed', { exact: true }).waitFor();
    assert.equal(
      (await context.cookies()).some(
        (cookie) => cookie.name === '__Host-commerce_session',
      ),
      false,
    );
    phase = 'explicit sign-in and sign-out';
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill(recipient);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('You’re signed in', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByText('You’re signed out.', { exact: true }).waitFor();
    evidence = {
      date: new Date().toISOString(),
      provider: 'gmail',
      smtpAccepted: true,
      inboxReceipt: 'operator-confirmed',
      receivedLinkConfirmed: true,
      noAutomaticSession: true,
      explicitSignIn: true,
      signOut: true,
      database: 'guarded-test-target',
      ownedCleanup: true,
    };
  } finally {
    let failed = false;
    const cleanup = [
      async () => {
        if (browser) await browser.close();
      },
      async () => {
        if (web && web.exitCode === null && web.signalCode === null) {
          const exited = once(web, 'exit');
          web.kill();
          await exited;
        }
      },
      async () => {
        if (runtime) assert.equal(await runtime.close(), 0);
      },
      async () => {
        if (accounts.records.get(id) === 'confirmed') {
          for (const table of ['account_email_verifications', 'account_sessions']) {
            const rows = await database.transaction((client) =>
              client.query(`SELECT id FROM ${table} WHERE account_id=$1`, [id]),
            );
            for (const row of rows.rows)
              await database.transaction((client) =>
                client.query(`DELETE FROM ${table} WHERE id=$1 AND account_id=$2`, [
                  row.id,
                  id,
                ]),
              );
          }
        }
        await accounts.cleanup();
      },
      () => database.close(),
    ];
    for (const work of cleanup) {
      try {
        await work();
      } catch {
        failed = true;
      }
    }
    delete environment.GMAIL_SMTP_APP_PASSWORD;
    delete env.GMAIL_SMTP_APP_PASSWORD;
    if (failed) {
      phase = 'owned cleanup';
      throw new Error('Acceptance cleanup requires review');
    }
  }
  mkdirSync(resolve('.local'), { recursive: true });
  const report = resolve('.local', `gmail-acceptance-${randomUUID()}.json`);
  writeFileSync(report, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(evidence));
  console.log(
    'Safe acceptance report saved under .local/ (no addresses, credentials or links).',
  );
})().catch(() => {
  console.error(
    `Gmail acceptance failed at ${phase}; sensitive diagnostics suppressed. The real-delivery gate remains incomplete.`,
  );
  process.exitCode = 1;
});
