import {ConfigurationError, readDatabaseConfiguration} from './configuration';
import type {DatabaseConfiguration, Environment} from './configuration';

export function guardedTestConfiguration(env: Environment): DatabaseConfiguration {
  if (env.NODE_ENV !== 'test') throw new ConfigurationError('NODE_ENV');
  const test = readDatabaseConfiguration(env, 'TEST_DATABASE');
  if (test.connection.ssl === false) throw new ConfigurationError('TEST_DATABASE_TLS_MODE');
  for (const prefix of ['DATABASE', 'MIGRATION_DATABASE'] as const) {
    if (!env[`${prefix}_URL`]) continue;
    const other = readDatabaseConfiguration(env, prefix);
    const a = test.connection;
    const b = other.connection;
    const host = (value: string) => value.toLowerCase().replace(/\.$/, '').replace(/^(localhost|127\.0\.0\.1|::1)$/, 'loopback');
    if (host(a.host) === host(b.host) && a.port === b.port && a.database === b.database) {
      throw new ConfigurationError('TEST_DATABASE_URL (must be a dedicated target)');
    }
  }
  return test;
}
