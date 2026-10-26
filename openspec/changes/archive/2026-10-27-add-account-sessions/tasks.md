# Tasks

## 1. Session persistence and lifecycle

- [x] 1.1 Add and review the additive session schema, SQL migration, snapshot, journal, constraints and indexes; verify migration-history and schema checks pass without applying migrations at startup.
- [x] 1.2 Implement session creation, conditional activity renewal, inspection and revocation through the existing database pool; verify repository tests cover expiry boundaries, concurrent renewal/revocation and independent sessions.
- [x] 1.3 Extend guarded live fixtures with exact session ownership and independent sentinels; verify commit, rollback, replay and preservation after successful and deliberately failing workers without deleting unrelated data.

## 2. Credential verification and admission

- [x] 2.1 Reuse registration's email and NFC encoding without reapplying new-password policy; verify malformed input, canonical identities and compatible previously accepted credentials.
- [x] 2.2 Implement bounded scrypt v1 verification, fixed-cost dummy credential and constant-time key comparison; verify real production-cost credentials, unknown and incorrect credentials, canonical encoding and rejected excessive parameters.
- [x] 2.3 Share the existing two-operation budget between registration and sign-in, and add the bounded sign-in peer limiter; verify mixed-load saturation, windows, disconnects, drain and unchanged registration admission behavior.

## 3. HTTP and browser boundary

- [x] 3.1 Implement sign-in, current-session and idempotent sign-out, including safe 400/401/429/503/500 handling; verify exact response contracts, no-store, unverified sign-in, outage and redaction behavior.
- [x] 3.2 Implement the host-only secure session cookie, exact-origin guard, custom header on all session endpoints and credentialed CORS; verify malformed or duplicate cookies, sign-out clearing, unapproved origins, preflight and unchanged registration behavior.
- [x] 3.3 Update OpenAPI, API guide and account-registration guide with endpoints, schemas, examples, rate limits, cookie/security rules, expiry, local browser constraints and verification transition; run API documentation lint, unit contract tests and HTML build.
- [x] 3.4 Verify a supported local browser accepts and sends the secure cookie in the documented setup, records no token in output, and correctly exercises sign-in, inspection and sign-out; document any genuine local environment limitation without weakening cookie attributes.

## 4. End-to-end acceptance

- [x] 4.1 Run lint, typecheck, unit tests, build, browser and process smoke checks, and strict OpenSpec validation; record results and any unavailable check truthfully.
- [x] 4.2 Run the guarded live database integration suite and document migration target state, session lifecycle, concurrency, exact cleanup, sentinel preservation and replay evidence; do not use development DATABASE_URL for automated tests.
- [x] 4.3 Review the full change and record remaining launch limitations, including verification, recovery, shared abuse controls, secure deployment and expired-session retention.

## Workflow follow-up

- After implementation and validation, sync and archive the change through the applicable OpenSpec workflow.
