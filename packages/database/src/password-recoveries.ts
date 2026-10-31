import type { Database } from './database';

export interface RecoveryProof {
  readonly accountId: string;
  readonly emailNormalized: string;
  readonly passwordHash: string;
}
export interface RecoveryRepository {
  issue(email: string, id: string, digest: string): Promise<boolean>;
  lookup(digest: string): Promise<RecoveryProof | undefined>;
  confirm(digest: string, proof: RecoveryProof, passwordHash: string): Promise<boolean>;
}

export class PostgresRecoveryRepository implements RecoveryRepository {
  constructor(private readonly database: Pick<Database, 'transaction'>) {}

  issue(email: string, id: string, digest: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      // Unknown addresses still require the complete issuance schema.
      await client.query('SELECT id FROM account_password_recoveries LIMIT 0');
      await client.query('SELECT account_id FROM account_passwords LIMIT 0');
      const account = await client.query<{ id: string }>(
        'SELECT id FROM accounts WHERE email_normalized = $1 FOR UPDATE',
        [email],
      );
      const row = account.rows[0];
      if (!row) return false;
      await client.query(
        'DELETE FROM account_password_recoveries WHERE account_id = $1 AND expires_at <= clock_timestamp()',
        [row.id],
      );
      const result = await client.query(
        `INSERT INTO account_password_recoveries (id, account_id, token_digest, issued_at, expires_at)
         SELECT $1, $2, $3, t, t + interval '30 minutes' FROM (SELECT clock_timestamp() AS t) clock
         WHERE (SELECT count(*) FROM account_password_recoveries WHERE account_id = $2) < 3
           AND NOT EXISTS (SELECT 1 FROM account_password_recoveries WHERE account_id = $2 AND issued_at + interval '60 seconds' > clock.t)
         RETURNING id`,
        [id, row.id, digest],
      );
      return result.rows.length === 1;
    });
  }

  lookup(digest: string): Promise<RecoveryProof | undefined> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{
        account_id: string;
        email_normalized: string;
        password_hash: string;
      }>(
        `SELECT a.id AS account_id, a.email_normalized, p.password_hash FROM account_password_recoveries r
         JOIN accounts a ON a.id = r.account_id JOIN account_passwords p ON p.account_id = a.id
         WHERE r.token_digest = $1 AND r.expires_at > clock_timestamp()`,
        [digest],
      );
      const row = result.rows[0];
      return row
        ? {
            accountId: row.account_id,
            emailNormalized: row.email_normalized,
            passwordHash: row.password_hash,
          }
        : undefined;
    });
  }

  confirm(digest: string, proof: RecoveryProof, passwordHash: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      // Every credential mutation/session insertion takes these locks in this order.
      const account = await client.query(
        'SELECT id FROM accounts WHERE id = $1 FOR UPDATE',
        [proof.accountId],
      );
      if (!account.rows[0]) return false;
      const credential = await client.query(
        'SELECT account_id FROM account_passwords WHERE account_id = $1 AND password_hash = $2 FOR UPDATE',
        [proof.accountId, proof.passwordHash],
      );
      if (!credential.rows[0]) return false;
      const token = await client.query(
        'SELECT id FROM account_password_recoveries WHERE account_id = $1 AND token_digest = $2 AND expires_at > clock_timestamp() FOR UPDATE',
        [proof.accountId, digest],
      );
      if (!token.rows[0]) return false;
      await client.query(
        'UPDATE account_passwords SET password_hash = $2 WHERE account_id = $1',
        [proof.accountId, passwordHash],
      );
      await client.query(
        'UPDATE account_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE account_id = $1',
        [proof.accountId],
      );
      await client.query(
        'DELETE FROM account_email_verifications WHERE account_id = $1',
        [proof.accountId],
      );
      await client.query(
        'DELETE FROM account_password_recoveries WHERE account_id = $1',
        [proof.accountId],
      );
      return true;
    });
  }
}
