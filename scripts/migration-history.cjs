const {existsSync, readFileSync} = require('node:fs');
const {join} = require('node:path');
const {migrate} = require('drizzle-orm/node-postgres/migrator');

function readMigrationHistory(folder) {
  const journal = join(folder, 'meta/_journal.json');
  // Preserve the operator command's existing empty/missing-history no-op.
  if (!existsSync(journal)) return {folder, count: 0};
  const {entries} = JSON.parse(readFileSync(journal, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid migration journal');
  return {folder, count: entries.length};
}

async function applyMigrationHistory(history, getDatabase, options = {}, migrator = migrate) {
  // Drizzle creates journal metadata even with zero entries. Do not invoke it
  // for empty history, and do not create a pool just to report a no-op.
  if (history.count === 0) return {empty: true, count: 0};
  const database = await getDatabase();
  await migrator(database.orm, {...options, migrationsFolder: history.folder});
  // This is history length, not a claim about how many entries were pending.
  return {empty: false, count: history.count};
}

module.exports = {readMigrationHistory, applyMigrationHistory};
