import {sql} from 'drizzle-orm';
import {check, pgTable, text, timestamp, unique, uuid, varchar} from 'drizzle-orm/pg-core';

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
