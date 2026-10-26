# Spec Delta

## Purpose

Create ordinary marketplace accounts from validated email/password submissions
while protecting credentials, resisting email enumeration, and preserving safe
database operation and test isolation.

## ADDED Requirements

### Requirement: Registration request contract
The API SHALL accept unauthenticated `POST /accounts/register` with a JSON object containing exactly string fields `email` and `password`. Missing, unknown, or incorrectly typed fields MUST return 400 before hashing or account persistence. Registration MUST NOT create sessions, return authentication credentials, or grant administrative or business approval authority.

#### Scenario: Valid ordinary registration
- **WHEN** an admitted request supplies a valid email and password for a new address
- **THEN** one unverified ordinary account and its password credential are committed
- **AND** there is no cookie, token, session, admin grant, or business approval

#### Scenario: Invalid shape or attempted privilege assignment
- **WHEN** the body is absent, null, an array, or contains missing/non-string fields or extra fields such as `role`, `isAdmin`, `emailVerifiedAt`, or `storeApproved`
- **THEN** the response is 400 and no password hash or account write is attempted
- **AND** submitted values are not echoed in the response or logs

### Requirement: Canonical email identity
Registration SHALL trim only surrounding ASCII space/tab and lowercase the entire ASCII email for identity. It MUST validate a dot-atom local part of at most 64 bytes, a domain of at least two valid DNS labels, and a canonical address of at most 254 bytes. It MUST reject controls, internal whitespace, quoted local parts, domain literals, and non-ASCII input; it MUST NOT remove dots or plus suffixes or perform DNS/delivery checks.

#### Scenario: Case and surrounding whitespace identify the same account
- **WHEN** ` Person+shop@Example.COM ` and `person+shop@example.com` are submitted
- **THEN** both resolve to canonical identity `person+shop@example.com`
- **AND** `person@example.com` and `per.son+shop@example.com` remain different identities

#### Scenario: Unsupported or malformed email
- **WHEN** the address has leading/trailing/consecutive local-part dots, invalid or oversized DNS labels, no domain dot, a local part over 64 bytes, a canonical length over 254 bytes, CR/LF, an internal space, or non-ASCII characters
- **THEN** registration returns 400 before hashing or account writes
- **AND** surrounding CR/LF is rejected rather than trimmed

### Requirement: Password validation and normalization
Passwords SHALL be well-formed Unicode strings, normalized to NFC before policy checks and hashing, with 15 through 128 Unicode code points after normalization. Raw input MUST be limited to 1024 UTF-8 bytes. Spaces and Unicode MUST be supported without trimming, case folding, truncation, or character-class composition rules. Rejection MUST depend only on submitted input and the documented local policy, never account existence.

#### Scenario: Password boundaries and exact content
- **WHEN** admitted requests submit passwords of 14, 15, 128, or 129 normalized code points
- **THEN** length validation accepts only 15 and 128
- **AND** leading/trailing spaces remain significant, and different Unicode representations with the same NFC form use the same normalized bytes

#### Scenario: Invalid or excessive raw Unicode
- **WHEN** password input contains an unpaired surrogate or exceeds 1024 UTF-8 bytes before normalization
- **THEN** validation returns 400 before hashing or persistence
- **AND** the input is never silently shortened or repaired

### Requirement: Local weak password rejection
Registration SHALL reject whole-password matches against a versioned local common-password corpus and the documented contextual denylist. Comparison MUST use NFC and lowercase for screening only; hashing MUST preserve the normalized password's case. Rejection MUST provide a safe password-policy reason without echoing the password. Checks MUST NOT send passwords, hashes, or email addresses to an external service.

#### Scenario: A listed password is submitted for either kind of address
- **WHEN** a valid-length password matches a common entry, the submitted canonical email/local part, or a listed service-name derivative
- **THEN** both new-address and existing-address submissions return the same 400 password-policy error
- **AND** comparison tests whole strings rather than banning matching substrings of otherwise acceptable passphrases

### Requirement: Protected password storage
Persisted password credentials SHALL contain only a versioned salted, memory-hard derived value and its verification parameters. Each admitted valid submission MUST perform asynchronous scrypt with N=131072, r=8, p=1, a fresh random salt of at least 16 bytes, and a 64-byte derived key before uniqueness resolution. Plaintext passwords and reusable authentication secrets MUST NOT appear in responses, logs, or account records.

#### Scenario: Identical submitted passwords have independent storage
- **WHEN** two different new addresses register with the same acceptable password
- **THEN** stored credentials have distinct random salts and derived values
- **AND** independently deriving from each stored parameter set reproduces its key
- **AND** hashing does not block the request event loop synchronously

### Requirement: Atomic unique account persistence
PostgreSQL SHALL enforce one account per canonical email and one password credential per account. Account and credential creation MUST commit together or both roll back. Duplicate registration MUST leave every existing account and credential field unchanged. Account records MUST have a server-generated UUID, creation timestamp, and initially null email verification timestamp; no exclusive buyer/seller role is assigned.

#### Scenario: Concurrent equivalent registrations
- **WHEN** concurrent admitted requests register the same canonical email, including case variants, with different passwords
- **THEN** exactly one complete account/credential pair exists
- **AND** all successful new/duplicate requests receive the same accepted contract
- **AND** the winning credential is not replaced by a losing request

