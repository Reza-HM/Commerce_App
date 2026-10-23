import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {rootCertificates} from 'node:tls';
import {ConfigurationError, readDatabaseConfiguration} from '@commerce/database';
import type {DatabasePrefix, Environment} from '@commerce/database';
import {readApiConfiguration} from '../../apps/api/src/configuration';

const valid: Environment = {NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:synthetic-password@localhost:5432/store'};

test('configuration has verified TLS and bounded defaults without connecting', () => {
  const configuration = readApiConfiguration(valid);
  expect(configuration.database.connection.ssl).toEqual({rejectUnauthorized: true});
  expect(configuration.database.poolMaximum).toBe(5);
  expect(configuration.database.acquisitionTimeoutMs).toBe(1000);
  expect(configuration.database.statementTimeoutMs).toBe(5000);
  expect(configuration.bodyLimitBytes).toBe(1024 * 1024);
  expect(configuration.headerLimitBytes).toBe(16 * 1024);
  expect(configuration.headerTimeoutMs).toBe(5000);
  expect(configuration.requestTimeoutMs).toBe(10000);
  expect(configuration.shutdownTimeoutMs).toBe(10000);
  expect(configuration.webOrigins).toEqual([]);
});

test.each<[string, string | undefined]>([
  ['NODE_ENV', undefined], ['NODE_ENV', 'prod'], ['DATABASE_URL', undefined],
  ['DATABASE_URL', 'https://synthetic-password@example.invalid/store'],
  ['DATABASE_URL', 'postgresql://test:synthetic-password@localhost/'],
  ['DATABASE_URL', 'postgresql://test:synthetic-password@localhost:99999/store'],
  ['DATABASE_URL', 'postgresql://test:synthetic-password@localhost/store?sslmode=disable'],
  ['DATABASE_URL', 'postgresql://test:synthetic-password@localhost/store?sslrootcert=synthetic-password'],
  ['DATABASE_TLS_MODE', 'unsafe'], ['NODE_TLS_REJECT_UNAUTHORIZED', '0'],
  ['DATABASE_POOL_MAX', '0'], ['DATABASE_ACQUIRE_TIMEOUT_MS', '-1'],
  ['DATABASE_STATEMENT_TIMEOUT_MS', 'Infinity'], ['DATABASE_POOL_MAX', '1.5'],
  ['DATABASE_POOL_MAX', '9007199254740992'], ['API_PORT', '65536'],
  ['API_BODY_LIMIT_BYTES', 'NaN'], ['API_HEADER_TIMEOUT_MS', '20000'],
  ['API_REQUEST_TIMEOUT_MS', '0'], ['API_SHUTDOWN_TIMEOUT_MS', '1e3'],
  ['WEB_ORIGINS', '*'], ['WEB_ORIGINS', 'null'],
  ['WEB_ORIGINS', 'https://example.invalid/path'],
  ['WEB_ORIGINS', 'https://test:synthetic-password@example.invalid']
])('rejects invalid %s without echoing values', (setting, value) => {
  try {
    readApiConfiguration({...valid, [setting]: value});
    throw new Error('Expected invalid configuration to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toBe(`Invalid or missing configuration: ${setting}`);
    expect((error as Error).stack).not.toContain('synthetic-password');
  }
});

test('only explicitly selected local non-production transport can be plaintext', () => {
  expect(readDatabaseConfiguration({...valid, DATABASE_TLS_MODE: 'local'}).connection.ssl).toBe(false);
  expect(() => readDatabaseConfiguration({...valid, NODE_ENV: 'production', DATABASE_TLS_MODE: 'local'})).toThrow(ConfigurationError);
  expect(() => readDatabaseConfiguration({...valid, DATABASE_URL: 'postgresql://test:synthetic-password@remote.invalid/store', DATABASE_TLS_MODE: 'local'})).toThrow(ConfigurationError);
});

test.each<DatabasePrefix>(['DATABASE', 'MIGRATION_DATABASE', 'TEST_DATABASE'])('%s rejects URL TLS overrides', prefix => {
  expect(() => readDatabaseConfiguration({...valid, [`${prefix}_URL`]: 'postgresql://test:synthetic-password@localhost/store?sslmode=require'}, prefix))
    .toThrow(new ConfigurationError(`${prefix}_URL`));
});

test('origins are exact, deduplicated HTTP origins', () => {
  expect(readApiConfiguration({...valid, WEB_ORIGINS: 'https://example.invalid,http://localhost:3000,https://example.invalid'}).webOrigins)
    .toEqual(['https://example.invalid', 'http://localhost:3000']);
});

test('explicit certificate bundles are parsed and file errors stay private', () => {
  const directory = mkdtempSync(join(tmpdir(), 'commerce-config-'));
  const certificateFile = join(directory, 'public-ca.pem');
  try {
    const certificate = rootCertificates[0];
    if (!certificate) throw new Error('Node trust store is unavailable');
    writeFileSync(certificateFile, certificate);
    expect(readDatabaseConfiguration({...valid, DATABASE_CA_FILE: certificateFile}).connection.ssl).toEqual({rejectUnauthorized: true, ca: certificate});
    writeFileSync(certificateFile, 'not a certificate');
    expect(() => readDatabaseConfiguration({...valid, DATABASE_CA_FILE: certificateFile})).toThrow(new ConfigurationError('DATABASE_CA_FILE'));
    expect(() => readDatabaseConfiguration({...valid, DATABASE_CA_FILE: join(directory, 'synthetic-password.pem')})).toThrow(new ConfigurationError('DATABASE_CA_FILE'));
  } finally {
    unlinkSync(certificateFile);
    rmdirSync(directory);
  }
});
