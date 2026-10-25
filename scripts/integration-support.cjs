const {Database, guardedTestConfiguration} = require('@commerce/database');

function createGuardedDatabase(env, factory = config => new Database(config)) {
  // No client/pool may exist until every configuration/target check has passed.
  const config = guardedTestConfiguration(env);
  return factory(config);
}

module.exports = {createGuardedDatabase};
