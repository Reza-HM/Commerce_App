// Explicit operator-only real-send acceptance; never invoked by ordinary tests or CI.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { resolve, relative, isAbsolute } = require('node:path');
const { mkdirSync, writeFileSync, realpathSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const { gmailEnvironment, question } = require('./gmail-prompt.cjs');
const { commandEnvironment } = require('./database-environment.cjs');
const { createGuardedDatabase } = require('./integration-support.cjs');
const { OwnedAccounts } = require('./integration-accounts.cjs');
const {
  PostgresRecoveryRepository,
  PostgresSessionRepository,
} = require('@commerce/database');
const {
  readMailConfiguration,
  SmtpAccountSender,
} = require('../apps/api/dist/accounts/mail');
const { RegistrationService } = require('../apps/api/dist/accounts/service');
const { RecoveryService } = require('../apps/api/dist/accounts/recovery');
const { SessionService } = require('../apps/api/dist/accounts/sessions');
const { hashPassword } = require('../apps/api/dist/accounts/password-hasher');
const { validVerificationToken } = require('../apps/api/dist/accounts/verification');
const { createRuntime } = require('../apps/api/dist/runtime');
const { readApiConfiguration } = require('../apps/api/dist/configuration');

let phase = 'private setup';
(async () => {
  const apiPort = Number(process.env.RECOVERY_ACCEPTANCE_API_PORT ?? '3001');
  if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535 || apiPort === 4310)
    throw new Error('Invalid acceptance port');
  const webDir = process.env.RECOVERY_ACCEPTANCE_WEB_DIR ?? 'apps/web';
  if (webDir !== 'apps/web') {
    const webRelative = relative(
      realpathSync(resolve('.local')),
      realpathSync(resolve(webDir)),
    );
    if (!webRelative || webRelative.startsWith('..') || isAbsolute(webRelative))
      throw new Error('Invalid owned acceptance build');
  }
  const environment = await gmailEnvironment();
  const recipient = environment.GMAIL_SMTP_USER;
  const origin = 'http://127.0.0.1:4310';
  environment.VERIFICATION_WEB_ORIGIN = origin;
  const mail = readMailConfiguration(environment, [origin]);
  process.stdout.write(
    'This sends one real recovery link and one reset notification to the Gmail sender Inbox. It uses only exact-owned guarded test fixtures, free web port 4310, and a build matching the selected API port.\n',
  );
  if (
    (await question('Run real recovery acceptance? Type yes: ')).trim().toLowerCase() !==
    'yes'
  )
    throw new Error('Cancelled');
  const env = commandEnvironment('test:integration', environment);
  const database = createGuardedDatabase(env),
    accounts = new OwnedAccounts(database);
  const id = randomUUID(),
    oldPassword = randomBytes(32).toString('base64url'),
    password = randomBytes(32).toString('base64url');
  let runtime, web, browser, evidence;
  let recoveryAccepted = false,
    notificationAccepted = false;
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
      for (const table of [
        'account_password_recoveries',
        'account_email_verifications',
        'account_sessions',
      ])
        await client.query(`SELECT id FROM ${table} LIMIT 0`);
    });
    // A verified test-owned fixture isolates recovery from registration/verification mail.
    const result = await accounts.create({
      id,
      emailNormalized: mail.user,
      passwordHash: await hashPassword(oldPassword),
    });
    assert.equal(result.kind, 'created', 'Recipient already exists on the test target');
    await database.transaction((client) =>
      client.query(
        'UPDATE accounts SET email_verified_at = clock_timestamp() WHERE id = $1',
        [id],
      ),
    );
    const registration = new RegistrationService(accounts);
    const recovery = new RecoveryService(
      new PostgresRecoveryRepository(database),
      registration,
      new SmtpAccountSender(mail),
      (event) => {
        if (event === 'recovery_delivery_accepted') recoveryAccepted = true;
        if (event === 'reset_notification_delivery_accepted') notificationAccepted = true;
      },
    );
    runtime = await createRuntime(
      readApiConfiguration({ ...env, API_PORT: String(apiPort), WEB_ORIGINS: origin }),
      { ready: () => database.ready(), close: async () => {} },
      () => {},
      registration,
      new SessionService(new PostgresSessionRepository(database), registration),
      undefined,
      recovery,
    );
    await runtime.listen(apiPort);
    phase = 'owned web startup';
    let webReady = false,
      webOutput = '';
    web = spawn(
      process.execPath,
      [
        resolve('node_modules/next/dist/bin/next'),
        'start',
        '-H',
        '127.0.0.1',
        '-p',
        '4310',
      ],
      {
        cwd: resolve(webDir),
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
    const signIn = async (value) => {
      await page.goto(origin + '/sign-in');
      await page.getByLabel('Email address', { exact: true }).fill(recipient);
      await page.getByLabel('Password', { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    phase = 'pre-reset sign-in';
    await signIn(oldPassword);
    await page.getByText('You’re signed in', { exact: true }).waitFor();
    const oldCookie = (await context.cookies()).find(
      (cookie) => cookie.name === '__Host-commerce_session',
    ).value;
    phase = 'recovery request and SMTP';
    await page.goto(origin + '/forgot-password');
    await page.getByLabel('Email address', { exact: true }).fill(recipient);
    await page.getByRole('button', { name: 'Request reset link', exact: true }).click();
    await page
      .getByText('Password recovery request processed.', { exact: true })
      .waitFor();
    await recovery.drain();
    assert.equal(recoveryAccepted, true);
    phase = 'recovery inbox receipt';
    process.stdout.write(
      'SMTP acceptance is not receipt proof. Open the sender Inbox (also check Spam), not its Sent copy.\n',
    );
    if (
      (await question('Did the recovery message arrive in that Inbox? Type yes: '))
        .trim()
        .toLowerCase() !== 'yes'
    )
      throw new Error('Receipt unconfirmed');
    let link = (
      await question('Paste the reset link from the received email (hidden): ', {
        secret: true,
      })
    ).trim();
    const url = new URL(link);
    if (
      url.origin !== origin ||
      url.pathname !== '/reset-password' ||
      url.search ||
      !url.hash.startsWith('#token=') ||
      !validVerificationToken(url.hash.slice(7))
    )
      throw new Error('Unexpected reset link');
    phase = 'received-link password reset';
    await page.goto(link);
    link = '';
    await page.getByLabel('New password', { exact: true }).waitFor();
    assert.equal(page.url(), origin + '/reset-password');
    await page.getByLabel('New password', { exact: true }).fill(password);
    await page.getByLabel('Confirm new password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await page.getByText('Your password is updated', { exact: true }).waitFor();
    assert.equal(
      (await context.cookies()).find(
        (cookie) => cookie.name === '__Host-commerce_session',
      ).value,
      oldCookie,
      'Recovery issued a new session',
    );
    await recovery.drain();
    assert.equal(notificationAccepted, true);
    phase = 'notification inbox receipt';
    if (
      (
        await question(
          'Did the password-reset notification arrive in the Inbox? Type yes: ',
        )
      )
        .trim()
        .toLowerCase() !== 'yes'
    )
      throw new Error('Notification receipt unconfirmed');
    phase = 'old access rejection and explicit new sign-in';
    await page.goto(origin + '/account');
    await page.waitForURL('**/sign-in?reason=session-required');
    await signIn(oldPassword);
    await page
      .getByRole('alert')
      .filter({ hasText: 'The email or password is incorrect.' })
      .waitFor();
    await signIn(password);
    await page.getByText('You’re signed in', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByText('You’re signed out.', { exact: true }).waitFor();
    evidence = {
      date: new Date().toISOString(),
      provider: 'gmail',
      recoverySmtpAccepted: true,
      recoveryInboxReceipt: 'operator-confirmed',
      receivedLinkReset: true,
      notificationInboxReceipt: 'operator-confirmed',
      noAutomaticSession: true,
      oldPasswordRejected: true,
      oldSessionRejected: true,
      explicitNewSignIn: true,
      signOut: true,
      database: 'guarded-test-target',
      ownedCleanup: true,
    };
  } finally {
    let failed = false;
    for (const work of [
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
        if (accounts.records.get(id) === 'confirmed')
          for (const table of [
            'account_password_recoveries',
            'account_email_verifications',
            'account_sessions',
          ]) {
            const rows = await database.transaction((client) =>
              client.query(`SELECT id FROM ${table} WHERE account_id = $1`, [id]),
            );
            for (const row of rows.rows)
              await database.transaction((client) =>
                client.query(`DELETE FROM ${table} WHERE id = $1 AND account_id = $2`, [
                  row.id,
                  id,
                ]),
              );
          }
        await accounts.cleanup();
      },
      () => database.close(),
    ]) {
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
      throw new Error('Cleanup requires review');
    }
  }
  mkdirSync(resolve('.local'), { recursive: true });
  writeFileSync(
    resolve('.local', `gmail-recovery-acceptance-${randomUUID()}.json`),
    JSON.stringify(evidence, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(JSON.stringify(evidence));
  console.log(
    'Safe report saved under .local/; no addresses, credentials or received links.',
  );
})().catch(() => {
  console.error(
    `Gmail recovery acceptance failed at ${phase}; sensitive diagnostics suppressed. Real-delivery acceptance remains incomplete.`,
  );
  process.exitCode = 1;
});
