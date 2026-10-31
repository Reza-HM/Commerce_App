# account-sessions Specification

## Purpose

Provide secure, revocable account sign-in and bounded browser sessions for the local API milestone.

## Requirements

### Requirement: Email and password sign-in

The API SHALL accept `POST /accounts/sessions` with exactly email and password strings. It MUST use the existing registration email identity and NFC password encoding, verify existing credentials without changing them, and issue sessions only for verified accounts. Correct credentials for an unverified account MUST return correlated 403 `verification_required` with fixed message `Email verification required` and no session; unknown accounts and incorrect passwords MUST remain indistinguishable.

#### Scenario: Registered account signs in

- **WHEN** valid credentials for an existing verified account are submitted
- **THEN** a new session is issued and the response is 201 with `{"status":"signed_in"}` and a session cookie
- **AND** no password, reusable token, email, or account existence detail appears in the response body or logs

#### Scenario: Credentials do not match

- **WHEN** the email does not exist or the password is incorrect, regardless of verification state
- **THEN** the response is the same generic 401 `invalid_credentials` error and no session cookie is issued
- **AND** each eligible attempt performs bounded password derivation without claiming identical network or database timing

#### Scenario: Invalid request shape

- **WHEN** the body has missing, non-string, extra or malformed fields
- **THEN** it receives a safe 400 without echoing input or creating a session
- **AND** sign-in does not reapply registration's evolving password blocklist to an existing credential

#### Scenario: Correct password belongs to an unverified account

- **WHEN** password verification succeeds but the account's verification timestamp is null
- **THEN** sign-in returns 403 `verification_required` without setting a session cookie
- **AND** the response contains only error, fixed message, and requestId, without automatically sending another email

### Requirement: Future verification boundary

The email-verification boundary SHALL deny unverified account sign-in and session inspection. Existing unverified accounts MUST retain credentials and null verification timestamp until password-bound email confirmation, except token-authorized recovery can replace credentials only. Every pre-verification session MUST be permanently revoked, rather than hidden while its account is unverified. Other public-launch prerequisites MUST remain separate from local milestones.

#### Scenario: Verification is introduced later

- **WHEN** the email-verification change replaces the temporary unverified-account allowance
- **THEN** new session creation and inspection require a verified account
- **AND** existing unverified accounts must confirm their email and explicitly sign in again
- **AND** public launch remains gated on secure deployment, shared abuse protection, and the other documented prerequisites even after password recovery is delivered

#### Scenario: An old session is presented after verification

- **WHEN** an account with a pre-verification session later completes verification
- **THEN** that session still receives inspection 401 even if its cookie and ordinary expiry remain valid
- **AND** completing verification issues no replacement session and does not revive the old row

#### Scenario: An unverified account recovers its password

- **WHEN** a live recovery token authorizes password replacement for an unverified account
- **THEN** its verification timestamp stays null and no session is issued
- **AND** the new password still receives verification-required feedback until explicit email verification completes

### Requirement: Opaque revocable sessions

Sessions SHALL use unpredictable opaque bearer secrets, with only a non-reusable digest stored in PostgreSQL. Each successful sign-in MUST create an independently revocable session tied to its account; multiple sessions MAY coexist. The database MUST enforce session identity and account linkage.

#### Scenario: Database contents are exposed

- **WHEN** session rows are inspected without the browser secret
- **THEN** the stored value cannot itself be used as a valid session cookie
- **AND** session secrets and digests do not appear in application logs

#### Scenario: Independent devices sign in

- **WHEN** the same account signs in twice
- **THEN** both sessions work independently and signing out one does not revoke the other

### Requirement: Fixed and idle session expiration

Each session SHALL expire at the earlier of 30 minutes after its last accepted authenticated activity and 12 hours after issuance. Activity MUST renew the inactivity deadline without extending the absolute deadline. Expiration and revocation MUST be enforced by the server, independent of browser cookie retention.

#### Scenario: Inactivity reaches its limit

- **WHEN** a session has no accepted authenticated activity for 30 minutes
- **THEN** it is rejected even if its cookie remains present

#### Scenario: Activity continues until the absolute limit

- **WHEN** authenticated activity occurs within each inactivity interval
- **THEN** the idle deadline advances up to, but never beyond, the original 12-hour absolute deadline
- **AND** the session is rejected at that absolute deadline

#### Scenario: Concurrent renewal and revocation

- **WHEN** requests race with expiry or sign-out
- **THEN** a revoked or expired session cannot be revived by a later renewal
- **AND** the implementation does not promise to cancel already-authorized work

### Requirement: Browser session cookie

The session cookie SHALL be host-only, Secure, HttpOnly, SameSite=Strict, and scoped to `/`. It MUST contain only the opaque secret, expire no later than the absolute deadline, and be cleared with matching attributes on sign-out. The API MUST NOT accept a session secret in URLs or response bodies.

#### Scenario: Session is issued and cleared

- **WHEN** a successful sign-in is followed by sign-out
- **THEN** the sign-in sets the secure cookie and sign-out sends a matching expiration cookie
- **AND** no Domain attribute broadens its scope

### Requirement: Session inspection and sign-out

The API SHALL expose `GET /accounts/sessions/current` and `DELETE /accounts/sessions/current`. Inspection of a valid session belonging to a verified account MUST return 200 with `{"status":"signed_in","accountId":"<uuid>"}` and count as authenticated activity. Sign-out MUST revoke the presented session and return 204, including when no usable session is present. Inspection MUST enforce verification together with existing expiry/revocation conditions.

