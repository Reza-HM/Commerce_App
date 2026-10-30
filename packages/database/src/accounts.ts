import type { Database } from './database';

export interface NewAccount {
  readonly id: string;
  readonly emailNormalized: string;
  readonly passwordHash: string;
}
export type AccountCreation =
  { readonly kind: 'created'; readonly id: string } | { readonly kind: 'existing' };
export interface AccountRegistrationRepository {
  create(input: NewAccount): Promise<AccountCreation>;
}

/** Resolves only after COMMIT. A failed/uncertain commit never proves ownership. */
export class AccountRepository implements AccountRegistrationRepository {
  constructor(private readonly database: Pick<Database, 'transaction'>) {}

  create(input: NewAccount): Promise<AccountCreation> {
    return this.database.transaction(async (client) => {
      // Check the credential relation even for duplicates, without reading hashes
      // or account existence, so a missing required table is never accepted.
      await client.query('SELECT account_id FROM account_passwords LIMIT 0');
      const result = await client.query<{ id: string }>(
        'INSERT INTO accounts (id, email_normalized) VALUES ($1, $2) ON CONFLICT (email_normalized) DO NOTHING RETURNING id',
        [input.id, input.emailNormalized],
      );
      const account = result.rows[0];
      if (!account) return { kind: 'existing' };
      await client.query(
        'INSERT INTO account_passwords (account_id, password_hash) VALUES ($1, $2)',
        [account.id, input.passwordHash],
      );
      return { kind: 'created', id: account.id };
    });
  }
}
