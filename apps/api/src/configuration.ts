import {ConfigurationError, readDatabaseConfiguration, guardedTestConfiguration} from '@commerce/database';
import type {DatabaseConfiguration, Environment} from '@commerce/database';

export interface ApiConfiguration {
  readonly database: DatabaseConfiguration;
  readonly port: number;
  readonly webOrigins: readonly string[];
  readonly bodyLimitBytes: number;
  readonly headerLimitBytes: number;
  readonly headerTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
}

function positiveInteger(env: Environment, setting: string, fallback: number, maximum = 2_147_483_647): number {
  const raw = env[setting];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new ConfigurationError(setting);
  return value;
}

function readOrigins(env: Environment): readonly string[] {
  if (env.WEB_ORIGINS === undefined || env.WEB_ORIGINS === '') return Object.freeze([]);
  const origins = env.WEB_ORIGINS.split(',').map(value => value.trim());
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Invalid origin');
    } catch {
      throw new ConfigurationError('WEB_ORIGINS');
    }
  }
  return Object.freeze([...new Set(origins)]);
}

export function readApiConfiguration(env: Environment): ApiConfiguration {
  const database = env.NODE_ENV === 'test' ? guardedTestConfiguration(env) : readDatabaseConfiguration(env);
  const headerTimeoutMs = positiveInteger(env, 'API_HEADER_TIMEOUT_MS', 5000);
  const requestTimeoutMs = positiveInteger(env, 'API_REQUEST_TIMEOUT_MS', 10000);
  if (headerTimeoutMs > requestTimeoutMs) throw new ConfigurationError('API_HEADER_TIMEOUT_MS');
  return Object.freeze({
    database,
    port: positiveInteger(env, 'API_PORT', 3001, 65535),
    webOrigins: readOrigins(env),
    bodyLimitBytes: positiveInteger(env, 'API_BODY_LIMIT_BYTES', 1024 * 1024),
    headerLimitBytes: positiveInteger(env, 'API_HEADER_LIMIT_BYTES', 16 * 1024),
    headerTimeoutMs,
    requestTimeoutMs,
    shutdownTimeoutMs: positiveInteger(env, 'API_SHUTDOWN_TIMEOUT_MS', 10000)
  });
}
