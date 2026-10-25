# Proposal

## Why

The API has safe runtime and persistence foundations but cannot create an account.
Registration is the next agreed marketplace milestone and must establish a real
account migration and credential contract before sessions or browser flows depend
on them.

## What Changes

- Add an API-only email/password registration endpoint with strict input
  validation and the same accepted response for new and existing email addresses.
- Persist one account and one password credential atomically, enforce canonical
  email uniqueness in PostgreSQL, and leave existing credentials unchanged on
  retries or concurrent duplicate submissions.
- Specify ASCII email normalization, Unicode password handling, a local common
  password blocklist, asynchronous salted scrypt hashing, and bounded abuse controls
  for the current loopback-only API.
- Introduce the first reviewed application migration and live account tests that
  preserve target guards, finite limits, exact ownership, rollback, replay, and
  independent sentinel checks. Distinguish fresh-install evidence from replay.
- Document the registration contract and its local operating limits when applied.
  These artifacts are proposed decisions awaiting owner approval.

Sessions, sign-in/out, cookies/tokens, web pages, email delivery/verification,
password recovery, seller workflows, business approval, and admin provisioning
remain separate changes. Verification and recovery remain required before public
launch. This change does not grant buyer/seller-exclusive roles: one ordinary
account can later do both. Registration grants no administrative or business
approval authority.

## Capabilities

### New Capabilities

- `account-registration`: Validated, enumeration-resistant email/password account
  creation, atomic credential persistence, bounded admission, and real migration
  and fixture-preservation acceptance criteria.

### Modified Capabilities

None. Existing database, workspace, runtime, and GitHub delivery requirements
remain applicable; the new capability adds business behavior without weakening
their safeguards.

## Impact

- `apps/api`: a Nest accounts module, registration validation/service/controller,
  password hashing and admission controls, HTTP error/CORS integration, and safe
  static-route completion logging.
- `packages/database`: account/password schema, repository operations through the
  public server-only package, reviewed SQL and Drizzle migration metadata.
- `scripts/integration*.cjs`, relevant unit/process tests, and operating docs:
  account coverage through existing root gates; web remains independent.
- Use stable Node crypto APIs and existing database/framework dependencies. Vendor
  a small documented public password corpus with its license/provenance; no
  external password-check service or new runtime service is required.
- Keep local plaintext loopback database transport, private `.env` handling,
  existing CI, deploy/secrets handling, archived changes, and Git approval rules.
  No database reset, role/grant change, or automatic startup migration is proposed.
