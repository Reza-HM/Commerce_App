const {existsSync, readFileSync} = require('node:fs');
const {join} = require('node:path');
const {parseEnv} = require('node:util');

function databaseEnvironment(env, mode, filename = join(__dirname, '../.env')) {
  let local = {};
  try {
    if (existsSync(filename)) local = parseEnv(readFileSync(filename, 'utf8'));
  } catch {
    throw new Error('Invalid local database environment');
  }
  const result = {...env};
  for (const [key, value] of Object.entries(local)) {
    if (/^(DATABASE|TEST_DATABASE|MIGRATION_DATABASE)_(URL|POOL_MAX|ACQUIRE_TIMEOUT_MS|STATEMENT_TIMEOUT_MS)$/.test(key)
      && result[key] === undefined) result[key] = value;
  }
  result.NODE_ENV = mode === 'test' ? 'test' : result.NODE_ENV ?? mode;
  return result;
}

function commandEnvironment(command, env = process.env, filename) {
  if (!['test:integration', 'db:migrate', 'dev:api'].includes(command)) return env;
  return databaseEnvironment(env, command === 'test:integration' ? 'test' : 'development', filename);
}

module.exports = {databaseEnvironment, commandEnvironment};
