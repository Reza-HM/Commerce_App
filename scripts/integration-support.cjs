const {Database, guardedTestConfiguration, poolOptions} = require('@commerce/database');
const {Pool} = require('pg');
const {drizzle} = require('drizzle-orm/node-postgres');

function observedDatabase(config) {
  const pool = new Pool(poolOptions(config));
  const database = new Database(config, undefined, pool);
  let queries = [];
  return {
    config,
    orm: drizzle(pool, {logger: {logQuery(query) { queries.push(query); }}}),
    ready: () => database.ready(),
    transaction: work => database.transaction(work),
    close: () => database.close(),
    takeQueries() { const result = queries; queries = []; return result; }
  };
}

function createGuardedDatabase(env, factory = observedDatabase) {
  // No client/pool may exist until every configuration/target check has passed.
  const config = guardedTestConfiguration(env);
  return factory(config);
}

async function withCleanup(work, cleanup) {
  let primary;
  try { return await work(); }
  catch (error) { primary = error; throw error; }
  finally {
    try { await cleanup(); }
    catch (error) { throw new AggregateError(primary ? [primary, error] : [error], 'Fixture cleanup failed'); }
  }
}

async function cleanupAll(operations) {
  const errors = [];
  for (const operation of operations) {
    try { await operation(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed');
}

function sqlState(error) {
  for (let depth = 0; error && depth < 5; depth++, error = error.cause) {
    if (typeof error.code === 'string') return error.code;
  }
}

module.exports = {createGuardedDatabase, withCleanup, cleanupAll, sqlState};
