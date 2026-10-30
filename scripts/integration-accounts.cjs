const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { sql } = require('drizzle-orm');
const { AccountRepository } = require('@commerce/database');
const { cleanupAll, withCleanup, sqlState } = require('./integration-support.cjs');
const { schemaSnapshot, journalSnapshot } = require('./integration-fixtures.cjs');

class ExpectedAccountRollback extends Error {}
class ExpectedAccountWorkerFailure extends Error {}

/** Intent is not ownership. Public acceptance responses never confirm records. */
class OwnedAccounts {
  constructor(database, repository = new AccountRepository(database)) {
    this.database = database;
    this.repository = repository;
    this.records = new Map();
  }
  async absent(id) {
    const result = await this.database.orm.execute(
      sql`SELECT id FROM accounts WHERE id=${id}`,
    );
    assert.equal(result.rows.length, 0, 'Candidate unexpectedly exists');
    const credentials = await this.database.orm.execute(
      sql`SELECT account_id FROM account_passwords WHERE account_id=${id}`,
    );
    assert.equal(credentials.rows.length, 0, 'Candidate credential unexpectedly exists');
  }
  async create(input) {
    assert.equal(this.records.has(input.id), false, 'Candidate already registered');
    this.records.set(input.id, 'pending');
    try {
      const result = await this.repository.create(input);
      if (result.kind === 'created') {
        assert.equal(result.id, input.id, 'Unexpected created identity');
        this.records.set(input.id, 'confirmed');
      } else {
        await this.absent(input.id);
        this.records.delete(input.id);
      }
      return result;
    } catch (error) {
      // These are definite no-commit cases. Transport/commit ambiguity stays pending.
      if (error instanceof ExpectedAccountRollback || /^23/.test(sqlState(error) ?? '')) {
        await this.absent(input.id);
        this.records.delete(input.id);
      }
      throw error;
    }
  }
  async cleanup() {
    await cleanupAll(
      [...this.records].reverse().map(([id, state]) => async () => {
        assert.equal(
          state,
          'confirmed',
          'Uncertain account ownership; manual review required',
        );
        await this.database.orm.execute(
          sql`DELETE FROM account_passwords WHERE account_id=${id}`,
        );
        const removed = await this.database.orm.execute(
          sql`DELETE FROM accounts WHERE id=${id} RETURNING id`,
        );
        assert.equal(removed.rows.length, 1, 'Owned account missing during cleanup');
        this.records.delete(id);
      }),
    );
  }
}

function candidate(
  emailNormalized = `${randomUUID()}@example.invalid`,
  passwordHash = 'synthetic-live-credential',
) {
  return { id: randomUUID(), emailNormalized, passwordHash };
}
async function pair(database, id) {
  return (
    await database.orm
      .execute(sql`SELECT a.id, a.email_normalized, a.created_at, a.email_verified_at, p.password_hash
    FROM accounts a JOIN account_passwords p ON p.account_id=a.id WHERE a.id=${id}`)
  ).rows;
}

