const assert = require('node:assert/strict');
const {readMigrationFiles} = require('drizzle-orm/migrator');
const {readMigrationHistory, applyMigrationHistory} = require('./migration-history.cjs');
const {schemaSnapshot, journalSnapshot} = require('./integration-fixtures.cjs');

async function capture(database, operation) {
  database.takeQueries();
  await operation();
  return database.takeQueries();
}

async function validateApplicationHistory(database, folder, {apply = applyMigrationHistory} = {}) {
  const history = readMigrationHistory(folder);
  const before = await schemaSnapshot(database);
  const beforeJournal = await journalSnapshot(database);
  const first = await capture(database, () => apply(history, () => database));
  const after = await schemaSnapshot(database);
  const journal = await journalSnapshot(database);
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
  return {count: history.count, empty: history.count === 0};
}

module.exports = {validateApplicationHistory};
