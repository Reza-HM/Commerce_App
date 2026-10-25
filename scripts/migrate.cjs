const {join} = require('node:path');
const {Database, readDatabaseConfiguration, guardedTestConfiguration, ConfigurationError} = require('@commerce/database');
const {readMigrationHistory, applyMigrationHistory} = require('./migration-history.cjs');

async function runMigrations(env = process.env, {
  folder = join(__dirname, '../packages/database/migrations'),
  createDatabase = config => new Database(config),
  migrator,
  report = message => console.log(message)
} = {}) {
  // Configuration/target ownership stays here, never in the shared SQL helper.
  const config = env.NODE_ENV === 'test' ? guardedTestConfiguration(env) : readDatabaseConfiguration(env);
  const history = readMigrationHistory(folder);
  let database;
  try {
    const result = await applyMigrationHistory(history, () => database ??= createDatabase(config), {}, migrator);
    if (result.empty) report('No pending migrations.');
    return result;
  } finally {
    if (database) await database.close();
  }
}

if (require.main === module) {
  runMigrations().catch(error => {
    console.error(error instanceof ConfigurationError ? error.message : 'Migration failed.');
    process.exitCode = 1;
  });
}

module.exports = {runMigrations};