async function validateAccountRepository(database) {
  const owner = new OwnedAccounts(database);
  return withCleanup(
    async () => {
      const input = candidate();
      assert.equal((await owner.create(input)).kind, 'created');
      const baseline = await pair(database, input.id);
      assert.equal(baseline.length, 1);
      assert.equal(baseline[0].email_verified_at, null);
      assert.ok(
        Number.isFinite(Date.parse(String(baseline[0].created_at))),
        'Creation timestamp invalid',
      );
      assert.equal(
        (
          await owner.create(
            candidate(input.emailNormalized, 'different-synthetic-credential'),
          )
        ).kind,
        'existing',
      );
      assert.deepEqual(
        await pair(database, input.id),
        baseline,
        'Duplicate changed account or credential',
      );

      const email = `${randomUUID()}@example.invalid`;
      const contenders = [
        candidate(email, 'synthetic-race-one'),
        candidate(email, 'synthetic-race-two'),
      ];
      const results = await Promise.all(contenders.map((value) => owner.create(value)));
      assert.equal(results.filter((value) => value.kind === 'created').length, 1);
      assert.equal(results.filter((value) => value.kind === 'existing').length, 1);
      const winner = contenders[results.findIndex((value) => value.kind === 'created')];
      const winning = await pair(database, winner.id);
      assert.equal(winning.length, 1);
      assert.equal(winning[0].password_hash, winner.passwordHash);

      // The real account insert occurs; only credential work is interrupted inside the transaction.
      const failingRepository = new AccountRepository({
        transaction: (work) =>
          database.transaction((client) =>
            work({
              query: (...args) => {
                if (args[0].startsWith('INSERT INTO account_passwords '))
                  throw new ExpectedAccountRollback();
                return client.query(...args);
              },
            }),
          ),
      });
      const failing = new OwnedAccounts(database, failingRepository);
      const rollback = candidate();
      await assert.rejects(
        failing.create(rollback),
        (error) => error instanceof ExpectedAccountRollback,
      );
      await failing.absent(rollback.id);
      await failing.cleanup();
      assert.equal(
        (await database.transaction((client) => client.query('SELECT 17 AS value')))
          .rows[0].value,
        17,
      );

      // Constraint probes roll back and therefore own no committed fixture rows.
      const rejectConstraint = (operation, code) =>
        assert.rejects(
          database.transaction(operation),
          (error) => sqlState(error) === code,
        );
      await rejectConstraint(
        (client) =>
          client.query('INSERT INTO accounts (id,email_normalized) VALUES ($1,$2)', [
            randomUUID(),
            input.emailNormalized,
          ]),
        '23505',
      );
      await rejectConstraint(
        (client) =>
          client.query(
            'INSERT INTO account_passwords (account_id,password_hash) VALUES ($1,$2)',
            [randomUUID(), 'synthetic'],
          ),
        '23503',
      );
      await rejectConstraint(
        (client) =>
          client.query(
            'INSERT INTO account_passwords (account_id,password_hash) VALUES ($1,$2)',
            [input.id, 'synthetic'],
          ),
        '23505',
      );
      await rejectConstraint(
        (client) => client.query('DELETE FROM accounts WHERE id=$1', [input.id]),
        '23001',
      );
      for (const invalid of [
        '',
        'Uppercase@example.invalid',
        'nonascii\u00e9@example.invalid',
      ]) {
        await rejectConstraint(
          (client) =>
            client.query('INSERT INTO accounts (id,email_normalized) VALUES ($1,$2)', [
              randomUUID(),
              invalid,
            ]),
          '23514',
        );
      }
      assert.deepEqual(await pair(database, input.id), baseline);
      return {
        commit: true,
        duplicateUnchanged: true,
        concurrentUnique: true,
        pairRollback: true,
        constraints: true,
      };
    },
    () => owner.cleanup(),
  );
}

async function validateAccountSentinels(database) {
  const coordinator = new OwnedAccounts(database);
  let preserved = false;
  const sentinel = candidate();
  try {
    await coordinator.create(sentinel);
    const baseline = await pair(database, sentinel.id);
    const schema = await schemaSnapshot(database);
    const journal = await journalSnapshot(database);
    for (const fails of [false, true]) {
      const worker = new OwnedAccounts(database);
      const input = candidate();
      const operation = () =>
        withCleanup(
          async () => {
            await worker.create(input);
            // A conflict with a coordinator-owned row never authorizes deleting it.
            assert.equal(
              (await worker.create(candidate(sentinel.emailNormalized))).kind,
              'existing',
            );
            if (fails) throw new ExpectedAccountWorkerFailure();
          },
          () => worker.cleanup(),
        );
      if (fails)
        await assert.rejects(
          operation(),
          (error) => error instanceof ExpectedAccountWorkerFailure,
        );
      else await operation();
      await worker.absent(input.id);
      assert.deepEqual(
        await pair(database, sentinel.id),
        baseline,
        'Account sentinel changed',
      );
      assert.deepEqual(
        await schemaSnapshot(database),
        schema,
        'Account cleanup changed catalog',
      );
      assert.deepEqual(
        await journalSnapshot(database),
        journal,
        'Account cleanup changed journal',
      );
    }
    preserved = true;
    return {
      successfulWorker: true,
      failingWorker: true,
      accountAndCredentialPreserved: true,
    };
  } finally {
    if (preserved) await coordinator.cleanup();
    else if (coordinator.records.size)
      console.error('Account sentinel retained for explicit review');
  }
}

