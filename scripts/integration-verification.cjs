const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { sql } = require('drizzle-orm');
const {
  PostgresVerificationRepository,
  PostgresSessionRepository,
} = require('@commerce/database');
const { OwnedAccounts, candidate } = require('./integration-accounts.cjs');
const {
  OwnedSchema,
  identifier,
  schemaSnapshot,
  journalSnapshot,
} = require('./integration-fixtures.cjs');
const {
  createSmtpCapture,
  capturedToken,
} = require('../tests/fixtures/smtp-capture.cjs');

async function validateVerificationRollout(database) {
  const owner = new OwnedSchema(database, 'verifyroll');
  try {
    await owner.create();
    for (const name of [
      'accounts',
      'account_passwords',
      'account_sessions',
      'account_email_verifications',
    ])
      owner.table(name);
    await database.transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${identifier(owner.schema)}`);
      const apply = async (name) => {
        const source = readFileSync(
          join(__dirname, '../packages/database/migrations', name),
          'utf8',
        ).replaceAll('"public".', `${identifier(owner.schema)}.`);
        for (const statement of source.split('--> statement-breakpoint'))
          if (statement.trim()) await client.query(statement);
      };
      await apply('0000_sharp_glorian.sql');
      await apply('0001_confused_retro_girl.sql');
      const unverified = randomUUID(),
        verified = randomUUID();
      for (const [id, when] of [
        [unverified, null],
        [verified, new Date()],
      ]) {
        await client.query(
          'INSERT INTO accounts (id,email_normalized,email_verified_at) VALUES ($1,$2,$3)',
          [id, `${id}@example.test`, when],
        );
        await client.query('INSERT INTO account_passwords VALUES ($1,$2)', [
          id,
          'unchanged-synthetic',
        ]);
        await client.query(
          "INSERT INTO account_sessions VALUES ($1,$2,$3,now(),now()+interval '12 hours',now(),NULL)",
          [randomUUID(), id, createHash('sha256').update(id).digest('hex')],
        );
      }
      await apply('0002_email_verification.sql');
      const rows = await client.query(
        'SELECT account_id,revoked_at FROM account_sessions',
      );
      assert.ok(rows.rows.find((row) => row.account_id === unverified).revoked_at);
      assert.equal(rows.rows.find((row) => row.account_id === verified).revoked_at, null);
      assert.equal(
        (await client.query('SELECT password_hash FROM account_passwords')).rows.every(
          (row) => row.password_hash === 'unchanged-synthetic',
        ),
        true,
      );
    });
    return true;
  } finally {
    await owner.cleanup();
  }
}

async function validateVerification(database) {
  const accounts = new OwnedAccounts(database);
  const repository = new PostgresVerificationRepository(database);
  const sessions = new PostgresSessionRepository(database);
  const challenges = new Map(),
    sessionIds = new Set();
  const issue = async (account) => {
    const id = randomUUID(),
      token = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(token).digest('hex');
    challenges.set(id, false);
    const issued = await repository.issue(account.emailNormalized, id, digest);
    if (issued) challenges.set(id, true);
    else challenges.delete(id);
    return { id, token, digest, issued };
  };
  const capture = await createSmtpCapture();
  try {
    const { hashPassword } = require('../apps/api/dist/accounts/password-hasher');
    const password = 'Synthetic verification passphrase';
    const account = candidate(undefined, await hashPassword(password));
    const sentinelAccount = candidate();
    await accounts.create(account);
    await accounts.create(sentinelAccount);
    const sentinel = await issue(sentinelAccount);
    assert.equal(sentinel.issued, true);
    const snapshot = async () =>
      (
        await database.orm.execute(
          sql`SELECT * FROM account_email_verifications WHERE id=${sentinel.id}`,
        )
      ).rows;
    const baseline = await snapshot(),
      catalog = await schemaSnapshot(database),
      journal = await journalSnapshot(database);
    const limited = candidate();
    await accounts.create(limited);
    const age = () =>
      database.orm.execute(
        sql`UPDATE account_email_verifications SET issued_at=issued_at-interval '61 seconds', expires_at=expires_at-interval '61 seconds' WHERE account_id=${limited.id}`,
      );
    const oldest = await issue(limited);
    assert.equal(oldest.issued, true);
    await age();
    const racingIssues = await Promise.all([issue(limited), issue(limited)]);
    assert.equal(racingIssues.filter((entry) => entry.issued).length, 1);
    await age();
    assert.equal((await issue(limited)).issued, true);
    await age();
    assert.equal((await issue(limited)).issued, false);
    assert.ok(await repository.lookup(oldest.digest));
    await database.orm.execute(
      sql`UPDATE account_email_verifications SET issued_at=issued_at-interval '31 minutes', expires_at=expires_at-interval '31 minutes' WHERE id=${oldest.id}`,
    );
    assert.equal(await repository.lookup(oldest.digest), undefined);
    assert.equal((await issue(limited)).issued, true);
    challenges.delete(oldest.id); // The issuer pruned this exact owned expired row.
    await assert.rejects(
      database.transaction((client) =>
        client.query(
          "INSERT INTO account_email_verifications VALUES ($1,$2,$3,now(),now()+interval '30 minutes')",
          [randomUUID(), limited.id, 'invalid-digest'],
        ),
      ),
      (error) => error.code === '23514',
    );
    for (const fails of [false, true]) {
      const worker = new OwnedAccounts(database);
      const value = candidate();
      const id = randomUUID();
      let created = false;
      try {
        await worker.create(value);
        created = await repository.issue(
          value.emailNormalized,
          id,
          createHash('sha256').update(id).digest('hex'),
        );
        assert.equal(created, true);
        if (fails) throw new Error('expected verification worker failure');
      } catch (error) {
        if (!fails || error.message !== 'expected verification worker failure')
          throw error;
      } finally {
        if (created)
          await database.orm.execute(
            sql`DELETE FROM account_email_verifications WHERE id=${id}`,
          );
        await worker.cleanup();
      }
      assert.deepEqual(await snapshot(), baseline);
    }
    const first = await issue(account);
    assert.equal(first.issued, true);
    assert.equal((await issue(account)).issued, false);
    await database.orm.execute(
      sql`UPDATE account_email_verifications SET issued_at=issued_at-interval '61 seconds', expires_at=expires_at-interval '61 seconds' WHERE id=${first.id}`,
    );
    const sibling = await issue(account);
    assert.equal(sibling.issued, true);
    assert.equal(
      await sessions.create(
        randomUUID(),
        account.id,
        'a'.repeat(64),
        account.passwordHash,
      ),
      undefined,
    );
    // A controlled legacy session predates the new verified-only insertion path.
    const legacy = randomUUID();
    sessionIds.add(legacy);
    await database.transaction((client) =>
      client.query(
        "INSERT INTO account_sessions VALUES ($1,$2,$3,now(),now()+interval '12 hours',now(),NULL)",
        [legacy, account.id, 'b'.repeat(64)],
      ),
    );
    assert.equal(await sessions.renew('b'.repeat(64)), undefined);
    const proof = await repository.lookup(first.digest);
    assert.ok(proof);
    // Roll back all verification effects after a deliberately injected final failure.
    const failed = new PostgresVerificationRepository({
      transaction: (work) =>
        database.transaction(async (client) => {
          await work(client);
          throw new Error('expected verification rollback');
        }),
    });
    await assert.rejects(
      failed.confirm(first.digest, proof),
      /expected verification rollback/,
    );
    assert.ok(await repository.lookup(first.digest));
    assert.equal(
      (
        await database.orm.execute(
          sql`SELECT email_verified_at FROM accounts WHERE id=${account.id}`,
        )
      ).rows[0].email_verified_at,
      null,
    );
    assert.equal(
      (
        await database.orm.execute(
          sql`SELECT revoked_at FROM account_sessions WHERE id=${legacy}`,
        )
      ).rows[0].revoked_at,
      null,
    );
    const wrongProof = { ...proof, passwordHash: 'stale-credential' };
    assert.equal(await repository.confirm(first.digest, wrongProof), false);
    const results = await Promise.all([
      repository.confirm(first.digest, proof),
      repository.confirm(first.digest, proof),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    challenges.delete(first.id);
    challenges.delete(sibling.id);
    assert.equal(await repository.lookup(sibling.digest), undefined);
    assert.equal(await repository.lookup(first.digest), undefined);
    assert.equal(await sessions.renew('b'.repeat(64)), undefined);
    assert.ok(
      (
        await database.orm.execute(
          sql`SELECT revoked_at FROM account_sessions WHERE id=${legacy}`,
        )
      ).rows[0].revoked_at,
    );
    const fresh = randomUUID();
    sessionIds.add(fresh);
    assert.ok(
      (await sessions.create(
        fresh,
        account.id,
        'c'.repeat(64),
        account.passwordHash,
      )) instanceof Date,
    );
    assert.equal(await sessions.renew('c'.repeat(64)), account.id);
    // The HTTP path uses real password derivation and the actual SMTP transport.
    const other = candidate(undefined, await hashPassword(password));
    await accounts.create(other);
    const { RegistrationService } = require('../apps/api/dist/accounts/service');
    const { VerificationService } = require('../apps/api/dist/accounts/verification');
    const { LocalVerificationSender } = require('../apps/api/dist/accounts/mail');
    const { createRuntime } = require('../apps/api/dist/runtime');
    const { readApiConfiguration } = require('../apps/api/dist/configuration');
    // Record exact candidate challenge intent before the service's repository call.
    const ownedRepository = {
      issue: async (email, id, digest) => {
        challenges.set(id, false);
        const result = await repository.issue(email, id, digest);
        if (result) challenges.set(id, true);
        else challenges.delete(id);
        return result;
      },
      lookup: (digest) => repository.lookup(digest),
      confirm: async (digest, value) => {
        const result = await repository.confirm(digest, value);
        if (result)
          for (const [id, owned] of challenges)
            if (
              owned &&
              !(
                await database.orm.execute(
                  sql`SELECT id FROM account_email_verifications WHERE id=${id}`,
                )
              ).rows.length
            )
              challenges.delete(id);
        return result;
      },
    };
    const registration = new RegistrationService(accounts);
    const service = new VerificationService(
      ownedRepository,
      registration,
      new LocalVerificationSender({
        host: '127.0.0.1',
        port: capture.port,
        webOrigin: 'http://127.0.0.1:3000',
      }),
    );
    const runtime = await createRuntime(
      readApiConfiguration({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1/unused',
        WEB_ORIGINS: 'http://127.0.0.1:3000',
      }),
      { ready: () => database.ready(), close: async () => {} },
      () => {},
      registration,
      undefined,
      service,
    );
    await runtime.listen(0);
    try {
      const base = `http://127.0.0.1:${runtime.server.address().port}/accounts/email-verification`;
      const post = (path, body) =>
        fetch(base + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Commerce-Request': '1' },
          body: JSON.stringify(body),
        });
      assert.equal(
        (await post('/request', { email: other.emailNormalized })).status,
        202,
      );
      await service.drain();
      assert.equal(capture.messages.length, 1);
      const token = capturedToken(capture.messages[0]);
      assert.ok(token);
      assert.equal((await post('/confirm', { token, password: 'wrong' })).status, 401);
      assert.equal((await post('/confirm', { token, password })).status, 200);
      assert.equal((await post('/confirm', { token, password })).status, 401);
    } finally {
      assert.equal(await runtime.close(), 0);
    }
    assert.deepEqual(await snapshot(), baseline);
    assert.deepEqual(await schemaSnapshot(database), catalog);
    assert.deepEqual(await journalSnapshot(database), journal);
    return {
      digestStorage: true,
      cooldown: true,
      cap: true,
      expiry: true,
      concurrentIssuance: true,
      siblingInvalidation: true,
      atomicConfirmation: true,
      concurrentConfirmation: true,
      rollback: true,
      legacyRevocation: true,
      httpSmtp: true,
      successfulAndFailingWorker: true,
      sentinel: true,
      rollout: await validateVerificationRollout(database),
    };
  } finally {
    await capture.close();
    for (const [id, confirmed] of challenges) {
      assert.equal(confirmed, true, 'Uncertain challenge ownership');
      await database.orm.execute(
        sql`DELETE FROM account_email_verifications WHERE id=${id}`,
      );
    }
    for (const id of sessionIds)
      await database.orm.execute(sql`DELETE FROM account_sessions WHERE id=${id}`);
    await accounts.cleanup();
  }
}
module.exports = { validateVerification };
