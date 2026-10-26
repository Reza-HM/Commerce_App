const assert = require('node:assert/strict');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const {sql} = require('drizzle-orm');
const {ConfigurationError} = require('@commerce/database');
const {createGuardedDatabase, withCleanup, cleanupAll, sqlState} = require('./integration-support.cjs');
const {readMigrationHistory, applyMigrationHistory} = require('./migration-history.cjs');
const {OwnedSchema, OwnedDirectory, schemaSnapshot, journalSnapshot, relationExists} = require('./integration-fixtures.cjs');
const {validateApplicationHistory} = require('./integration-migrations.cjs');
const {validateAccountRepository, validateAccountSentinels, validateAccountHttp} = require('./integration-accounts.cjs');
const {validateSessions} = require('./integration-sessions.cjs');

class ExpectedWorkerFailure extends Error {}

async function validateSentinels(database) {
  const sentinel = new OwnedSchema(database, 'sentinel');
  let preserved = false;
  try {
    await sentinel.create();
    const table = sentinel.table('sentinel');
    await database.orm.execute(`CREATE TABLE ${table} (id integer PRIMARY KEY, payload text NOT NULL)`);
    await database.orm.execute(`INSERT INTO ${table} VALUES (1,'unchanged alpha'),(2,'unchanged beta')`);
    const definition = await schemaSnapshot(database, sentinel.schema);
    const baseline = (await database.orm.execute(`SELECT id,payload FROM ${table} ORDER BY id`)).rows;
    for (const fails of [false, true]) {
      const worker = new OwnedSchema(database, 'worker');
      const operation = () => withCleanup(async () => {
        await worker.create();
        const fixture = worker.table('fixture');
        await database.orm.execute(`CREATE TABLE ${fixture} (id integer PRIMARY KEY, payload text NOT NULL)`);
        worker.trackRecord(worker.schema, 'fixture', 'id', 1);
        await database.orm.execute(`INSERT INTO ${fixture} VALUES (1,'committed before cleanup')`);
        worker.confirmRecord(worker.schema, 'fixture', 'id', 1);
        if (fails) throw new ExpectedWorkerFailure('Deliberate worker failure');
      }, () => worker.cleanup());
      if (fails) {
        let expected = false;
        try { await operation(); }
        catch (error) {
          if (!(error instanceof ExpectedWorkerFailure)) throw error;
          expected = true;
        }
        assert.equal(expected, true, 'Expected worker failure did not occur');
      } else await operation();
      const remaining = await database.orm.execute(sql`SELECT 1 FROM pg_namespace WHERE nspname=${worker.schema}`);
      assert.equal(remaining.rows.length, 0, 'Worker schema was not cleaned');
      assert.deepEqual(await schemaSnapshot(database, sentinel.schema), definition, 'Sentinel definition changed');
      assert.deepEqual((await database.orm.execute(`SELECT id,payload FROM ${table} ORDER BY id`)).rows, baseline, 'Sentinel contents changed');
    }
    preserved = true;
  } finally {
    if (preserved) await cleanupAll([() => sentinel.cleanup()]);
    else if (sentinel.created) console.error(`Sentinel retained for inspection: ${sentinel.schema}`);
  }
  return {successfulWorker: true, failingWorker: true};
}

function fixtureHistory(directory, failing) {
  const entries = [{idx: 0, version: '7', when: 1, tag: '0000_fixture', breakpoints: true}];
  if (failing) entries.push({idx: 1, version: '7', when: 2, tag: '0001_invalid', breakpoints: true});
  directory.write('meta/_journal.json', JSON.stringify({version: '7', dialect: 'postgresql', entries}));
  return readMigrationHistory(directory.folder);
}