#### Scenario: No valid session is present

- **WHEN** inspection receives a missing, malformed, expired, revoked, or unverified-account cookie
- **THEN** it returns a generic 401 and no account information or activity renewal
- **AND** sign-out remains idempotent and clears the browser cookie

#### Scenario: Sign-out cannot persist revocation

- **WHEN** the database is unavailable while a potentially valid session is being revoked
- **THEN** sign-out returns a safe 503 rather than claiming revocation succeeded
- **AND** it clears the browser cookie without claiming the server-side session was revoked

### Requirement: Cookie request protection

All session endpoints SHALL require a non-simple custom request header and a trusted exact Origin when Origin is present; disallowed origins MUST be rejected before session creation, renewal, or revocation. Credentialed CORS MUST be granted only to configured exact origins. Requests without Origin MUST still supply the custom header.

#### Scenario: Cross-origin browser request is not trusted

- **WHEN** an unapproved origin attempts sign-in or sign-out
- **THEN** the API rejects it without creating or revoking a session and grants no credentialed CORS permission

#### Scenario: Non-browser client invokes a state change

- **WHEN** a client sends no Origin but supplies the required custom header and otherwise valid request
- **THEN** the request can be processed without treating the missing Origin as authentication

### Requirement: Bounded authentication work

Sign-in SHALL have finite per-peer admission and share registration's process-wide limit of two expensive password operations with no waiting queue. Unknown-account verification MUST use a valid dummy credential of equivalent supported cost. Shutdown MUST stop admission and drain underlying work under the existing deadline.

#### Scenario: Registration and sign-in overlap

- **WHEN** two password operations are already running across registration and sign-in
- **THEN** another eligible password operation receives a generic 503 with Retry-After rather than starting or queuing additional hashing
- **AND** disconnects do not release slots while underlying work continues

#### Scenario: Peer attempts exceed the window

- **WHEN** a peer exceeds the documented sign-in attempt budget
- **THEN** the API returns 429 with a positive Retry-After without revealing account existence
- **AND** health checks remain independently available

#### Scenario: Dummy verification matches

- **WHEN** an unknown email is checked against the dummy credential
- **THEN** the request cannot create a session even if its password matches the dummy value

### Requirement: Safe session failures and observability

Session responses SHALL be no-store and use the existing server-owned request correlation and safe logging boundary. Missing account/session schema and recognized database outages MUST yield generic 503; unexpected errors MUST yield generic 500. Malformed stored password parameters MUST never cause unbounded work or authenticate a user.

#### Scenario: Storage is unavailable

- **WHEN** sign-in, inspection, or revocation cannot reliably access required database state
- **THEN** it returns a generic 503 without leaking credentials, cookies, hashes, tokens, raw errors, or connection details

#### Scenario: A credential row is corrupt

- **WHEN** a stored credential has unsupported, malformed, or excessive parameters
- **THEN** authentication fails safely without allocating attacker-selected scrypt resources
- **AND** no raw credential material is exposed

### Requirement: Explicit migration and isolated evidence

Session schema and verification rollout effects SHALL use reviewed versioned migration history, never API startup mutation. Rollout MUST permanently revoke existing sessions belonging to unverified accounts without deleting accounts, credentials, or sessions. Live tests MUST use only the guarded test database and preserve exact fixture ownership, finite limits, migration replay, rollback, unrelated data, and independent sentinels.

#### Scenario: Session migration is replayed

- **WHEN** the unchanged application migration history is applied twice to the guarded target
- **THEN** replay repeats no migration SQL and preserves journal identity and schema definitions
- **AND** an existing target is not presented as fresh-install evidence

#### Scenario: Session integration fixtures complete or fail

- **WHEN** tests create or revoke session fixtures
- **THEN** cleanup removes only confirmed owned fixtures by exact identity
- **AND** unrelated accounts, sessions, journal entries, and sentinels remain unchanged

#### Scenario: Existing sessions cross the rollout boundary

- **WHEN** the reviewed verification migration is applied to a test-owned prior-schema fixture containing verified and unverified accounts
- **THEN** unverified-account sessions become permanently revoked and verified-account sessions remain unchanged
- **AND** account credentials are not rewritten, no account is silently verified, and a later verification cannot undo revocation
- **AND** this deliberate migration effect is verified separately from cleanup-preservation assertions

### Requirement: Password-reset session boundary

Session creation SHALL atomically revalidate the exact credential proof used by sign-in while serializing with password reset. Every session created before reset commits MUST be revoked by that reset; a stale old-password proof MUST NOT create a session afterward. Stale proof MUST return generic 401 `invalid_credentials` without issuing a cookie. Already-authorized work need not be canceled.

#### Scenario: Reset commits before an old-password sign-in creates a session

- **WHEN** sign-in verifies a password and a recovery reset replaces it before session creation
- **THEN** creation rechecks the credential and returns generic 401 rather than issuing a usable new session
- **AND** no verification-required distinction is used for a stale proof

#### Scenario: Session creation commits before a reset

- **WHEN** sign-in creates a session before reset commits, including a delayed HTTP response
- **THEN** reset permanently revokes that session and later inspection returns 401
- **AND** a delayed cookie does not restore server-side access

#### Scenario: Renewal races with reset revocation

- **WHEN** activity renewal and password reset overlap
- **THEN** renewal cannot clear revocation or make an old session usable after reset commits
- **AND** a fresh explicit sign-in using the replacement password can create an independent session only when the account is verified
