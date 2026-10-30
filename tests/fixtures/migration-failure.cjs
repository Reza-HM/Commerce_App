const { realpathSync } = require('node:fs');
const { dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const {
  createGuardedDatabase,
  sqlState,
} = require('../../scripts/integration-support.cjs');
const {
  readMigrationHistory,
  applyMigrationHistory,
} = require('../../scripts/migration-history.cjs');

async function main() {
  const [schema, folder] = process.argv.slice(2);
  if (
    !/^validation_technical_[a-f0-9]{32}$/.test(schema ?? '') ||
    !folder ||
    dirname(realpathSync(folder)) !== realpathSync(tmpdir()) ||
    !/^commerce-migration-/.test(basename(folder)) ||
    realpathSync(folder) !== folder
  )
    throw new Error('Unsafe fixture');
  const database = createGuardedDatabase(process.env);
  try {
    await applyMigrationHistory(readMigrationHistory(folder), () => database, {
      migrationsSchema: schema,
    });
  } catch (error) {
    console.error(
      sqlState(error) === '42601'
        ? 'Expected migration failure'
        : 'Unexpected migration failure',
    );
    process.exitCode = 1;
  } finally {
    await database.close();
  }
}

main().catch(() => {
  console.error('Unexpected migration failure');
  process.exitCode = 1;
});
