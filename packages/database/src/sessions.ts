import type {Database} from './database';

export interface AccountCredential { readonly accountId: string; readonly passwordHash: string }
export interface SessionRepository {
  credential(email: string): Promise<AccountCredential | undefined>;
  create(id: string, accountId: string, digest: string): Promise<Date>;
  renew(digest: string): Promise<string | undefined>;
  revoke(digest: string): Promise<void>;
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly database: Pick<Database, 'transaction'>) {}

  credential(email: string): Promise<AccountCredential | undefined> {
    return this.database.transaction(async client => {
      await client.query('SELECT id FROM account_sessions LIMIT 0');
      const result = await client.query<{account_id: string; password_hash: string}>(
        'SELECT a.id AS account_id, p.password_hash FROM accounts a JOIN account_passwords p ON p.account_id = a.id WHERE a.email_normalized = $1', [email]);
      const row = result.rows[0];
      return row ? {accountId: row.account_id, passwordHash: row.password_hash} : undefined;
    });
  }

  create(id: string, accountId: string, digest: string): Promise<Date> {
    return this.database.transaction(async client => {
      const result = await client.query<{absolute_expires_at: Date}>(`INSERT INTO account_sessions (id, account_id, token_digest, issued_at, absolute_expires_at, last_activity_at)
        SELECT $1, $2, $3, now(), now() + interval '12 hours', now() RETURNING absolute_expires_at`, [id, accountId, digest]);
      return result.rows[0]!.absolute_expires_at;
    });
  }

  renew(digest: string): Promise<string | undefined> {
    return this.database.transaction(async client => {
      const result = await client.query<{account_id: string}>(`UPDATE account_sessions SET last_activity_at = GREATEST(last_activity_at, clock_timestamp())
        WHERE token_digest = $1 AND revoked_at IS NULL AND absolute_expires_at > clock_timestamp()
          AND last_activity_at + interval '30 minutes' > clock_timestamp() RETURNING account_id`, [digest]);
      return result.rows[0]?.account_id;
    });
  }

  revoke(digest: string): Promise<void> {
    return this.database.transaction(async client => {
      await client.query('UPDATE account_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE token_digest = $1', [digest]);
    });
  }
}
