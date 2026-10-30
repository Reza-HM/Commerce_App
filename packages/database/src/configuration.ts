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
    ssl: false;
  }>;
  readonly poolMaximum: number;
  readonly acquisitionTimeoutMs: number;
  readonly statementTimeoutMs: number;
}

function positiveInteger(env: Environment, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new ConfigurationError(name);
  }
  return value;
}

export function readRuntimeEnvironment(env: Environment): RuntimeEnvironment {
  const environment = env.NODE_ENV;
  if (
    environment !== 'development' &&
    environment !== 'test' &&
    environment !== 'production'
  ) {
    throw new ConfigurationError('NODE_ENV');
  }
  return environment;
}

export function readDatabaseConfiguration(
  env: Environment,
  prefix: DatabasePrefix = 'DATABASE',
): DatabaseConfiguration {
  const environment = readRuntimeEnvironment(env);
  const urlSetting = `${prefix}_URL`;
  let url: URL;
  let database: string;
  let user: string;
  let password: string;
  try {
    url = new URL(env[urlSetting] ?? '');
    const options = [...url.searchParams];
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.username ||
      url.pathname.length < 2 ||
      url.hash ||
      !['localhost', '127.0.0.1', '[::1]'].includes(host) ||
      options.length > 1 ||
      options.some(([key, value]) => key !== 'sslmode' || value !== 'disable')
    ) {
      throw new Error('Invalid connection URL');
    }
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    if (![database, user, password].every((value) => !value.includes('\0')))
      throw new Error('Invalid connection value');
  } catch {
    throw new ConfigurationError(urlSetting);
  }

  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ConfigurationError(urlSetting);
  // Local plaintext is the explicit owner-approved contract. Do not silently
  // interpret obsolete settings as a promise that encryption is enabled.
  for (const suffix of ['TLS_MODE', 'CA_FILE']) {
    if (env[`${prefix}_${suffix}`] !== undefined)
      throw new ConfigurationError(`${prefix}_${suffix}`);
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw new ConfigurationError('NODE_TLS_REJECT_UNAUTHORIZED');

  return Object.freeze({
    environment,
    connection: Object.freeze({
      host: url.hostname
        .toLowerCase()
        .replace(/\.$/, '')
        .replace(/^\[|\]$/g, ''),
      port,
      database,
      user,
      password,
      ssl: false as const,
    }),
    poolMaximum: positiveInteger(env, `${prefix}_POOL_MAX`, 5),
    acquisitionTimeoutMs: positiveInteger(env, `${prefix}_ACQUIRE_TIMEOUT_MS`, 1000),
    statementTimeoutMs: positiveInteger(env, `${prefix}_STATEMENT_TIMEOUT_MS`, 5000),
  });
}
