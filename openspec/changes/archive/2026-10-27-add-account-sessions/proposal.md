# Proposal

## Why

Registered accounts cannot sign in or maintain an authenticated session. The API
needs a revocable, bounded session foundation before a separate account web flow
can use those accounts.

## What Changes

- Add API-only email/password sign-in, current-session inspection, and sign-out,
  using opaque, revocable PostgreSQL-backed sessions and Secure/HttpOnly cookies.
- Expire sessions after 30 minutes of inactivity or 12 hours absolutely; activity
  can renew the idle deadline but never the absolute deadline.
- Allow unverified accounts to sign in for this milestone. The later email
  verification change must deny new sign-ins until verified and address existing
  sessions; verification and recovery remain required before public launch.
- Bound credential verification and request admission, protect cookie-backed
  state changes, and preserve existing registration and database safeguards.
- Add a reviewed migration, guarded integration coverage, and matching API and
  operational documentation. Keep local secure-cookie testing explicit.

The separate account web flow, email delivery/verification, password recovery,
social login, public deployment, and account administration are out of scope.

## Capabilities

### New Capabilities

- `account-sessions`: Email/password sign-in, session lifecycle, browser cookie
  security, revocation, and safe authenticated-session inspection.

### Modified Capabilities

None. Registration continues to create no session and keeps its existing contract.

## Impact

The API accounts module, runtime, database schema/repository and migration history,
tests, and `docs/api/openapi.json` and `docs/api/README.md` will change. Password
verification must accept the existing scrypt credential format without altering
registration semantics. The existing guarded test target, explicit migration path,
bounded pool, and shared process resource budget remain in force. No new web UI,
deployment, CI policy, or configuration-secret changes are authorized here.