#### Scenario: Credential creation fails after the account insert
- **WHEN** a controlled test causes credential persistence to fail within account creation
- **THEN** no partial account or credential remains committed
- **AND** the failure is propagated safely and a subsequent database transaction succeeds

#### Scenario: A duplicate is retried later
- **WHEN** an existing address is submitted with another acceptable password
- **THEN** the account ID, creation/verification timestamps, salt, hash, and password parameters remain unchanged

### Requirement: Enumeration-resistant acceptance
New and duplicate valid registrations SHALL return HTTP 202 with exactly `{"status":"accepted","message":"Registration request processed."}` after database work succeeds. Responses MUST NOT reveal an account ID, email, existence flag, Location header, or claim that email was sent. Both paths MUST perform the same password hashing work without a duplicate-email precheck. All registration responses MUST be no-store and retain server-owned request correlation.

#### Scenario: Accepted new and duplicate responses are compared
- **WHEN** valid new, existing, and concurrently conflicting submissions complete normally
- **THEN** status, body, and application headers match apart from server-generated correlation and transport metadata
- **AND** no 201/409 distinction, duplicate-specific field, cookie, or authentication token appears
- **AND** tests verify equal expensive-work paths without claiming perfectly constant network/database timing

### Requirement: Safe registration errors
Input errors SHALL return 400 with a fixed safe field/reason code and correlation ID. Admission limits MUST return 429 with Retry-After; saturated hashing, shutdown, or recognized temporary database unavailability MUST return generic 503, and unexpected failures generic 500. Responses and logs MUST exclude submitted values, credential material, raw database exceptions, and infrastructure configuration. Body/parser limits MUST retain their existing 400/413/415 behavior.

#### Scenario: Persistence is unavailable
- **WHEN** a new or duplicate registration encounters unavailable connectivity, bounded acquisition/statement timeout, or a missing required account table
- **THEN** it receives the same generic correlated 503 without claiming acceptance
- **AND** unclassified programming failures remain 500 rather than being hidden as duplicates or accepted requests

#### Scenario: Sensitive request and failure values reach the boundary
- **WHEN** email/password, query, cookie, authorization, forwarded identity, and exception fields contain synthetic secret markers
- **THEN** no marker appears in responses or completion/failure logs
- **AND** the static registration route, status, duration, and server-owned request ID remain observable

### Requirement: Bounded local registration admission
The current loopback API SHALL limit registration to five parsed POST attempts per direct peer address per 60-second fixed window per process, using no forwarded identity headers. It MUST cap active peer buckets at 1024, retain live buckets until expiry, and cap in-flight registration hashing/persistence at two with no waiting queue. Rate limits MUST be independent of email existence and MUST NOT consume health-probe admission.

#### Scenario: Rate limit and identity spoofing
- **WHEN** a peer makes a sixth parsed registration POST in its window while varying emails or forwarded headers
- **THEN** it receives 429 and a positive integer Retry-After without hashing or database work
- **AND** expired buckets become reusable, live buckets are not evicted, and full bucket storage rejects new peers safely

#### Scenario: Registration work is saturated
- **WHEN** two admitted registrations are still in flight and another otherwise eligible request arrives
- **THEN** it receives generic 503 with Retry-After 1 without queuing another hash or account operation
- **AND** slots are released only when the underlying work settles on success, duplicate, or failure, including after a disconnect, while health probes remain independently usable

### Requirement: Explicit account migrations and evidence
Registration SHALL introduce reviewed, non-empty versioned application history applied only through the explicit migration path. Live acceptance MUST prove fresh installation on a confirmed fresh dedicated test database and unchanged replay with preserved journal identities/hashes and catalog definitions. An existing database replay MUST NOT be presented as fresh installation. API startup MUST NOT migrate, reset, or repair missing schema.

#### Scenario: Application history is installed and replayed
- **WHEN** unchanged repository account migrations run twice on a confirmed fresh isolated target
- **THEN** the first applies the real account schema and records its identities/hashes
- **AND** replay repeats no application statements and changes neither catalog definitions nor journal rows
- **AND** repeated local execution on an already migrated target is separately reported as replay

#### Scenario: Required live evidence is unavailable
- **WHEN** the guarded test target or confirmed fresh-install evidence is unavailable
- **THEN** the corresponding live gate remains incomplete despite passing offline checks
- **AND** no development target, reset, replacement business migration, or destructive cleanup is used to manufacture evidence

### Requirement: Owned account fixture cleanup
Account tests SHALL use only guarded TEST_DATABASE_URL in test mode and retain finite resource limits. Committed fixture intent MUST be recorded before writes and ownership confirmed only for proven creation; cleanup MUST use exact owned account IDs and dependent credential keys. It MUST preserve unrelated rows, application tables/history, and coordinator-owned sentinels after successful and deliberately failing workers.

#### Scenario: Account workers pass and deliberately fail
- **WHEN** each worker creates committed account fixtures and then completes or fails deliberately
- **THEN** only its confirmed credential/account rows are removed in dependency order
- **AND** the coordinator independently verifies exact sentinel account/credential rows, schema definitions, and migration journal are unchanged before removing its own sentinel
- **AND** cleanup or preservation failures fail the suite

#### Scenario: A response or insert does not establish ownership
- **WHEN** a duplicate response, conflict, failed insert, or uncertain commit is observed
- **THEN** it does not grant cleanup ownership of an existing row
- **AND** cleanup fails safely for explicit review if ownership cannot be proven, without broad email/prefix deletes, truncation, cascading table drops, or journal deletion
