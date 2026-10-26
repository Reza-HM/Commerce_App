# Design

## Context

Registration stores lowercase ASCII email identities and NFC-encoded scrypt v1
credentials, and creates no session. The API currently uses one bounded pool,
separate registration admission, loopback HTTP, and exact-origin CORS without
credentialed requests. See the proposal and session specification for scope and
observable requirements.

## Goals / Non-Goals

**Goals:** Reuse the existing identity, pool, runtime lifecycle, and safe error
boundary; define reproducible authentication and expiration under concurrency;
make API use and test evidence possible without weakening browser cookies.

**Non-Goals:** Build account pages, email delivery, verification, recovery,
distributed abuse controls, session administration, or public TLS/proxy setup.

## Decisions

### API and credential verification

Add `POST /accounts/sessions`, `GET /accounts/sessions/current`, and `DELETE
/accounts/sessions/current`. Request/response shapes and statuses are in the
specification. Sign-in uses the registration email normalization and syntax,
well-formed Unicode, raw password size limit and NFC encoding, but does not apply
the current registration blocklist or new-password length policy to authentication.
Reject malformed bodies with safe 400; well-formed valid-shaped unknown identities
and incorrect passwords share the same 401. Do not include user input in errors.

Parse only the existing canonical `scrypt$v1$131072$8$1$...` encoding with exact
salt/key lengths, canonical base64url, fixed allowed cost, bounded input and
constant-time key comparison. A fixed valid dummy credential with the same cost
is used for absent identities, and a dummy match never authenticates an absent
account. Malformed stored credentials fail closed as a
generic internal failure and never select scrypt parameters. Clear owned buffers
where possible; do not claim equal overall timing. Registration and sign-in share
a single two-slot in-flight admission budget, retaining the existing registration
peer contract and shutdown/drain semantics. Sign-in gets its own five parsed
attempts per direct peer per 60 seconds, at most 1024 live buckets, with the same
pruning, normalization, Retry-After, and no forwarded identity rules. These are
local limits, not shared public-abuse protection.

### Session storage and lifecycle

Generate 32 random bytes per successful sign-in, encode in canonical unpadded
base64url, and store only its SHA-256 digest as a unique key. The exact-length
cookie parser rejects malformed, duplicate, or noncanonical session cookies.
Use a server-created session identifier for fixture ownership, account foreign
key with restricted deletion, issuance/absolute-expiry/last-activity timestamps,
and a nullable revocation timestamp. Database timestamps provide one clock for
all replicas. No session secret or digest is logged or returned in JSON.

On each accepted inspection or future protected request, use an atomic conditional
database update that checks unrevoked status, both deadlines and current database
time, then advances activity without shortening a newer timestamp. Compute expiry
as `min(last_activity + 30 minutes, issued_at + 12 hours)`; at equality the
session is invalid. Revocation is atomic and cannot be undone by an overlapping
renewal; a request authorized before revocation can still finish. Maintain one
12-hour cookie expiry from issuance, independent of idle renewal. Revocation is
idempotent; if the store cannot determine or record the outcome, return 503 and
clear the cookie without claiming server revocation. A committed sign-in after
client disconnect may leave an unreachable session until expiry; never reuse or
disclose its bearer secret.

This change does not delete expired/revoked session rows automatically. Retention
and bounded cleanup must be addressed before public deployment; no broad cleanup
or unrelated-data deletion is introduced. This avoids silently selecting a data
retention policy, but means local data can grow with sign-ins.

### Browser boundary and local use

Use `__Host-commerce_session`, host-only, Path=/, Secure, HttpOnly,
SameSite=Strict, no Domain. All three session endpoints require
`X-Commerce-Request: 1`, including inspection because it renews activity;
reject a present Origin unless it exactly matches a configured trusted web origin,
including the same-origin browser case. No Origin is permitted for non-browser
clients only when the header is present; that header is CSRF friction, not client
authentication. Grant `Access-Control-Allow-Credentials: true` and preflight
permissions only for exact trusted origins; do not reflect arbitrary Origin or
allow wildcards. Validate the guard before session creation, renewal or revocation.
Keep existing registration behavior unchanged. SameSite=Strict deliberately
limits cross-site integrations; separately hosted origins must be same-site for
cookies to be sent. CORS is not a substitute for authorization or the guard.

Document the actual loopback host and browser behavior with Secure cookies; test
the browser's acceptance on the supported local setup rather than assuming all
HTTP hosts qualify. For API-only tests, send/receive cookies explicitly without
printing their values. Never add an insecure-cookie switch. HTTPS termination,
cross-site use and production origins need a separate deployment design.

### Verification transition

Accept null `email_verified_at` for now. The later verification change must
deny new sign-ins until verified, address already-issued sessions and existing
unverified accounts, and define any action restrictions. Neither an existing
session nor this temporary rule implies verified ownership. Do not implement
verification or recovery in this change.

### Database and evidence

Add an additive reviewed Drizzle migration with its metadata, constraints and
indexes; use the existing pool and explicit migration command. CI integration
uses only guarded TEST_DATABASE_URL, serial ownership and finite limits. Track
candidate session IDs before creation, confirm ownership only after proven commit,
and delete exact owned sessions before owned accounts. Unknown outcomes fail for
review; preserve unrelated rows, account/credential and session sentinels,
catalog definitions and migration journal through successful and failing workers.
Check fresh installation only on a target proven fresh; otherwise report replay.
Unit and HTTP-contract tests stay independent of private configuration. Update
OpenAPI, the API guide, and the registration guide to describe current behavior.

## Risks / Trade-offs

- [Unverified sign-in] -> Keep it local-milestone behavior; verification and
  recovery remain launch prerequisites and the future transition must cover old
  sessions, not just new logins.
- [Stolen cookie] -> Store only a digest, use secure cookie attributes, server
  expiry and revocation; XSS or an active stolen bearer remains a threat.
- [No shared rate limiter] -> Preserve finite per-process work; deployment must
  provide shared rate enforcement, trusted proxy identity, and bot controls.
- [Expired rows accumulate] -> Document the retention limitation; design safe,
  bounded deletion separately before production scale.
- [Clock and concurrency] -> Make PostgreSQL authoritative and test deadline and
  revoke/renew races; do not rely on browser clocks for authorization.
- [Local HTTP and Secure cookies] -> Verify supported loopback behavior and
  document limitations; never weaken cookie attributes to make tests pass.

## Migration Plan

Generate and review the new additive migration, snapshot, journal, constraints,
and indexes. Apply to guarded test targets explicitly, validate replay, rollback,
ownership, and sentinel preservation, and retain evidence of actual target state.
Development migration remains an explicit operator action; API startup never
applies it. If rollout fails, revert the API build while retaining schema, history,
and data, then repair forward with a reviewed migration; do not reset databases or
delete unrelated data.
