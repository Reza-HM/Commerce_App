# email-verification Specification

## Purpose

Establish control of an account's email through real email delivery and explicit
password-bound confirmation, without creating sessions or exposing account existence.

## Requirements

### Requirement: Generic verification requests

The API SHALL accept `POST /accounts/email-verification/request` with exactly one string field `email`, using registration's canonical identity. Valid admitted requests MUST return 202 with exactly `{"status":"accepted","message":"Verification request processed."}` for unknown, verified, unverified, and delivery-suppressed addresses. The response MUST NOT claim delivery or reveal account identity, existence, verification state, or cooldown.

#### Scenario: Address states are compared

- **WHEN** an unknown, already verified, eligible unverified, or cooldown-limited address is submitted
- **THEN** the same 202 body and application headers are returned apart from request correlation
- **AND** only eligible unverified accounts receive a delivery attempt
- **AND** no session, password change, or account creation occurs

#### Scenario: Request shape is invalid

- **WHEN** input is missing, malformed, non-string, contains extra fields, or has an unsupported email
- **THEN** the API returns generic correlated 400 without echoing input or issuing a token
- **AND** existing parser-level 400, 413, and 415 behavior remains enforced

### Requirement: Initial verification delivery

A committed new account SHALL receive one bounded initial verification delivery attempt. Duplicate registration MUST NOT replace credentials, verify an account, or trigger another message. Delivery failure or suppression after account commit MUST preserve the generic registration acknowledgment and leave the account unverified. Explicit resend MUST remain available without submitting or changing a password.

#### Scenario: New registration commits

- **WHEN** a new account and credential commit successfully
- **THEN** an eligible verification challenge is persisted before its email is dispatched
- **AND** SMTP work does not delay the registration response or create a session

#### Scenario: Mail is unavailable or registration is duplicated

- **WHEN** delivery fails after account commit, capacity suppresses delivery, or the same address is registered again
- **THEN** registration retains its generic 202 and preserves the stored credential
- **AND** the interface explains how to request another message without promising that one arrived
- **AND** delivery diagnostics contain only fixed safe event classifications

### Requirement: Expiring digest-only challenges

Verification secrets SHALL contain 32 cryptographically random bytes encoded as canonical base64url, expire 30 minutes after issuance, and be bound to one account. PostgreSQL MUST store only a SHA-256 digest of each secret. A secret MUST authorize only password-bound email confirmation, never sign-in, password replacement, or another account's verification.

#### Scenario: A challenge is stored or replayed

- **WHEN** a challenge is issued and its database record is inspected
- **THEN** its raw secret is absent and issuance/expiry are server-owned
- **AND** malformed, unknown, expired, and previously used secrets cannot verify any account

### Requirement: Bounded resend lifecycle

Issuance SHALL allow at most one challenge per account per 60 seconds and at most three retained challenges per account. Expired challenges MUST be removed only for that account during issuance. Cooldown/cap suppression MUST retain generic 202. Issuing or failing to deliver another challenge MUST NOT invalidate an earlier unexpired link. Confirmation MUST invalidate every outstanding challenge for that account.

#### Scenario: Resends race or delivery fails

- **WHEN** concurrent resend requests target one account or a later delivery fails
- **THEN** database-enforced serialization preserves the cooldown and three-challenge cap
- **AND** an earlier unexpired challenge remains usable until successful confirmation or its own expiry
- **AND** expired rows do not require a global cleanup worker to admit another eligible challenge

### Requirement: Registered-password confirmation

The API SHALL accept `POST /accounts/email-verification/confirm` with exactly string fields `token` and `password`. It MUST use sign-in's Unicode/password verification policy without registration-only blocklist checks. Only a live challenge and the matching registered password MUST return 200 with exactly `{"status":"verified"}`. Confirmation MUST NOT change the password or issue authentication credentials.

#### Scenario: Confirmation succeeds

- **WHEN** a live token and matching registered password are submitted
- **THEN** the account becomes verified and the response contains no account ID, email, cookie, or session token
- **AND** the user must explicitly sign in afterward

#### Scenario: Confirmation fails

