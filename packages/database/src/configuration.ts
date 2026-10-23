import {X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';

export type Environment = Readonly<Record<string, string | undefined>>;
export type RuntimeEnvironment = 'development' | 'test' | 'production';
export type DatabasePrefix = 'DATABASE' | 'MIGRATION_DATABASE' | 'TEST_DATABASE';

export class ConfigurationError extends Error {
  constructor(readonly setting: string) {
    super(`Invalid or missing configuration: ${setting}`);
    this.name = 'ConfigurationError';
  }
}

export interface DatabaseConfiguration {
  readonly environment: RuntimeEnvironment;
  readonly connection: Readonly<{
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: false | Readonly<{rejectUnauthorized: true; ca?: string}>;
  }>;
  readonly poolMaximum: number;
  readonly acquisitionTimeoutMs: number;
  readonly statementTimeoutMs: number;
}

function positiveInteger(env: Environment, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new ConfigurationError(name);
  }
  return value;
}

export function readRuntimeEnvironment(env: Environment): RuntimeEnvironment {
  const environment = env.NODE_ENV;
  if (environment !== 'development' && environment !== 'test' && environment !== 'production') {
    throw new ConfigurationError('NODE_ENV');
  }
  return environment;
}

function readCertificate(env: Environment, name: string): string | undefined {
  const filename = env[name];
  if (filename === undefined) return undefined;
  try {
    const pem = readFileSync(filename, 'utf8');
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!certificates?.length || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, '').trim()) {
      throw new Error('Invalid certificate bundle');
    }
    for (const certificate of certificates) new X509Certificate(certificate);
    return pem;
  } catch {
    throw new ConfigurationError(name);
  }
}

export function readDatabaseConfiguration(
  env: Environment,
  prefix: DatabasePrefix = 'DATABASE'
): DatabaseConfiguration {
  const environment = readRuntimeEnvironment(env);
  const urlSetting = `${prefix}_URL`;
  let url: URL;
  let database: string;
  let user: string;
  let password: string;
  try {
    url = new URL(env[urlSetting] ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2 || url.search || url.hash) {
      throw new Error('Invalid connection URL');
    }
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    if (![database, user, password].every(value => !value.includes('\0'))) throw new Error('Invalid connection value');
  } catch {
    throw new ConfigurationError(urlSetting);
  }

  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigurationError(urlSetting);
  const modeSetting = `${prefix}_TLS_MODE`;
  const mode = env[modeSetting] ?? 'verify-full';
  if (mode !== 'verify-full' && mode !== 'local') throw new ConfigurationError(modeSetting);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ConfigurationError('NODE_TLS_REJECT_UNAUTHORIZED');
  if (mode === 'local' && (environment === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new ConfigurationError(modeSetting);
  }
  const caSetting = `${prefix}_CA_FILE`;
  if (mode === 'local' && env[caSetting] !== undefined) throw new ConfigurationError(caSetting);
  const ca = mode === 'verify-full' ? readCertificate(env, caSetting) : undefined;
  const ssl = mode === 'local' ? false : Object.freeze({rejectUnauthorized: true as const, ...(ca === undefined ? {} : {ca})});

  return Object.freeze({
    environment,
    connection: Object.freeze({host: url.hostname.replace(/^\[|\]$/g, ''), port, database, user, password, ssl}),
    poolMaximum: positiveInteger(env, `${prefix}_POOL_MAX`, 5),
    acquisitionTimeoutMs: positiveInteger(env, `${prefix}_ACQUIRE_TIMEOUT_MS`, 1000),
    statementTimeoutMs: positiveInteger(env, `${prefix}_STATEMENT_TIMEOUT_MS`, 5000)
  });
}
