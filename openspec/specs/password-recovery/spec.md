# password-recovery Specification

## Purpose

Let people who control their registered inbox replace a forgotten password through a
bounded email journey while preserving verification requirements and revoking old access.

## Requirements

### Requirement: Generic recovery requests

The API SHALL accept `POST /accounts/password-recovery/request` with exactly one string field `email`, using the existing canonical identity. Admitted valid requests MUST return 202 with exactly `{"status":"accepted","message":"Password recovery request processed."}` for unknown, verified, unverified, and delivery-suppressed addresses. Recovery MUST NOT create an account or reveal account existence, verification status, cooldown, or delivery outcome.

#### Scenario: Address states are compared

- **WHEN** unknown, verified, unverified, cooldown-limited, or challenge-capped addresses are submitted
- **THEN** status, body, and application headers match apart from correlation
- **AND** only eligible existing accounts receive a recovery delivery attempt
- **AND** requesting recovery does not change credentials, verification, sessions, or earlier live links
- **AND** responses do not await SMTP or claim identical network/database timing

#### Scenario: Request input is invalid

- **WHEN** the body has missing, non-string, unsupported, or extra fields
- **THEN** the API returns generic correlated 400 without echoing input or issuing a challenge
- **AND** existing parser-level 400, 413, and 415 limits remain enforced

### Requirement: Separate expiring recovery challenges

Recovery secrets SHALL contain 32 cryptographically random bytes encoded as canonical base64url, expire 30 minutes after issuance, and authorize replacement only for their bound account. Persistent storage MUST contain only their SHA-256 digest. Recovery, verification, and session secrets MUST be accepted only for their own purpose, with no raw challenge material in API responses or logs.

#### Scenario: A secret is inspected or used for another purpose

- **WHEN** recovery storage is inspected or a recovery secret is sent to verification or session endpoints
- **THEN** no plaintext secret is stored and no verification or authentication is granted
- **AND** verification/session secrets cannot authorize password replacement

### Requirement: Bounded recovery resend lifecycle

Recovery issuance SHALL serialize per account, allow at most one challenge per 60 seconds, and retain at most three challenges per account. Expired recovery rows MUST be removed only for that account during issuance. Suppression and later delivery failure MUST preserve earlier unexpired links and generic 202. Successful reset MUST invalidate all outstanding recovery challenges for that account.

#### Scenario: Resends race or a later message fails

- **WHEN** concurrent requests target one account or a newly issued message cannot be delivered
- **THEN** the cooldown and retained-challenge cap hold across API processes
- **AND** earlier live links remain usable until expiry or a successful reset
- **AND** no global cleanup worker or automatic mail retry is required

### Requirement: Explicit password replacement contract

The API SHALL accept `POST /accounts/password-recovery/confirm` with exactly string fields `token` and `password`, without an old password or session. A live challenge with an acceptable new password MUST return 200 with exactly `{"status":"password_reset"}` only after commit. Responses MUST NOT include an account identity, verification status, cookie, or session credential.

#### Scenario: A live recovery challenge is submitted

- **WHEN** an admitted request supplies a live token and acceptable new password
- **THEN** that account's password is replaced and the caller must explicitly sign in
- **AND** presenting a cookie does not select the target account or grant recovery authority

#### Scenario: Token input is invalid or no longer usable

- **WHEN** token encoding, field types, or object shape is invalid
- **THEN** the response is generic correlated 400 before password derivation or mutation
- **WHEN** a well-formed token is unknown, expired, consumed, or loses a reset race
- **THEN** the response is the same correlated 401 with error `invalid_recovery` and fixed message `Request rejected`
- **AND** no credential or session mutation commits

### Requirement: Consistent new-password policy

Replacement passwords SHALL use registration's current Unicode, NFC, length, raw-byte, common-password, service-name, and account-email/local-part screening policy and salted scrypt storage parameters. Validation MUST preserve spaces and case for hashing. Safe 400 password field/reason feedback MUST exclude submitted values. Policy failure MUST NOT consume a live challenge or change credentials.

#### Scenario: A new password violates policy