- **WHEN** a well-formed token is unknown, expired, used, belongs to an already verified account, or the password is incorrect
- **THEN** the response is the same correlated 401 `invalid_verification` error with fixed message `Request rejected`
- **AND** no verification or credential change occurs and a wrong password does not consume an otherwise live challenge
- **AND** admitted well-formed attempts perform equivalent-cost real or dummy password verification

#### Scenario: Confirmation input is invalid

- **WHEN** token encoding, password encoding/size, field types, or object shape is invalid
- **THEN** the API returns generic correlated 400 before password work or mutation
- **AND** password spaces and NFC-equivalent input retain the existing sign-in semantics

### Requirement: Atomic verification and session invalidation

Confirmation SHALL atomically revalidate the challenge and credential, set an initially null verification timestamp, invalidate all account challenges, and revoke every existing account session. Concurrency MUST allow at most one successful confirmation and MUST NOT revive pre-verification sessions. A transaction failure MUST leave the verification timestamp, challenges, and session revocations unchanged.

#### Scenario: Confirmations or credential changes race

- **WHEN** two valid confirmation requests race, or the credential changes after password checking
- **THEN** at most one confirmation commits, and a stale credential proof cannot authorize confirmation
- **AND** a losing confirmation receives the generic invalid-verification result

#### Scenario: Confirmation cannot commit

- **WHEN** a database failure occurs during confirmation or the response is lost
- **THEN** rollback is atomic, or a previously committed outcome remains authoritative
- **AND** the client does not infer rollback or successful verification from a timeout
- **AND** explicit sign-in provides a safe next action if a consumed-link retry is rejected

### Requirement: Verification HTTP protections

Both verification endpoints SHALL require `X-Commerce-Request: 1` and reject a present Origin outside exact `WEB_ORIGINS` before account work. Browser requests MUST omit credentials. Responses MUST be no-store, correlated, and nosniff; CORS MUST allow the custom header only for trusted origins. Tokens MUST be accepted only in the confirmation JSON body, never API URLs or GET actions.

#### Scenario: Browser or non-browser invokes verification

- **WHEN** a trusted browser supplies the custom header, or a non-browser supplies it without Origin
- **THEN** valid input can be processed without using a session cookie
- **AND** missing headers or untrusted Origins receive generic 403 before issuance or confirmation

#### Scenario: Storage or unexpected work fails

- **WHEN** required request/confirmation database work encounters a recognized outage or missing required relation
- **THEN** the API returns generic correlated 503 rather than claiming processing succeeded
- **AND** unexpected failures remain generic 500, with no submitted values or raw exception data
- **AND** verification status/body contracts are documented and checked alongside routes

### Requirement: Finite verification resources

Request and confirmation SHALL each admit five parsed attempts per direct peer per 60 seconds with at most 1024 live peer buckets per process. Confirmation MUST share the existing two-slot password-work limit. Issuance/delivery MUST have two separate process slots, no queue, and a five-second SMTP deadline. Shutdown MUST stop admission and drain owned work within the existing hard deadline.

#### Scenario: Budgets or delivery capacity are exhausted

- **WHEN** peer budgets are exhausted or both relevant process slots are occupied
- **THEN** requests receive generic 429 with positive Retry-After or generic 503 with Retry-After 1 respectively
- **AND** unknown and known addresses face the same capacity admission before account-dependent work
- **AND** initial registration delivery saturation only suppresses that attempt after successful account commit
- **AND** forwarding headers cannot change peer identity and health checks remain independent

#### Scenario: A client leaves or SMTP stalls

- **WHEN** a request disconnects or its captured-mail connection stalls
- **THEN** slots remain held until underlying work settles or is canceled by its deadline
- **AND** there is no unbounded task queue, automatic delivery retry, or promise of delivery surviving process failure

### Requirement: Authenticated real email delivery

Normal delivery SHALL use authenticated `smtp.gmail.com:465` over certificate-verified TLS 1.2 or newer. The sender MUST be the configured Gmail account with a dedicated server-only Google App Password. Gmail MUST be the default; capture MUST require explicit selection and MUST NOT be an automatic fallback.

#### Scenario: Real sender is configured or unavailable

