import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { DatabaseConfiguration } from './configuration';

export type DatabaseEvent = 'database_connection_failure' | 'database_probe_failure';
export function poolOptions(config: DatabaseConfiguration): PoolConfig {
  return {
    ...config.connection,
    max: config.poolMaximum,
    connectionTimeoutMillis: Math.min(config.acquisitionTimeoutMs, 1000),
    statement_timeout: config.statementTimeoutMs,
    query_timeout: config.statementTimeoutMs,
    idleTimeoutMillis: 30000,
    application_name: 'commerce-foundation',
  };
}

export class Database {
  readonly orm;
  private probe: Promise<boolean> | undefined;
  private closing: Promise<void> | undefined;
  constructor(
    readonly config: DatabaseConfiguration,
    private readonly event: (event: DatabaseEvent) => void = () => undefined,
    private readonly pool: Pool = new Pool(poolOptions(config)),
  ) {
    this.orm = drizzle(this.pool);
    // pg removes idle clients when emitting pool errors. Never log the raw error.
    this.pool.on('error', () => this.event('database_connection_failure'));
    this.pool.on('connect', (client) =>
      client.on('error', () => this.event('database_connection_failure')),
    );
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  ready(): Promise<boolean> {
    if (this.closing) return Promise.resolve(false);
    if (!this.probe) {
      this.probe = this.check().finally(() => {
        this.probe = undefined;
      });
    }
    return this.probe;
  }

  private async check(): Promise<boolean> {
    // A short-lived probe pool would multiply connections. Bound the existing
    // pool's acquisition at min(configured timeout, 1s) during construction instead.
    const budget = 2000;
    const started = performance.now();
    let client: PoolClient | undefined;
    let expired = false;
    let timer: NodeJS.Timeout | undefined;
    try {
      const acquisition = this.pool.connect();
      // Pool connectionTimeoutMillis cancels its own queue. A tighter readiness
      // deadline also disposes any client delivered after the probe has expired.
      const acquired = acquisition.then((value) => {
        if (expired) {
          value.release(true);
          throw new Error('probe expired');
        }
        client = value;
        return value;
      });
      const operation = acquired.then(async (value) => {
        await value.query('SELECT 1');
        return true;
      });
      const deadline = new Promise<false>((resolve) => {
        timer = setTimeout(
          () => {
            expired = true;
            // Destroying the checked-out socket cancels a stalled query. Never
            // return a timed-out protocol stream to other consumers.
            if (client) {
              client.release(true);
              client = undefined;
            }
            resolve(false);
          },
          Math.max(1, budget - (performance.now() - started)),
        );
      });
      const ok = await Promise.race([operation, deadline]);
      if (!ok) this.event('database_probe_failure');
      return ok;
    } catch {
      this.event('database_probe_failure');
      if (client) {
        client.release(true);
        client = undefined;
      }
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      if (client) client.release();
    }
  }

  close(): Promise<void> {
    this.closing ??= this.pool.end();
    return this.closing;
  }
}
