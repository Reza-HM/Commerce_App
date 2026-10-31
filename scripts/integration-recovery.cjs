const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const {
  PostgresRecoveryRepository,
  PostgresSessionRepository,
  PostgresVerificationRepository,
} = require('@commerce/database');
const { OwnedAccounts, candidate } = require('./integration-accounts.cjs');
const { schemaSnapshot, journalSnapshot } = require('./integration-fixtures.cjs');

function barrier() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
// Hold a known mutation's transaction, then prove a second account lock is attempted.
function paused(database, prefix) {
  const reached = barrier(),
    release = barrier();
  return {
    reached,
    release,
    port: {
      transaction: (work) =>
        database.transaction((client) =>
          work({
            query: async (...args) => {
              const result = await client.query(...args);
              if (args[0].startsWith(prefix)) {
                reached.resolve();
                await release.promise;
              }
              return result;
            },
          }),
        ),
    },
  };
}
function observedLock(database) {
  const attempted = barrier();
  return {
    attempted,
    port: {
      transaction: (work) =>
        database.transaction((client) =>
          work({
            query: (...args) => {
              const result = client.query(...args);
              if (
                args[0].includes('FROM accounts WHERE') &&
                args[0].includes('FOR UPDATE')
              )
                attempted.resolve();
              return result;
            },
          }),
        ),
    },
  };
}