- **WHEN** submitted Unicode/byte/length or weak-password rules fail
- **THEN** the response identifies only a supported safe password-policy reason
- **AND** email-based screening uses the token-bound account's canonical identity, never a caller-selected email
- **AND** malformed or unusable tokens cannot yield account-derived policy feedback

#### Scenario: A supported new password is stored

- **WHEN** replacement succeeds with significant spaces or NFC-equivalent Unicode
- **THEN** the normalized full password uses a fresh independent salt and current supported derivation parameters
- **AND** there is no password-history requirement or separate rejection solely for matching the old password

### Requirement: Atomic reset and access invalidation

Reset SHALL atomically revalidate the live challenge and credential proof, replace the password, revoke every existing session, and invalidate all recovery and email-verification challenges for that account. Concurrent consumption MUST allow at most one success. Database failure MUST roll back the entire change. A lost response MUST NOT be presented as proof of either rollback or success.

#### Scenario: Resets or verification race

- **WHEN** two recovery submissions race, or verification changes account state while recovery is being prepared
- **THEN** each commit uses current locked account/credential/challenge state
- **AND** stale credential proofs cannot overwrite a newer password or verify with an old password
- **AND** reset preserves the verification status current at its commit

#### Scenario: Revocation or challenge invalidation fails

- **WHEN** any reset mutation fails before commit
- **THEN** credentials, verification state, sessions, and both challenge sets remain unchanged
- **AND** a later retry can succeed if the token remains live

### Requirement: Verification remains explicit after recovery

Recovery SHALL support verified and unverified accounts without setting or clearing their verification timestamp. Unverified accounts MUST still confirm email with the replacement password before sign-in. Reset MUST NOT automatically issue verification mail or a session. Old verification links invalidated by reset MUST fail safely and offer explicit resend.

#### Scenario: An unverified owner forgets the registered password

- **WHEN** the owner completes recovery, requests a fresh verification message, and confirms with the new password
- **THEN** the account becomes verified only through the verification confirmation
- **AND** sign-in before verification remains rejected with the existing verification-required contract
- **AND** sign-in afterward requires the replacement password and an explicit action

### Requirement: Recovery HTTP protections

Both recovery endpoints SHALL require `X-Commerce-Request: 1`, reject a present Origin outside exact `WEB_ORIGINS` before account work, and use no-store, nosniff, and server-owned correlation. Browser requests MUST omit credentials. Tokens MUST be accepted only in confirmation JSON, never API URLs or GET actions. Required storage outages MUST return safe 503; unexpected failures MUST remain generic 500.

#### Scenario: Origin, header, or required storage is invalid

- **WHEN** an untrusted Origin or missing custom header reaches a recovery endpoint
- **THEN** generic 403 is returned before issuance, hashing, or mutation
- **WHEN** required recovery/account/credential storage is unavailable, including for an unknown address
- **THEN** generic correlated 503 is returned rather than false processing acknowledgment
- **AND** logs and responses expose no recipient, token, password, digest, raw error, or configuration

### Requirement: Finite recovery resources

Each recovery endpoint SHALL admit five parsed attempts per direct peer per 60 seconds with at most 1024 live peer buckets per process. Confirmation MUST share the existing two-slot password-work budget. All verification/recovery issuance and notification mail MUST share a separate two-slot process budget, no queue, and five-second SMTP deadlines. Shutdown MUST stop admission and drain owned work within the existing deadline.

#### Scenario: Capacity is exhausted or a client leaves

- **WHEN** a peer budget or relevant process capacity is exhausted before account-dependent work
- **THEN** the response is generic 429 with positive Retry-After or 503 with Retry-After 1 respectively
- **AND** unknown and known addresses face the same admission
- **AND** a disconnect does not release capacity while underlying work continues
- **AND** forwarding headers do not alter peer identity and health probes remain independent

### Requirement: Recovery delivery and reset notification

Recovery mail SHALL reuse the authenticated Gmail default, explicit loopback capture mode, trusted link origin, and private startup credentials. A committed reset MUST trigger one bounded best-effort notification attempt without a password or recovery token. Notification failure or saturation MUST NOT undo a reset, alter its successful response, or cause automatic retries.