async function validateAccountHttp(database, env) {
  // Load compiled API only after guarded test configuration has created this database.
  const { createRuntime } = require('../apps/api/dist/runtime.js');
  const { readApiConfiguration } = require('../apps/api/dist/configuration.js');
  const { RegistrationService } = require('../apps/api/dist/accounts/service.js');
  const owner = new OwnedAccounts(database);
  const coordinator = new OwnedAccounts(database);
  const sentinel = candidate();
  const logs = [];
  let preserved = false;
  let runtime;
  try {
    await coordinator.create(sentinel);
    const baseline = await pair(database, sentinel.id);
    const catalog = await schemaSnapshot(database);
    const journal = await journalSnapshot(database);
    await withCleanup(
      async () => {
        const registration = new RegistrationService(owner);
        runtime = await createRuntime(
          readApiConfiguration(env),
          { ready: () => database.ready(), close: async () => {} },
          (event) => logs.push(event),
          registration,
        );
        await runtime.listen(0);
        assert.deepEqual(
          await schemaSnapshot(database),
          catalog,
          'API startup migrated schema',
        );
        assert.deepEqual(
          await journalSnapshot(database),
          journal,
          'API startup changed history',
        );
        const url = `http://127.0.0.1:${runtime.server.address().port}/accounts/register`;
        const email = candidate().emailNormalized;
        const password = 'Synthetic live registration passphrase';
        const send = (input) =>
          fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          });
        const accepted = async (response) => {
          assert.equal(response.status, 202);
          assert.deepEqual(await response.json(), {
            status: 'accepted',
            message: 'Registration request processed.',
          });
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.equal(response.headers.get('set-cookie'), null);
          assert.equal(response.headers.get('location'), null);
        };
        await accepted(await send({ email, password }));
        const created = [...owner.records].find(([, state]) => state === 'confirmed')[0];
        const first = await pair(database, created);
        assert.equal(first.length, 1);
        assert.equal(first[0].email_verified_at, null);
        assert.match(
          first[0].password_hash,
          /^scrypt\$v1\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/,
        );
        assert.equal(first[0].password_hash.includes(password), false);
        await accepted(
          await send({
            email: ` ${email.toUpperCase()} `,
            password: 'Another synthetic live passphrase',
          }),
        );
        assert.deepEqual(
          await pair(database, created),
          first,
          'HTTP duplicate changed account',
        );
        const race = candidate().emailNormalized;
        await Promise.all(
          (
            await Promise.all([
              send({ email: race, password }),
              send({
                email: race.toUpperCase(),
                password: 'Distinct synthetic race passphrase',
              }),
            ])
          ).map(accepted),
        );
        const count = await database.orm.execute(
          sql`SELECT count(*)::integer AS value FROM accounts WHERE email_normalized=${race}`,
        );
        assert.equal(count.rows[0].value, 1);
        assert.equal(
          [...owner.records.values()].filter((state) => state === 'confirmed').length,
          2,
        );
        assert.equal((await send({ email, password, isAdmin: true })).status, 400);
        assert.equal(
          logs.some(
            (event) => event.path === '/accounts/register' && event.status === 202,
          ),
          true,
        );
        assert.equal(JSON.stringify(logs).includes(password), false);
        assert.equal(JSON.stringify(logs).includes(email), false);
      },
      () =>
        cleanupAll([
          async () => {
            if (runtime)
              assert.equal(await runtime.close(), 0, 'Live API shutdown failed');
          },
          () => owner.cleanup(),
        ]),
    );
    assert.deepEqual(
      await pair(database, sentinel.id),
      baseline,
      'HTTP cleanup changed sentinel',
    );
    assert.deepEqual(
      await schemaSnapshot(database),
      catalog,
      'HTTP cleanup changed catalog',
    );
    assert.deepEqual(
      await journalSnapshot(database),
      journal,
      'HTTP cleanup changed history',
    );
    preserved = true;
    return {
      accepted: true,
      duplicateUnchanged: true,
      canonicalRace: true,
      realHash: true,
      startupNoMigration: true,
      sentinelPreserved: true,
    };
  } finally {
    if (preserved) await coordinator.cleanup();
    else if (coordinator.records.size)
      console.error('HTTP account sentinel retained for explicit review');
  }
}

module.exports = {
  OwnedAccounts,
  candidate,
  pair,
  validateAccountRepository,
  validateAccountSentinels,
  validateAccountHttp,
};
