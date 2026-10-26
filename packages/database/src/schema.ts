import {sql} from 'drizzle-orm';
import {check, index, pgTable, text, timestamp, unique, uuid, varchar} from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  emailNormalized: varchar('email_normalized', {length: 254}).notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  emailVerifiedAt: timestamp('email_verified_at', {withTimezone: true})
}, table => [
  unique('accounts_email_normalized_key').on(table.emailNormalized),
  check('accounts_email_canonical_check', sql`length(${table.emailNormalized}) > 0 AND ${table.emailNormalized} = lower(${table.emailNormalized}) AND octet_length(${table.emailNormalized}) = length(${table.emailNormalized})`)
]);

export const accountPasswords = pgTable('account_passwords', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id, {onDelete: 'restrict'}),
  passwordHash: text('password_hash').notNull()
});

export const accountSessions = pgTable('account_sessions', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, {onDelete: 'restrict'}),
  tokenDigest: varchar('token_digest', {length: 64}).notNull(),
  issuedAt: timestamp('issued_at', {withTimezone: true}).notNull().defaultNow(),
  absoluteExpiresAt: timestamp('absolute_expires_at', {withTimezone: true}).notNull(),
  lastActivityAt: timestamp('last_activity_at', {withTimezone: true}).notNull(),
  revokedAt: timestamp('revoked_at', {withTimezone: true})
}, table => [
  unique('account_sessions_token_digest_key').on(table.tokenDigest),
  check('account_sessions_digest_check', sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`),
  check('account_sessions_expiry_check', sql`${table.absoluteExpiresAt} = ${table.issuedAt} + interval '12 hours'`),
  check('account_sessions_activity_check', sql`${table.lastActivityAt} >= ${table.issuedAt}`),
  index('account_sessions_account_id_idx').on(table.accountId)
]);