#### Scenario: Recovery or notification mail cannot be delivered

- **WHEN** recovery SMTP fails after challenge persistence
- **THEN** request acknowledgment remains generic and earlier live links remain valid
- **WHEN** notification SMTP fails, capacity is occupied, or the process exits after reset commit
- **THEN** the reset stays authoritative and the service makes no durable-delivery claim
- **AND** diagnostics contain only fixed safe classifications

#### Scenario: Message content is reviewed

- **WHEN** recovery and notification messages are received as text or HTML
- **THEN** recovery explains the 30-minute expiry, explicit reset, and ignoring unsolicited requests
- **AND** notification explains password replacement, revoked sessions, and requesting recovery if unauthorized
- **AND** neither message contains passwords, session material, tracking, or third-party resources

### Requirement: Explicit recovery browser journey

The web SHALL provide `/forgot-password` and `/reset-password` with conditional request acknowledgment, explicit new-password submission, confirmation entry, and safe retry/navigation. Success MUST explain that existing sessions were revoked and offer sign-in plus verification guidance without disclosing verification status. Forms MUST follow current English localization, theme, motion, accessibility, and finite-request conventions.

#### Scenario: A visitor completes or retries recovery

- **WHEN** a visitor requests mail, follows its link, and submits matching acceptable new-password entries
- **THEN** the client sends only token and password to confirmation, clears password/token memory after success, and offers explicit sign-in
- **AND** mismatched confirmation entries cause local feedback without a request
- **AND** missing/expired/used links offer a fresh recovery request and sign-in
- **AND** uncertain outcomes explain that reset may have committed and offer explicit sign-in or a fresh request

#### Scenario: Dependencies or browser capabilities are limited

- **WHEN** pages render without the API, in both themes at desktop/mobile sizes, or with reduced motion/blocked storage
- **THEN** public shells, persistent labels, focus, feedback, password-manager/paste support, and navigation remain usable
- **AND** no recovery, verification, or authentication success is claimed before a confirmed response

### Requirement: Restricted recovery-link secret handling

Email recovery links SHALL use `/reset-password#token=<secret>` on the fixed trusted web origin. The browser MUST capture the fragment into transient memory and remove it from the active history URL before interaction or account requests. The page MUST use no-referrer and no third-party resources. Opening, scanning, prefetching, or restoring a link MUST NOT reset a password or consume a challenge.

#### Scenario: A link is opened, left, or restored

- **WHEN** a recovery link is opened and then the route is left, reloaded, or restored from browser history
- **THEN** no token reaches HTTP paths/queries, referrers, server output, application logs, telemetry, or persistent browser storage
- **AND** route exit/history restoration clears token/password memory; reload requires reopening the mail link
- **AND** application handling does not promise erasure of emails or browser/extension records outside its control

### Requirement: Isolated migration and recovery acceptance

Recovery SHALL introduce one reviewed explicit migration without startup DDL or changes to old migration bytes. Acceptance MUST prove atomic reset, races, expiry, unchanged replay, and exact owned cleanup on guarded test targets. Automated mail/browser tests MUST use synthetic isolated capture. Completion MUST additionally establish owner-authorized real-inbox recovery, notification receipt, and explicit sign-in.

#### Scenario: Database and automated acceptance run

- **WHEN** recovery is validated on a fresh confirmed test target and an existing guarded target
- **THEN** evidence distinguishes fresh installation from replay and preserves unrelated accounts, credentials, sessions, challenges, schema, and journal
- **AND** failed workers preserve independent sentinels and clean only proven owned fixture identities
- **AND** no development target reset, private inbox access, or external mail is part of ordinary tests or CI

#### Scenario: Real delivery completion is assessed

- **WHEN** implementation completion is assessed
- **THEN** a designated inbox has received a recovery message whose intact link completed replacement, plus the reset notification
- **AND** the old password and old sessions fail, and explicit sign-in with the new password succeeds for a verified fixture
- **AND** SMTP acceptance, a Sent copy, capture, or test doubles alone do not prove receipt
- **AND** missing credentials, unconfirmed receipt, or missing live database evidence remain incomplete gates
