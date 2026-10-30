const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { sql } = require('drizzle-orm');
const { PostgresSessionRepository } = require('@commerce/database');
const { OwnedAccounts, candidate } = require('./integration-accounts.cjs');
const { schemaSnapshot, journalSnapshot } = require('./integration-fixtures.cjs');

async function validateSessions(database, env) {
  const accounts = new OwnedAccounts(database);
  const repository = new PostgresSessionRepository(database);
  const owned = new Map();
  let preserved = false;
  const make = async (accountId) => {
    const id = randomUUID();
    const digest = createHash('sha256').update(randomBytes(32)).digest('hex');
    owned.set(id, 'pending');
    await repository.create(id, accountId, digest);
    owned.set(id, 'confirmed');
    return { id, digest };
  };
  try {
    const { hashPassword } = require('../apps/api/dist/accounts/password-hasher.js');
    const password = 'Synthetic live session phrase';
    const account = candidate(undefined, await hashPassword(password));
    await accounts.create(account);
    await database.orm.execute(
      sql`UPDATE accounts SET email_verified_at=clock_timestamp() WHERE id=${account.id}`,
    );
    const sentinel = await make(account.id);
    const snapshot = async (id) =>
      (await database.orm.execute(sql`SELECT * FROM account_sessions WHERE id=${id}`))
        .rows;
    const baseline = await snapshot(sentinel.id);
    const catalog = await schemaSnapshot(database),
      journal = await journalSnapshot(database);
    for (const fail of [false, true]) {
      const worker = await make(account.id);
      try {
        assert.equal(await repository.renew(worker.digest), account.id);
        await database.orm.execute(
          sql`UPDATE account_sessions SET issued_at=issued_at - interval '31 minutes', absolute_expires_at=absolute_expires_at - interval '31 minutes', last_activity_at=last_activity_at - interval '31 minutes' WHERE id=${worker.id}`,
        );
        assert.equal(
          await repository.renew(worker.digest),
          undefined,
          'Idle session must expire',
        );
        await repository.revoke(worker.digest);
        assert.equal(await repository.renew(worker.digest), undefined);
        if (fail) throw new Error('expected worker failure');
      } catch (error) {
        if (!fail || error.message !== 'expected worker failure') throw error;
      } finally {
        assert.equal(owned.get(worker.id), 'confirmed');
        const removed = await database.orm.execute(
          sql`DELETE FROM account_sessions WHERE id=${worker.id} RETURNING id`,
        );
        assert.equal(removed.rows.length, 1);
        owned.delete(worker.id);
      }
      assert.deepEqual(await snapshot(sentinel.id), baseline);
      assert.deepEqual(await schemaSnapshot(database), catalog);
      assert.deepEqual(await journalSnapshot(database), journal);
    }
    const absolute = await make(account.id);
    await database.orm.execute(
      sql`UPDATE account_sessions SET issued_at=issued_at - interval '12 hours 1 minute', absolute_expires_at=absolute_expires_at - interval '12 hours 1 minute' WHERE id=${absolute.id}`,
    );
    assert.equal(
      await repository.renew(absolute.digest),
      undefined,
      'Absolute lifetime must expire despite recent activity',
    );
    const racing = await make(account.id);
    await Promise.all([
      repository.renew(racing.digest),
      repository.revoke(racing.digest),
    ]);
    assert.equal(
      await repository.renew(racing.digest),
      undefined,
      'Revocation must not be undone by renewal',
    );
    const rolledBack = randomUUID();
    const rollbackDigest = createHash('sha256').update(randomBytes(32)).digest('hex');
    const expected = new Error('expected session rollback');
    await assert.rejects(
      database.transaction(async (client) => {
        await client.query(
          `INSERT INTO account_sessions (id, account_id, token_digest, issued_at, absolute_expires_at, last_activity_at)
        VALUES ($1,$2,$3,now(),now() + interval '12 hours',now())`,
          [rolledBack, account.id, rollbackDigest],
        );
        throw expected;
      }),
      (error) => error === expected,
    );
    assert.equal(
      (await snapshot(rolledBack)).length,
      0,
      'Rolled-back session must not persist',
    );
    assert.deepEqual(await snapshot(sentinel.id), baseline);
    const { RegistrationService } = require('../apps/api/dist/accounts/service.js');
    const { SessionService } = require('../apps/api/dist/accounts/sessions.js');
    const { createRuntime } = require('../apps/api/dist/runtime.js');
    const { readApiConfiguration } = require('../apps/api/dist/configuration.js');
    const sessionPort = {
      credential: (email) => repository.credential(email),
      create: async (id, accountId, digest) => {
        owned.set(id, 'pending');
        const result = await repository.create(id, accountId, digest);
        owned.set(id, 'confirmed');
        return result;
      },
      renew: (digest) => repository.renew(digest),
      revoke: (digest) => repository.revoke(digest),
    };
    const registration = new RegistrationService(accounts);
    const runtime = await createRuntime(
      readApiConfiguration(env),
      { ready: () => database.ready(), close: async () => {} },
      () => {},
      registration,
      new SessionService(sessionPort, registration),
    );
    await runtime.listen(0);
    try {
      const base = `http://127.0.0.1:${runtime.server.address().port}/accounts/sessions`;
      const login = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-commerce-request': '1' },
        body: JSON.stringify({ email: account.emailNormalized, password }),
      });
      assert.equal(login.status, 201);
      const cookie = login.headers.get('set-cookie');
      assert.ok(cookie);
      const current = await fetch(base + '/current', {
        headers: { 'x-commerce-request': '1', cookie },
      });
      assert.equal(current.status, 200);
      assert.equal((await current.json()).accountId, account.id);
      const logout = await fetch(base + '/current', {
        method: 'DELETE',
        headers: { 'x-commerce-request': '1', cookie },
      });
      assert.equal(logout.status, 204);
      assert.equal(
        (
          await fetch(base + '/current', {
            headers: { 'x-commerce-request': '1', cookie },
          })
        ).status,
        401,
      );
    } finally {
      assert.equal(await runtime.close(), 0);
    }
    assert.deepEqual(await snapshot(sentinel.id), baseline);
    preserved = true;
  } finally {
    if (preserved) {
      for (const [id, state] of owned) {
        assert.equal(state, 'confirmed', 'Uncertain session ownership');
        const removed = await database.orm.execute(
          sql`DELETE FROM account_sessions WHERE id=${id} RETURNING id`,
        );
        assert.equal(removed.rows.length, 1);
      }
      await accounts.cleanup();
    }
  }
  return {
    revocation: true,
    expiry: true,
    renewalRevocationRace: true,
    rollback: true,
    realHttp: true,
    independentSentinel: true,
    successfulAndFailingWorker: true,
  };
}
module.exports = { validateSessions };