async function validateRecovery(database) {
  const owner = new OwnedAccounts(database);
  const recovery = new PostgresRecoveryRepository(database);
  const verification = new PostgresVerificationRepository(database);
  const sessions = new PostgresSessionRepository(database);
  const rows = new Map();
  const record = (table, id) =>
    rows.set(table + ':' + id, { table, id, confirmed: false });
  const confirmOwned = (table, id) => {
    rows.get(table + ':' + id).confirmed = true;
  };
  const makeAccount = async (verified = false) => {
    const account = candidate();
    await owner.create(account);
    if (verified)
      await database.transaction((client) =>
        client.query(
          'UPDATE accounts SET email_verified_at = clock_timestamp() WHERE id = $1',
          [account.id],
        ),
      );
    return account;
  };
  const issue = async (account, kind = 'recovery') => {
    const id = randomUUID(),
      token = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(token).digest('hex');
    const table =
      kind === 'recovery' ? 'account_password_recoveries' : 'account_email_verifications';
    record(table, id);
    const result = await (kind === 'recovery' ? recovery : verification).issue(
      account.emailNormalized,
      id,
      digest,
    );
    if (result) confirmOwned(table, id);
    else rows.delete(table + ':' + id);
    return { id, digest, issued: result };
  };
  const makeSession = async (account, repository = sessions) => {
    const id = randomUUID(),
      digest = createHash('sha256').update(randomBytes(32)).digest('hex');
    record('account_sessions', id);
    const result = await repository.create(id, account.id, digest, account.passwordHash);
    if (result instanceof Date) confirmOwned('account_sessions', id);
    else rows.delete('account_sessions:' + id);
    return { id, digest, result };
  };
  const snapshot = (id) =>
    database.transaction(async (client) => {
      const result = {};
      for (const [table, key] of [
        ['accounts', 'id'],
        ['account_passwords', 'account_id'],
        ['account_sessions', 'account_id'],
        ['account_email_verifications', 'account_id'],
        ['account_password_recoveries', 'account_id'],
      ])
        result[table] = (
          await client.query(
            `SELECT * FROM ${table} WHERE ${key} = $1 ORDER BY ${table === 'account_passwords' ? 'account_id' : 'id'}`,
            [id],
          )
        ).rows;
      return result;
    });
  const age = (challenge) =>
    database.transaction((client) =>
      client.query(
        "UPDATE account_password_recoveries SET issued_at = issued_at - interval '61 seconds', expires_at = expires_at - interval '61 seconds' WHERE id = $1",
        [challenge.id],
      ),
    );
  const catalog = await schemaSnapshot(database),
    journal = await journalSnapshot(database);
  try {
    const sentinel = await makeAccount();
    await issue(sentinel);
    await issue(sentinel, 'verification');
    const sentinelBaseline = await snapshot(sentinel.id);
    for (const fail of [false, true]) {
      const workerOwner = new OwnedAccounts(database);
      const worker = candidate();
      await workerOwner.create(worker);
      await issue(worker);
      try {
        if (fail) throw new Error('expected recovery worker failure');
      } catch (error) {
        if (error.message !== 'expected recovery worker failure') throw error;
      } finally {
        for (const [key, row] of rows) {
          if (!row.confirmed) throw new Error('Uncertain recovery fixture ownership');
          // Delete only exact confirmed rows for this worker; sentinels remain untouched.
          const removed = await database.transaction((client) =>
            client.query(
              `DELETE FROM ${row.table} WHERE id = $1 AND account_id = $2 RETURNING id`,
              [row.id, worker.id],
            ),
          );
          if (removed.rows.length) rows.delete(key);
        }
        await workerOwner.cleanup();
      }
      assert.deepEqual(await snapshot(sentinel.id), sentinelBaseline);
    }
    const limited = await makeAccount();
    const concurrent = await Promise.all([issue(limited), issue(limited)]);
    assert.equal(concurrent.filter((x) => x.issued).length, 1);
    const first = concurrent.find((x) => x.issued);
    await age(first);
    const second = await issue(limited);
    assert.equal(second.issued, true);
    await age(second);
    const third = await issue(limited);
    assert.equal(third.issued, true);
    await age(third);
    assert.equal((await issue(limited)).issued, false);
    await database.transaction((client) =>
      client.query(
        "UPDATE account_password_recoveries SET issued_at = issued_at - interval '31 minutes', expires_at = expires_at - interval '31 minutes' WHERE id = $1",
        [first.id],
      ),
    );
    assert.equal(await recovery.lookup(first.digest), undefined);
    assert.equal((await issue(limited)).issued, true);

    const account = await makeAccount();
    const oldVerification = await issue(account, 'verification');
    const challenge = await issue(account);
    await age(challenge);
    const sibling = await issue(account);
    await database.transaction((client) =>
      client.query(
        'UPDATE accounts SET email_verified_at = clock_timestamp() WHERE id = $1',
        [account.id],
      ),
    );
    const session = await makeSession(account);
    assert.ok(session.result instanceof Date);
    const baseline = await snapshot(account.id);
    const proof = await recovery.lookup(challenge.digest);
    assert.ok(proof);
    for (const prefix of [
      'UPDATE account_passwords ',
      'UPDATE account_sessions ',
      'DELETE FROM account_email_verifications ',
      'DELETE FROM account_password_recoveries ',
    ]) {
      const failed = new PostgresRecoveryRepository({
        transaction: (work) =>
          database.transaction((client) =>
            work({
              query: async (...args) => {
                const result = await client.query(...args);
                if (args[0].startsWith(prefix))
                  throw new Error('expected reset rollback');
                return result;
              },
            }),
          ),
      });
      await assert.rejects(
        failed.confirm(challenge.digest, proof, 'rolled-back-hash'),
        /expected reset rollback/,
      );
      assert.deepEqual(await snapshot(account.id), baseline);
    }
    assert.equal(
      await recovery.confirm(
        challenge.digest,
        { ...proof, passwordHash: 'stale' },
        'rejected',
      ),
      false,
    );
    assert.equal(
      await recovery.lookup(oldVerification.digest),
      undefined,
      'Verification tokens have no reset authority',
    );
    assert.equal(
      await verification.lookup(challenge.digest),
      undefined,
      'Recovery tokens have no verification authority',
    );
    const winners = await Promise.all([
      recovery.confirm(challenge.digest, proof, 'winner-one'),
      recovery.confirm(sibling.digest, proof, 'winner-two'),
    ]);
    assert.equal(winners.filter(Boolean).length, 1);
    assert.equal(await recovery.lookup(sibling.digest), undefined);
    assert.equal(await sessions.renew(session.digest), undefined);
    const after = await snapshot(account.id);
    assert.deepEqual(
      after.accounts,
      baseline.accounts,
      'Reset changed verification/account fields',
    );
    assert.equal(after.account_email_verifications.length, 0);
    assert.equal(after.account_password_recoveries.length, 0);

    // Both lock orders are controlled by promises, not timing sleeps.
    for (const resetFirst of [false, true]) {
      const racing = await makeAccount(true),
        link = await issue(racing);
      const expected = await recovery.lookup(link.digest);
      const hold = paused(
        database,
        resetFirst ? 'UPDATE account_passwords ' : 'INSERT INTO account_sessions ',
      );
      const wait = observedLock(database);
      const operation = resetFirst
        ? new PostgresRecoveryRepository(hold.port).confirm(
            link.digest,
            expected,
            'replacement',
          )
        : makeSession(racing, new PostgresSessionRepository(hold.port));
      let contender;
      try {
        await Promise.race([
          hold.reached.promise,
          operation.then(() => {
            throw new Error('Expected transaction barrier not reached');
          }),
        ]);
        contender = resetFirst
          ? makeSession(racing, new PostgresSessionRepository(wait.port))
          : new PostgresRecoveryRepository(wait.port).confirm(
              link.digest,
              expected,
              'replacement',
            );
        await Promise.race([
          wait.attempted.promise,
          contender.then(() => {
            throw new Error('Expected account lock not attempted');
          }),
        ]);
      } finally {
        hold.release.resolve();
      }
      const [result, other] = await Promise.all([operation, contender]);
      if (resetFirst) {
        assert.equal(result, true);
        assert.equal(other.result, 'stale');
      } else {
        assert.equal(other, true);
        assert.equal(await sessions.renew(result.digest), undefined);
      }
    }
    for (const resetFirst of [false, true]) {
      const racing = await makeAccount(),
        link = await issue(racing),
        emailLink = await issue(racing, 'verification');
      const resetProof = await recovery.lookup(link.digest),
        emailProof = await verification.lookup(emailLink.digest);
      const hold = paused(
        database,
        resetFirst ? 'UPDATE account_passwords ' : 'UPDATE accounts SET',
      );
      const wait = observedLock(database);
      const operation = resetFirst
        ? new PostgresRecoveryRepository(hold.port).confirm(
            link.digest,
            resetProof,
            'replacement',
          )
        : new PostgresVerificationRepository(hold.port).confirm(
            emailLink.digest,
            emailProof,
          );
      let contender;
      try {
        await Promise.race([
          hold.reached.promise,
          operation.then(() => {
            throw new Error('Expected transaction barrier not reached');
          }),
        ]);
        contender = resetFirst
          ? new PostgresVerificationRepository(wait.port).confirm(
              emailLink.digest,
              emailProof,
            )
          : new PostgresRecoveryRepository(wait.port).confirm(
              link.digest,
              resetProof,
              'replacement',
            );
        await Promise.race([
          wait.attempted.promise,
          contender.then(() => {
            throw new Error('Expected account lock not attempted');
          }),
        ]);
      } finally {
        hold.release.resolve();
      }
      assert.equal(await operation, true);
      assert.equal(await contender, !resetFirst);
      const value = await snapshot(racing.id);
      assert.equal(value.accounts[0].email_verified_at !== null, !resetFirst);
    }
    const renewal = await makeAccount(true),
      renewalLink = await issue(renewal),
      renewalSession = await makeSession(renewal);
    await Promise.all([
      sessions.renew(renewalSession.digest),
      recovery.confirm(
        renewalLink.digest,
        await recovery.lookup(renewalLink.digest),
        'new',
      ),
    ]);
    assert.equal(await sessions.renew(renewalSession.digest), undefined);
    assert.deepEqual(await snapshot(sentinel.id), sentinelBaseline);
    assert.deepEqual(await schemaSnapshot(database), catalog);
    assert.deepEqual(await journalSnapshot(database), journal);
    return {
      resetRollbackBoundaries: 4,
      sessionRaceOrders: 2,
      verificationRaceOrders: 2,
      singleConsumption: true,
      expiryAndResend: true,
      renewalRevoked: true,
      sentinelsPreserved: true,
    };
  } finally {
    for (const row of [...rows.values()].reverse()) {
      assert.equal(
        row.confirmed,
        true,
        'Uncertain recovery fixture ownership; review required',
      );
      await database.transaction((client) =>
        client.query(`DELETE FROM ${row.table} WHERE id = $1`, [row.id]),
      );
    }
    await owner.cleanup();
  }
}
module.exports = { validateRecovery };
