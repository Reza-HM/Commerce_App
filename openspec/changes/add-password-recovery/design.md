# Design

## Context

See [proposal.md](proposal.md) for motivation and the four delta specs for contracts.
Exploration found these implementation anchors:

- `accounts/verification.ts` and `database/src/email-verifications.ts` already implement
  digest-only challenges, account serialization, resend limits, and password-bound proof.
- `accounts/mail.ts` owns Gmail/capture configuration and bounded SMTP transport, but its
  sender interface and message content currently assume email verification.
- `accounts/validation.ts` combines email, new-password, and contextual weak-password
  checks. Recovery must use the stored identity without asking the caller for email again.
- `SessionService.signIn` checks a credential before calling `SessionRepository.create`.
  Creation currently checks verification but does not recheck the credential proof or
  serialize with reset. Revoking existing rows alone would leave a sign-in race.
- The verification browser form already captures fragments, clears the active URL, and
  handles route exit, browser restoration, aborts, and stale responses. These behaviors
  are reusable patterns; recovery needs distinct new-password semantics and content.
- Existing owned account/schema fixtures, SMTP capture, real-mail acceptance tooling, and
  HTTP/OpenAPI checks provide validation infrastructure. No new dependency is proposed.

The owner confirmed recovery for both verified and unverified accounts, preserving
verification status. Other values below are proposed defaults grounded in existing
verification behavior, rather than previously approved product decisions.

## Goals / Non-Goals

**Goals:**

- Reuse account identity, password policy, mail transport, and safety boundaries while
  keeping recovery authorization separate from verification and sessions.
- Make credential replacement, challenge invalidation, and session revocation one database
  outcome, including concurrent sign-in and verification.
- Keep privacy, bounded resources, and useful browser feedback intact under partial failure.

**Non-Goals:**

- Password change while signed in, recovery without inbox access, support-assisted recovery,
  MFA, security questions, password history, profile/email changes, or account deletion.
- Public hosting, distributed peer limits, durable mail queues, scheduled retention work,
  provider changes, CI pipeline edits, or modifications to archived planning/migrations.
- Starting API processes, applying development migrations, sending mail, or implementing
  code during this planning request.

## Decisions

### 1. Separate recovery from verification and authentication

Use the endpoints and exact responses in the recovery spec. The request form needs only
email; confirmation needs only token and new password. Preserve the account's current
verification timestamp, without returning its value. Unverified users request a fresh
verification message and confirm with their new password before explicit sign-in.

Automatically marking email verified would change the existing password-bound boundary.
Limiting recovery to verified accounts would leave forgotten-password users stuck before
verification. The confirmed approach preserves both recovery and explicit verification.