async function validateTechnicalMigrations(database, env) {
  const owner = new OwnedSchema(database, 'technical');
  const directory = new OwnedDirectory();
  return withCleanup(async () => {
    await owner.create();
    const table = owner.table('fixture');
    await database.orm.execute(`CREATE TABLE ${table} (value integer PRIMARY KEY)`);
    await database.transaction(client => client.query(`INSERT INTO ${table} VALUES ($1)`, [1]));
    const rollback = new Error('Deliberate transaction rollback');
    await assert.rejects(database.transaction(async client => {
      await client.query(`INSERT INTO ${table} VALUES ($1)`, [2]);
      throw rollback;
    }), error => error === rollback);
    await database.transaction(client => client.query(`INSERT INTO ${table} VALUES ($1)`, [3]));
    const rows = async () => (await database.orm.execute(`SELECT value FROM ${table} ORDER BY value`)).rows;
    assert.deepEqual(await rows(), [{value: 1}, {value: 3}]);

    directory.write('0000_fixture.sql', `INSERT INTO ${table} VALUES (42);`);
    const valid = fixtureHistory(directory, false);
    owner.table('__drizzle_migrations');
    const options = {migrationsSchema: owner.schema};
    await applyMigrationHistory(valid, () => database, options);
    const journal = await journalSnapshot(database, owner.schema);
    assert.equal(journal.length, 1);
    const baseline = await rows();
    assert.deepEqual(baseline, [{value: 1}, {value: 3}, {value: 42}]);
    await applyMigrationHistory(valid, () => database, options);
    assert.deepEqual(await rows(), baseline);
    assert.deepEqual(await journalSnapshot(database, owner.schema), journal);

    const partial = owner.table('partial');
    directory.write('0001_invalid.sql', [
      `INSERT INTO ${table} VALUES (43);`,
      `CREATE TABLE ${partial} (value integer);`,
      'THIS IS NOT SQL;'
    ].join('\n--> statement-breakpoint\n'));
    const failing = fixtureHistory(directory, true);
    await assert.rejects(applyMigrationHistory(failing, () => database, options), error => sqlState(error) === '42601');
    const assertRollback = async () => {
      assert.deepEqual(await rows(), baseline, 'Failed migration write survived');
      assert.equal(await relationExists(database, owner.schema, 'partial'), false, 'Failed migration DDL survived');
      assert.deepEqual(await journalSnapshot(database, owner.schema), journal, 'Failed migration journal changed');
      assert.equal((await database.transaction(client => client.query('SELECT 17 AS value'))).rows[0].value, 17);
    };
    await assertRollback();
    const child = spawnSync(process.execPath, [join(__dirname, '../tests/fixtures/migration-failure.cjs'), owner.schema, directory.folder], {
      env: {...env, NODE_ENV: 'test'}, encoding: 'utf8', shell: false, timeout: 15000, maxBuffer: 16384
    });
    assert.equal(child.error, undefined, 'Migration child failed to execute');
    assert.equal(child.signal, null);
    assert.equal(child.status, 1, 'Failed migration child must exit nonzero');
    assert.equal(child.stderr.trim(), 'Expected migration failure', 'Migration child reported an unexpected failure');
    await assertRollback();
    return {commit: true, rollback: true, replay: true, failedMigrationRollback: true, childExit: 1};
  }, () => cleanupAll([() => owner.cleanup(), () => directory.cleanup()]));
}

async function main(env = process.env) {
  const database = createGuardedDatabase(env);
  return withCleanup(async () => {
    assert.equal(await database.ready(), true, 'Local test database unavailable');
    const server = (await database.orm.execute('SELECT current_database() AS database, current_setting(\'server_version\') AS version')).rows[0];
    assert.equal(server.database, database.config.connection.database, 'Unexpected test database');
    const application = await validateApplicationHistory(database, join(__dirname, '../packages/database/migrations'), {requireAccounts: true});
    const applicationState = await schemaSnapshot(database);
    const applicationJournal = await journalSnapshot(database);
    const sentinel = await validateSentinels(database);
    const technical = await validateTechnicalMigrations(database, env);
    const accounts = await validateAccountRepository(database);
    const accountSentinel = await validateAccountSentinels(database);
    const accountHttp = await validateAccountHttp(database, env);
    const sessions = await validateSessions(database, env);
    assert.deepEqual(await schemaSnapshot(database), applicationState, 'Fixture cleanup changed unrelated schema state');
    assert.deepEqual(await journalSnapshot(database), applicationJournal, 'Fixture cleanup changed application migration history');
    const evidence = {date: new Date().toISOString().slice(0, 10), platform: process.platform, node: process.version,
      postgres: server.version, database: server.database, transport: 'local plaintext', application, sentinel, technical, accounts, accountSentinel, accountHttp, sessions};
    console.log(JSON.stringify(evidence));
    console.log(application.empty
      ? 'Live database integration passed. Empty application history is not non-empty account migration coverage.'
      : `Live database integration passed: ${application.count} application migrations replayed.`);
    return evidence;
  }, () => database.close());
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof ConfigurationError ? error.message : error instanceof AggregateError
      ? 'Live database integration failed: fixture/resource cleanup incomplete.' : 'Live database integration failed.');
    process.exitCode = 1;
  });
}

module.exports = {main, validateSentinels, validateTechnicalMigrations, ExpectedWorkerFailure};
