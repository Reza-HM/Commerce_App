import type { Database } from './database';

export interface VerificationProof {
  readonly accountId: string;
  readonly passwordHash: string;
}
export interface VerificationRepository {
  issue(email: string, id: string, digest: string): Promise<boolean>;
  lookup(digest: string): Promise<VerificationProof | undefined>;
  confirm(digest: string, proof: VerificationProof): Promise<boolean>;
}

export class PostgresVerificationRepository implements VerificationRepository {
  constructor(private readonly database: Pick<Database, 'transaction'>) {}

  issue(email: string, id: string, digest: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      // Check required relations even for unknown/verified addresses.
      await client.query('SELECT id FROM account_email_verifications LIMIT 0');
      const account = await client.query<{ id: string; email_verified_at: Date | null }>(
        'SELECT id, email_verified_at FROM accounts WHERE email_normalized = $1 FOR UPDATE',
        [email],
      );
      const row = account.rows[0];
      if (!row || row.email_verified_at !== null) return false;
      await client.query(
        'DELETE FROM account_email_verifications WHERE account_id = $1 AND expires_at <= clock_timestamp()',
        [row.id],
      );
      const result = await client.query(
        `INSERT INTO account_email_verifications (id, account_id, token_digest, issued_at, expires_at)
         SELECT $1, $2, $3, t, t + interval '30 minutes' FROM (SELECT clock_timestamp() AS t) clock
         WHERE (SELECT count(*) FROM account_email_verifications WHERE account_id = $2) < 3
           AND NOT EXISTS (SELECT 1 FROM account_email_verifications WHERE account_id = $2 AND issued_at + interval '60 seconds' > clock.t)
         RETURNING id`,
        [id, row.id, digest],
      );
      return result.rows.length === 1;
    });
  }

  lookup(digest: string): Promise<VerificationProof | undefined> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ account_id: string; password_hash: string }>(
        `SELECT a.id AS account_id, p.password_hash FROM account_email_verifications v
         JOIN accounts a ON a.id = v.account_id JOIN account_passwords p ON p.account_id = a.id
         WHERE v.token_digest = $1 AND v.expires_at > clock_timestamp() AND a.email_verified_at IS NULL`,
        [digest],
      );
      const row = result.rows[0];
      return row
        ? { accountId: row.account_id, passwordHash: row.password_hash }
        : undefined;
    });
  }

  confirm(digest: string, proof: VerificationProof): Promise<boolean> {
    return this.database.transaction(async (client) => {
      // Account-first ordering matches issuance. Lock the credential too, so an
      // update racing with the proof cannot commit between revalidation and use.
      const account = await client.query(
        `SELECT a.id FROM accounts a JOIN account_passwords p ON p.account_id = a.id
         WHERE a.id = $1 AND a.email_verified_at IS NULL AND p.password_hash = $2 FOR UPDATE OF a, p`,
        [proof.accountId, proof.passwordHash],
      );
      if (!account.rows[0]) return false;
      const token = await client.query(
        'SELECT id FROM account_email_verifications WHERE account_id = $1 AND token_digest = $2 AND expires_at > clock_timestamp() FOR UPDATE',
        [proof.accountId, digest],
      );
      if (!token.rows[0]) return false;
      await client.query(
        'UPDATE account_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE account_id = $1',
        [proof.accountId],
      );
      await client.query(
        'UPDATE accounts SET email_verified_at = clock_timestamp() WHERE id = $1',
        [proof.accountId],
      );
      await client.query(
        'DELETE FROM account_email_verifications WHERE account_id = $1',
        [proof.accountId],
      );
      return true;
    });
  }
}
