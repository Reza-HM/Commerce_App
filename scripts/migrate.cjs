const {existsSync, readFileSync} = require('node:fs');
const {join} = require('node:path');
const {Database, readDatabaseConfiguration, ConfigurationError} = require('@commerce/database');
const {migrate} = require('drizzle-orm/node-postgres/migrator');

async function main() {
  const config = readDatabaseConfiguration(process.env, 'MIGRATION_DATABASE');
  const folder = join(__dirname, '../packages/database/migrations');
  const journal = join(folder, 'meta/_journal.json');
  if (!existsSync(journal) || JSON.parse(readFileSync(journal, 'utf8')).entries.length === 0) {
    console.log('No pending migrations.');
    return;
  }
  const database = new Database(config);
  try { await migrate(database.orm, {migrationsFolder: folder}); }
  finally { await database.close(); }
}
main().catch(error => {
  console.error(error instanceof ConfigurationError ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
