const assert = require('node:assert/strict');
const {readMigrationFiles} = require('drizzle-orm/migrator');
const {readMigrationHistory, applyMigrationHistory} = require('./migration-history.cjs');
const {schemaSnapshot, journalSnapshot} = require('./integration-fixtures.cjs');

async function capture(database, operation) {
  database.takeQueries();
  await operation();
  return database.takeQueries();
}

function assertAccountSchema(snapshot) {
  const accounts = snapshot.find(row => row.schema === 'public' && row.name === 'accounts');
  const passwords = snapshot.find(row => row.schema === 'public' && row.name === 'account_passwords');
  const sessions = snapshot.find(row => row.schema === 'public' && row.name === 'account_sessions');
  assert.ok(accounts && passwords && sessions, 'Account migration tables missing');
  assert.equal(accounts.columns.length, 4, 'Unexpected account columns');
  assert.equal(passwords.columns.length, 2, 'Unexpected credential columns');
  assert.equal(sessions.columns.length, 7, 'Unexpected session columns');
  for (const name of ['account_sessions_pkey', 'account_sessions_token_digest_key', 'account_sessions_digest_check', 'account_sessions_expiry_check', 'account_sessions_activity_check']) {
    assert.ok(sessions.constraints.some(value => value.startsWith(name + ':')), 'Session constraint missing');
  }
  assert.ok(sessions.constraints.some(value => value.includes('FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT')), 'Session FK missing');
  for (const name of ['accounts_pkey', 'accounts_email_normalized_key', 'accounts_email_canonical_check']) {
    assert.ok(accounts.constraints.some(value => value.startsWith(name + ':')), 'Account constraint missing');
  }
  assert.ok(passwords.constraints.some(value => value.includes('FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT')), 'Credential FK missing');
  assert.ok(passwords.constraints.some(value => value.startsWith('account_passwords_pkey:')), 'Credential primary key missing');
}

async function validateApplicationHistory(database, folder, {apply = applyMigrationHistory, requireAccounts = false} = {}) {
  const history = readMigrationHistory(folder);
  const before = await schemaSnapshot(database);
  const beforeJournal = await journalSnapshot(database);
  if (requireAccounts) assert.ok(history.count > 0, 'Non-empty account history required');
  const freshInstall = before.length === 0 && beforeJournal.length === 0;
  const first = await capture(database, () => apply(history, () => database));
  const after = await schemaSnapshot(database);
  const journal = await journalSnapshot(database);
  if (requireAccounts) assertAccountSchema(after);
  const second = await capture(database, () => apply(history, () => database));
  assert.deepEqual(await schemaSnapshot(database), after, 'Application schema changed on replay');
  assert.deepEqual(await journalSnapshot(database), journal, 'Application journal changed on replay');
  if (history.count === 0) {
    assert.deepEqual(first, []); assert.deepEqual(second, []);
    assert.deepEqual(after, before); assert.deepEqual(journal, beforeJournal);
  } else {
    const files = readMigrationFiles({migrationsFolder: folder});
    assert.equal(journal.length, files.length, 'Application migration history mismatch');
    assert.deepEqual(journal.map(row => [row.hash, String(row.created_at)]), files.map(file => [file.hash, String(file.folderMillis)]));
    const applicationStatements = new Set(files.flatMap(file => file.sql.map(statement => statement.trim())));
    assert.equal(second.filter(query => applicationStatements.has(query.trim())).length, 0, 'Application statements repeated');
  }
  return {count: history.count, empty: history.count === 0, ...(requireAccounts ? {freshInstall} : {})};
}

module.exports = {validateApplicationHistory, assertAccountSchema};
