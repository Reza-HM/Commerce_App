import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DatabaseConfiguration, Environment } from '@commerce/database';

const loadScript = createRequire(resolve('package.json'));
const { createGuardedDatabase } = loadScript('./scripts/integration-support.cjs') as {
  createGuardedDatabase<T>(
    env: Environment,
    factory: (config: DatabaseConfiguration) => T,
  ): T;
};

test.each([
  {},
  { NODE_ENV: 'development', TEST_DATABASE_URL: 'postgres://user:secret@localhost/test' },
  {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: 'postgres://user:secret@localhost/test',
    TEST_DATABASE_TLS_MODE: 'local',
  },
  {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: 'postgres://user:secret@localhost/test',
    MIGRATION_DATABASE_URL: 'postgres://other:other@127.0.0.1/test',
  },
])('preflight rejects unsafe input before the injected client factory runs', (values) => {
  const factory = jest.fn();
  expect(() => createGuardedDatabase(values, factory)).toThrow(
    'Invalid or missing configuration',
  );
  expect(factory).not.toHaveBeenCalled();
});

test('preflight passes only validated bounded local configuration to the client factory', () => {
  const factory = jest.fn((config) => ({ config }));
  const result = createGuardedDatabase(
    { NODE_ENV: 'test', TEST_DATABASE_URL: 'postgres://user:secret@localhost/test' },
    factory,
  );
  expect(factory).toHaveBeenCalledTimes(1);
  expect(result.config).toMatchObject({
    environment: 'test',
    poolMaximum: 5,
    connection: { ssl: false },
  });
});