- **WHEN** the operator configures the verified Gmail account and its dedicated App Password
- **THEN** eligible messages are attempted through Google's fixed authenticated TLS endpoint to the actual recipient
- **AND** missing/invalid credentials fail safe before listening, without exposing their values or switching to capture
- **AND** sender identity cannot be changed by submitted email, Host, forwarding headers, SMTP URLs or configurable remote endpoints
- **AND** a masked startup prompt may supply server-process credentials without saving them, printing them, or changing private database environment loading
- **AND** fixed trusted-origin links and English text/HTML content include expiry instructions without passwords, session material, third-party artwork or tracking
- **AND** mail availability does not govern public-shell rendering or database readiness

#### Scenario: Capture is explicitly selected

- **WHEN** automated tests or an operator explicitly select the capture provider
- **THEN** only the validated loopback SMTP endpoint and synthetic sender are used
- **AND** no Google credential or external email service is needed by ordinary tests or CI

### Requirement: Explicit verification browser journey

The web SHALL provide `/verify-email/request` and `/verify-email`. Request acknowledgment MUST remain conditional and generic. Confirmation MUST require the registered password and an explicit submit, with success directing users to sign-in. Both routes MUST follow current English localization, theme, motion, accessibility, feedback, and finite-request conventions without depending on a live API to render.

#### Scenario: A visitor completes or retries the journey

- **WHEN** the visitor requests a message, follows its link, and confirms a matching password
- **THEN** the page announces verification success and offers explicit sign-in without automatically creating a session
- **AND** malformed/missing/expired/used links and failed confirmation provide safe feedback, resend navigation, and sign-in as appropriate
- **AND** an unknown registered password is not replaced; password recovery is identified as unavailable in this milestone

#### Scenario: Desktop, mobile, or keyboard is used

- **WHEN** new routes and email content are reviewed at desktop/mobile sizes in both appearances
- **THEN** persistent labels, password-manager/paste support, focus, announcements, contrast, and narrow-screen layout remain usable
- **AND** reduced-motion and blocked-storage behavior retain feedback without storing verification state

### Requirement: Restricted verification-link secret handling

Only the verification secret SHALL appear in the email link fragment as `/verify-email#token=<secret>`. The browser MUST capture it into transient memory and replace the current history URL before requests or navigation. The page MUST use no-referrer and no third-party resources. Opening, previewing, reloading, or prefetching a link MUST NOT verify an account or consume a challenge.

#### Scenario: Email link is opened or restored

- **WHEN** an email client or browser opens the link
- **THEN** no secret reaches HTTP paths, queries, referrers, server-rendered output, telemetry, or application logs
- **AND** the fragment is removed before form interaction and the token is sent only by explicit confirmation JSON
- **AND** leaving/restoring the page clears token/password memory; a fresh reload requires reopening the email link
- **AND** no promise is made to erase the original email or browser/extension records outside application control

### Requirement: Isolated migration and delivery evidence

Verification SHALL use a new reviewed explicit migration, never startup DDL. Acceptance MUST exercise token races, expiry, rollback, migration replay, legacy-session invalidation, and exact owned cleanup on the guarded test database. Automated email/browser tests MUST use synthetic messages in an isolated owned capture fixture without accessing developer inboxes, private settings, or external email services.

#### Scenario: Acceptance succeeds or prerequisites are missing

- **WHEN** implementation completion is assessed
- **THEN** evidence distinguishes unit/browser SMTP doubles, actual local inbox delivery, and live database checks
- **AND** fresh-install evidence is obtained only on a confirmed fresh test target, never by resetting a development or existing test database
- **AND** missing live prerequisites remain incomplete gates and unrelated data, sessions, challenges, schema, and migration history remain preserved

#### Scenario: Real delivery completion is assessed

- **WHEN** the revised milestone is considered complete
- **THEN** an owner-authorized message has actually arrived in the designated real inbox and its intact link has completed registered-password confirmation and explicit sign-in
- **AND** SMTP acceptance, a Gmail Sent copy, local capture and test doubles alone are insufficient evidence of receipt
- **AND** unavailable credentials, provider restrictions, delivery failure or unconfirmed receipt remain explicit incomplete acceptance gates
