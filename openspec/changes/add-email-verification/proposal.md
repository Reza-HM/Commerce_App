# Proposal

## Why

The browser account journey is complete, but anyone can currently register another
person's email and use an unverified account. Email verification is the next agreed
account milestone and must close that boundary without activating someone else's
password or reviving sessions issued before ownership was established.

## What Changes

- Add local email verification: an initial verification message for a newly created
  account, a generic resend action, and an email link followed by confirmation with
  the registered password. Keep duplicate registration credential-preserving.
- Use single-use, expiring random verification secrets, digest-only database storage,
  bounded delivery/admission, and atomic confirmation with no automatic sign-in.
- **BREAKING**: deny new sessions for unverified accounts, permanently revoke existing
  unverified sessions, and enforce verification during session inspection. Existing
  local accounts must verify and explicitly sign in again.
- Add `/verify-email` and `/verify-email/request`, English feedback, both appearances,
  reduced-motion support, and complete keyboard/desktop/mobile journeys.
- Permit only the short-lived verification token in an email link's URL fragment;
  remove it from the active URL before interaction. Passwords and session secrets
  remain prohibited in URLs, browser storage, logging, and server-rendered data.
- Capture messages locally using loopback-only SMTP and a Mailpit inbox. Keep real
  external email, password recovery, public deployment, shared public abuse controls,
  and general session retention outside this change.

## Capabilities

### New Capabilities

- `email-verification`: local message delivery, token issuance/resend, password-bound
  confirmation, session invalidation, and the verification browser journey.

### Modified Capabilities

- `account-registration`: preserve the generic 202 contract while adding best-effort
  initial verification delivery without changing existing credentials.
- `account-sessions`: replace the temporary unverified-sign-in allowance with verified
  session issuance/inspection and permanent invalidation of legacy sessions.
- `account-web-flow`: integrate verification entry points and feedback, preserve
  explicit sign-in, and define the narrow verification-link URL exception.

## Impact

Implementation will touch `apps/api/src/accounts`, API configuration/runtime/logging,
`packages/database/src` and a new explicit migration, browser account routes/API/locales,
and existing unit, HTTP-contract, browser, smoke, and guarded integration suites.
SMTP delivery will use a pinned maintained client dependency and a documented local
Mailpit setup; automated suites will own an isolated SMTP capture fixture.

Update `docs/api/openapi.json`, `docs/api/README.md`, and account/local-setup guides
with new verification endpoints and changed sign-in behavior in the implementation
PR. Preserve existing migrations, archived records, CI policy, delivery helpers,
private database configuration, and the generated ignored `next-env.d.ts`.

This proposal authorizes no implementation or publication. All planning defaults
and acceptance requirements below remain reviewable before apply.
