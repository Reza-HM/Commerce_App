import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { AccountRepository } from '../../packages/database/src/accounts';
import { Database } from '../../packages/database/src/database';
import { readDatabaseConfiguration } from '../../packages/database/src/configuration';

const input = {
  id: '11111111-1111-4111-8111-111111111111',
  emailNormalized: "o'hara@example.com",
  passwordHash: 'synthetic-test-credential',
};

function harness(failure?: string, duplicate = false) {
  const error = Object.assign(Error('PRIVATE_DRIVER_ERROR'), { code: '23505' });
  const query = jest.fn(async (statement: string, _parameters?: unknown[]) => {
    void _parameters;
    if (statement === failure || statement.startsWith(failure ?? '\0')) throw error;
    return {
      rows:
        statement.startsWith('INSERT INTO accounts ') && !duplicate
          ? [{ id: input.id }]
          : [],
    };
  });
  const client = { query, release: jest.fn() };
  const pool = Object.assign(new EventEmitter(), {
    connect: jest.fn(async () => client),
    end: jest.fn(),
  });
  const config = readDatabaseConfiguration({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/repository_test',
  });
  const database = new Database(config, undefined, pool as unknown as Pool);
  return { repository: new AccountRepository(database), client, pool, error };
}

test('pair creation commits with bound input and releases its existing pool connection', async () => {
  const h = harness();
  await expect(h.repository.create(input)).resolves.toEqual({
    kind: 'created',
    id: input.id,
  });
  expect(h.client.query.mock.calls.map((call) => call[0])).toEqual([
    'BEGIN',
    'SELECT account_id FROM account_passwords LIMIT 0',
    'INSERT INTO accounts (id, email_normalized) VALUES ($1, $2) ON CONFLICT (email_normalized) DO NOTHING RETURNING id',
    'INSERT INTO account_passwords (account_id, password_hash) VALUES ($1, $2)',
    'COMMIT',
  ]);
  expect(h.client.query).toHaveBeenNthCalledWith(
    3,
    expect.not.stringContaining(input.emailNormalized),
    [input.id, input.emailNormalized],
  );
  expect(h.client.query).toHaveBeenNthCalledWith(4, expect.any(String), [
    input.id,
    input.passwordHash,
  ]);
  expect(h.pool.connect).toHaveBeenCalledTimes(1);
  expect(h.client.release).toHaveBeenCalledWith(false);
});

test('email conflict performs no credential insertion or update and commits an existing result', async () => {
  const h = harness(undefined, true);
  await expect(h.repository.create(input)).resolves.toEqual({ kind: 'existing' });
  expect(h.client.query.mock.calls.map((call) => call[0])).toEqual([
    'BEGIN',
    'SELECT account_id FROM account_passwords LIMIT 0',
    expect.stringContaining('ON CONFLICT (email_normalized) DO NOTHING'),
    'COMMIT',
  ]);
  expect(h.client.release).toHaveBeenCalledWith(false);
});

test.each([false, true])(
  'a missing credential relation fails for existing=%s before uniqueness resolution',
  async (duplicate) => {
    const h = harness('SELECT account_id FROM account_passwords LIMIT 0', duplicate);
    await expect(h.repository.create(input)).rejects.toBe(h.error);
    expect(h.client.query.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN',
      'SELECT account_id FROM account_passwords LIMIT 0',
      'ROLLBACK',
    ]);
  },
);

test.each(['INSERT INTO accounts ', 'INSERT INTO account_passwords ', 'COMMIT'])(
  'failure at %s is not duplicate success and rolls back',
  async (failure) => {
    const h = harness(failure);
    await expect(h.repository.create(input)).rejects.toBe(h.error);
    expect(h.client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(h.client.release).toHaveBeenCalledWith(false);
  },
);

test('failed rollback discards the checked out connection without hiding the original error', async () => {
  const h = harness('INSERT INTO account_passwords ');
  const original = h.client.query.getMockImplementation()!;
  h.client.query.mockImplementation(async (statement) => {
    if (statement === 'ROLLBACK') throw Error('rollback unavailable');
    return original(statement);
  });
  await expect(h.repository.create(input)).rejects.toBe(h.error);
  expect(h.client.release).toHaveBeenCalledWith(true);
});
