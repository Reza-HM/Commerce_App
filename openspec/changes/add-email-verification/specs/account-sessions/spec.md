# Spec Delta

## MODIFIED Requirements

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

The email-verification boundary SHALL deny unverified account sign-in and session inspection. Existing unverified accounts MUST retain their credentials and null verification timestamp until password-bound email confirmation. Every pre-verification session MUST be permanently revoked, rather than merely hidden while its account is unverified. Password recovery and other public-launch prerequisites MUST remain separate from this local milestone.

#### Scenario: Verification is introduced later

- **WHEN** the email-verification change replaces the temporary unverified-account allowance
- **THEN** new session creation and inspection require a verified account
- **AND** existing unverified accounts must confirm their email and explicitly sign in again
- **AND** public launch remains gated on password recovery, external delivery, secure deployment, and the other documented prerequisites

#### Scenario: An old session is presented after verification

- **WHEN** an account with a pre-verification session later completes verification
- **THEN** that session still receives inspection 401 even if its cookie and ordinary expiry remain valid
- **AND** completing verification issues no replacement session and does not revive the old row

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