The reset form asks for the new password twice; only the first is transmitted after
NFC-normalized equality. Recovery does not require the forgotten password, enforce password
history, or automatically establish a session. This broadly follows the token lifecycle,
notification, and explicit-login guidance in the
[OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

### 2. Add a purpose-specific challenge table

Add `account_password_recoveries` through one new explicit migration and matching Drizzle
schema/export. Use UUID identity, restricted account foreign key, unique 64-character hex
SHA-256 token digest, issuance/expiry timestamps, a fixed 30-minute expiry constraint, and
an account index. No raw secret or duplicate password hash belongs in this table.

Issue 32 random bytes as canonical base64url. Lock the account before per-account cleanup,
cooldown evaluation, and insertion. Reuse verification's 60-second cooldown and three-live-
challenge cap, with separate recovery rows. Check required relations on unknown-address
paths too; unavailable schema must not turn into apparent successful processing.

Delete only that account's expired rows during issuance. Retain earlier live challenges
when another is issued or delivery fails. Delete all recovery and verification challenges
only after a successful reset, in its transaction. Keep verification and recovery lookups
in separate tables and services so secrets have no cross-purpose authority.

A combined generic token table would expand verification's migration and authorization
surface. JWTs would still need server state for consumption/revocation. A separate opaque
challenge follows the existing design with a smaller compatibility change.

### 3. Reuse policy without accepting a caller-selected identity

Extract narrowly scoped reusable email/new-password validators from `validation.ts`, keeping
registration and sign-in behavior identical. Load the existing checked local corpus once
and provide the same screening set to registration/recovery. Preserve password parameter
and normalization behavior from `password-hasher.ts`.

Validate shape, canonical token encoding, and account-independent password rules first.
After bounded admission, look up a live recovery proof containing account ID, canonical
email, and current credential hash. Apply email/local-part screening against that stored
identity, then hash the replacement under the existing two-slot password-work budget.
Keep the slot until underlying derivation/database work settles even after disconnect.

Use correlated 400 `invalid_recovery` for malformed request shape/token, with fixed message
`Request rejected`. Password-policy 400 uses `error: invalid_recovery`, fixed message
`Invalid password`, `field: password`, and the existing supported password reason `code`,
plus requestId. A well-formed unusable token returns the generic 401 recovery error and
cannot expose identity-derived policy feedback. No dummy derivation is needed for an
unusable random bearer token; this is not a guessed-password verifier like sign-in.

Do not accept email in confirmation or reuse registration with a synthetic address; either
would misapply contextual screening. Policy failure leaves the challenge usable.

### 4. Serialize reset and session creation on the account

Derive the new hash outside database locks. The reset repository transaction must:

1. Lock the account row, then credential row, in that order. Recheck the expected credential
   hash from the lookup proof; read current verification status rather than copying it.
2. Lock and revalidate the bound challenge and its expiry using the database clock.
3. Replace the password hash, revoke all existing sessions using the existing monotonic
   revocation behavior, and delete every recovery and verification challenge for the account.
4. Commit before returning success or attempting notification.

Session creation must take the same account-then-credential locks and compare the exact
password hash previously verified before insertion. Use an explicit stale-proof result so
the service returns 401, distinct from a genuinely unverified credential's existing 403.
Do not rely on an unlocked `INSERT ... SELECT` credential predicate: a statement snapshot
alone cannot establish the reset/session ordering.

```text
old-password check
        |
        v
   account lock <---- reset uses the same lock
        |
        +--> proof unchanged --> create session --> later reset revokes it
        |
        +--> proof changed   --> 401, no cookie
```

Align verification confirmation with the same explicit lock order while preserving its
credential-proof revalidation. If verification commits first, recovery preserves verified
status; if reset commits first, the old verification proof/link cannot succeed. Concurrent
resets using different links cannot overwrite a winning reset, since all old links are
deleted and the expected hash changes even when the chosen plaintext password is the same.
Renewal may finish if already authorized, but cannot clear revocation.

Relying only on bulk session revocation misses sessions inserted afterward with stale
password proof. A new credential-generation field could also solve this, but the existing
fresh salted credential hash supplies the needed equality proof without another column.

### 5. Share bounded mail infrastructure and preserve operator compatibility

Keep `readMailConfiguration`, Gmail's fixed authenticated TLS endpoint, explicit capture
selection, and masked startup unchanged in behavior. Reuse its validated `webOrigin` for
all account mail; keep `VERIFICATION_WEB_ORIGIN` supported and document its expanded role
rather than rename an existing operator setting.

Separate the SMTP transport from purpose-specific verification, recovery, and notification
content. Preserve the existing verification sender adapter as needed. Recovery links use
the fixed origin and `/reset-password#token=...`; notification has no token or password.
Provide English text/HTML using the existing mail visual language without tracking or
third-party assets. Use fixed safe event classifications for each purpose.

Inject one shared two-slot issuance/mail admission owner across verification and recovery,
including initial verification and post-reset notification. Acquire before account-dependent
issuance work, hold through the actual SMTP task, and allow no queue/retry. Do not add
another independent two-slot sender that silently doubles total mail concurrency. Each
SMTP attempt retains the five-second deadline and socket cancellation.

Send the reset notification once after commit if capacity permits. Capacity exhaustion,
SMTP failure, or a crash can suppress/lose it, but must not change reset success. A durable
outbox would improve delivery guarantees and requires a separate operational decision.
Runtime shutdown stops admission and drains shared mail plus password work under the
existing hard deadline; notification must never keep a transaction open for SMTP.

### 6. Extend existing HTTP and browser boundaries

Extend `module.ts`, `runtime.ts`, and startup wiring with recovery routes, safe error
mapping, trusted-origin/custom-header enforcement, fixed route classifications, CORS,
no-store, correlation, and nosniff. Keep parser limits and error logging unchanged in
meaning. Update the API client with exact response validation and credential omission.

Build the two pages in the existing account shell with English locale resources and shared
semantic Tailwind tokens. Reuse fragment lifecycle behavior from verification, including
Strict Mode, hash changes, route exit, pagehide/pageshow, and stale request suppression.
Any small shared lifecycle helper must preserve verification behavior; avoid an unrelated
form rewrite. Keep secrets out of query strings, server rendering, storage, and logs.
Retain no-referrer and no third-party resources on the reset page.

Use persistent labels, `new-password` autocomplete on both fields, paste support, useful
show/hide controls, focusable/announced feedback, and appropriate disabled/wait cursors.
Honor existing motion timings and reduced motion. Show conditional request acknowledgment,
generic invalid-link feedback, and an explicit success state explaining session revocation.
Offer sign-in and a verification-request link without inferring verification status.
Timeouts explain that the outcome is unknown and offer sign-in/new request rather than
automatic resubmission. Public pages must render without dependencies.

### 7. Keep evidence separate and extend existing test ownership

- Unit/HTTP coverage: input policy, response shape, cross-purpose tokens, digest-only
  issuance, expiry, cooldown/cap, privacy markers, origin/header protections, safe errors,
  capacity sharing, notification failure, disconnects, and shutdown drain.
- Guarded PostgreSQL coverage: reset/verification/sign-in/renewal ordering with controlled
  barriers, two-link single consumption, rollback at each mutation boundary, fresh install,
  unchanged replay, and rollout preservation. Extend owned fixture accounting for recovery
  rows and independent sentinel recovery challenges; clean exact IDs in dependency order.
- Browser/capture coverage: verified recovery plus old-session rejection; unverified reset
  followed by fresh verification; confirmation mismatch/policy errors; missing/used/expired
  links; uncertain outcomes; URL/memory lifecycle and absence of leaked synthetic markers.
  Exercise both themes, desktop/mobile, keyboard, autofill/paste, reduced motion, storage
  failure, and API-unavailable rendering. Review actual page and email rendering.
- Real Gmail acceptance: adapt the guarded acceptance approach into a recovery-specific
  command or isolated mode. It must require designated-recipient authorization, privately
  entered credentials, and confirmation of actual Inbox recovery/notification receipt.
  Use only owned guarded-test fixtures, then prove old access fails and explicit new
  sign-in succeeds. Never print/save received secrets or read a private inbox automatically.

Keep OpenAPI/README and a new recovery guide aligned with implementation, updating existing
session/verification/web guides and completion status. These are implementation tasks;
planning does not prematurely claim routes or evidence exist.

## Risks / Trade-offs

- Mailbox compromise permits password replacement -> treat recovery links as bearer
  authority, limit lifetime/admission, revoke all sessions/links, and send notification.
  This flow makes no claim to recover an independently compromised inbox.
- Requests can consume an account's mail cooldown/cap -> retain earlier live links and
  avoid changing access before confirmation; shared public abuse controls remain deferred.
- Different database paths retain measurable timing differences -> do not await SMTP or
  add artificial sleeps; test the common admission/response contract without claiming
  constant-time account lookup or public-deployment readiness.
- Best-effort notification can be lost after commit -> disclose the limitation and test
  that notification failure never rolls back recovery or invites unsafe retries.
- Lock ordering mistakes can deadlock or admit stale sessions -> explicit common account
  lock order, proof rechecks, finite transaction deadlines, and real concurrent DB tests.
- Deleting old verification links adds a step for unverified users -> explain fresh resend
  after reset and cover the full recovery-verification-sign-in journey.

## Migration Plan

1. Generate/review only the next migration and metadata. It adds recovery storage without
   changing existing credentials, verification timestamps, sessions, or old migration bytes.
2. Validate a confirmed fresh guarded target and unchanged replay on an existing guarded
   target. Never reset a development database to obtain evidence.
3. Before any later development-database application, confirm the exact target and obtain
   explicit authorization for that mutation; the past verification rollout does not grant
   blanket permission for future development migrations. Use the established private backup
   procedure and explicit migration command. Startup never applies schema.
4. Deploy/migrate only within an independently authorized environment. Missing required
   schema fails recovery safely; no startup repair or fallback changes credentials.
5. Prefer a forward fix. If application rollback is required, disable recovery access and
   retain a session-creation path that rechecks password proof; do not roll back that guard
   while resets can still run. Keep the additive table and committed password/revocation
   outcomes; do not restore old hashes or old sessions. Any removal needs a separate
   reviewed migration and authorization.

No unresolved product decision blocks the proposed implementation. Real credentials,
designated-recipient authorization, Inbox receipt, and guarded database availability are
later acceptance prerequisites, not evidence supplied by this proposal.
