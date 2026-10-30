# Design

## Context

See `proposal.md` for motivation and scope. The current schema already contains
nullable `accounts.email_verified_at`; nothing sets or enforces it. Registration
returns a committed creation/existing result internally but discards that distinction
at the public boundary. Session credential lookup, creation, and renewal currently
ignore verification. The API shares two expensive password-work slots between
registration and sign-in, uses one bounded PostgreSQL pool, and logs static routes.

There is no mail transport, challenge table, resend endpoint, or verification page.
Browser account requests use fixed API paths and strict response parsing. All pages
already have shared appearance, accessibility, and reduced-motion conventions.

## Goals / Non-Goals

**Goals:** bind mailbox control to the registered password, enforce that proof in
session authorization, preserve enumeration resistance and credential immutability,
and provide an actual local captured-email/browser journey with isolated evidence.

**Non-goals:** resetting passwords, letting a duplicate registration replace them,
external SMTP/provider integration, distributed mail workers, guaranteed delivery,
public deployment, general session cleanup, or changes to CI/protection/helpers.

## Decisions

### 1. Separate request and confirmation contracts

Add the following API contracts to the existing accounts module. Both endpoints
require `X-Commerce-Request: 1`, reject a present untrusted Origin before account
work, accept only JSON, omit browser credentials, and return no cookies. All responses
retain no-store, nosniff, and server-owned request correlation.

| Operation                                   | Input                                       | Successful response                                                    |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /accounts/email-verification/request` | Exactly `{email: string}`                   | 202 `{status: 'accepted', message: 'Verification request processed.'}` |
| `POST /accounts/email-verification/confirm` | Exactly `{token: string, password: string}` | 200 `{status: 'verified'}`                                             |

Request uses the current email canonicalization. Unknown, verified, cooldown-limited,
and cap-limited addresses receive the same acknowledgment without mail delivery.
Confirmation reuses sign-in's well-formed Unicode/NFC and raw-size limits, with no
new-password length/blocklist screening. Malformed shapes/encodings return generic
400; well-formed invalid/expired/used tokens, already verified accounts, and wrong
passwords share 401 `{error: 'invalid_verification', message: 'Request rejected',
requestId}`. Do equivalent-cost dummy verification when there is no eligible record.
Malformed persisted password parameters retain the existing safe failure behavior.

Known outages or missing required relations during request/confirmation work yield
generic 503/Retry-After 1; unexpected exceptions remain 500. Validate the required
challenge relation even for unknown/verified request paths so a missing relation is
not hidden by an early return. Transport delivery occurs after the response decision,
so SMTP failures do not produce account-dependent HTTP statuses. Database/network
timing is not claimed constant.

The existing sign-in route gains 403 `{error: 'verification_required',
message: 'Email verification required', requestId}` only after the password matches.
Unknown accounts and wrong passwords stay generic 401, including for unverified
accounts. A generic security-boundary 403 retains `http_403` and is not interpreted
as a verification prompt. Sign-in itself never sends mail. Inspection still uses
generic 401 for any unusable session, including an unverified account.

An email-only resend endpoint makes existing local unverified accounts reachable
without re-registering. Requiring a password for resend was rejected because it
unnecessarily couples message delivery to expensive work; confirmation always
requires both proofs. Public abuse controls remain a later deployment requirement.

### 2. Keep challenge persistence small and bounded

Add `account_email_verifications` with a server UUID primary key, account foreign
key with restricted deletion, unique 64-character SHA-256 token digest, and
server-owned `issued_at`/`expires_at`. Constrain digest syntax and expiry to exactly
30 minutes after issue; index account linkage. Generate 32 random bytes in canonical
base64url and pass only the digest to persistence.

Issuance locks the account row before touching challenges, rejects verified accounts
internally, prunes that account's expired challenges, and checks the newest retained
issuance time and row count. One issuance per 60 seconds and at most three retained
rows per account are proposed defaults. Use database time and account locking so
concurrent requests cannot bypass these limits. No record is created for an unknown
address. Token creation and cooldown reservation commit together.

Multiple live links are intentional: a failed resend must not invalidate a previously
delivered link. At the cap, acknowledge generically without sending until expiry
makes room. Since the latest issuance cannot expire within the 60-second cooldown,
its row also supplies the durable cooldown without a separate rate-limit table.
Confirmation deletes all challenges for that account, making every sibling/replayed
link unusable. No token-history or global cleanup worker is introduced.

JWTs were rejected because revocation/one-time use still require state. A single
rotating token was rejected because an unsuccessful resend could strand a delivered
link. Raw-token outbox storage was rejected for this digest-only local milestone.

### 3. Hash outside database locks, then confirm atomically

The confirmation service acquires the shared password-work slot and reads the live
challenge/account/credential snapshot, hashes the submitted password asynchronously,
then enters a short transaction. Never hold a database connection/row lock during
scrypt or SMTP. Invalid records still use bounded dummy password work.

The final transaction locks the account first, then rechecks the token's digest,
expiry, account binding, null verification timestamp, and unchanged password hash
against the snapshot that was verified. It sets the verification timestamp, revokes
all existing account sessions with `COALESCE(revoked_at, ...)`, and deletes all account
challenges before commit. All issuance/confirmation paths use this account-first
locking order. A changed credential or consumed token produces the generic failure;
a rollback preserves all previous state. Retain the work slot until underlying work
settles even after disconnect.

This transaction prevents two successful confirmations, partial verification, and
revival of legacy sessions. It does not reset the password or sign the user in. If
a response is lost after commit, a retry can return invalid-verification because the
token is consumed; the UI explains uncertainty and offers explicit sign-in/resend.

Mailbox-only confirmation was rejected: it could activate an account whose password
was chosen by someone else. The selected password-bound flow deliberately leaves
unknown-password collisions to the separate password-recovery milestone. Verification
establishes mailbox control, not a claim about a person's real-world identity.

### 4. Enforce verified sessions at the database boundary

Extend the credential contract with verification state. Perform password verification
before deciding between session issuance and verification-required feedback. Make
session insertion conditional on a currently non-null verification timestamp, rather
than trusting only the earlier credential lookup. Renewal checks account verification
alongside existing atomic expiry/revocation predicates and cannot renew an unverified
account's session. Sign-out remains idempotent and usable for legacy cookies.

The explicit migration permanently revokes all pre-existing sessions whose accounts
are unverified, without deleting rows or changing credentials. Confirmation also
revokes all extant sessions before establishing the verified state. Merely adding an
account-status check was rejected because it could make old sessions usable again
once verification succeeds. Existing verified-account sessions retain their ordinary
expiry/revocation behavior.

### 5. Bounded best-effort local SMTP

Use a pinned maintained Nodemailer SMTP client behind a small injected sender
interface. Do not implement SMTP by hand or tie account logic to Mailpit's HTTP API.
Disable transport debug logging, file/URL content loading, attachments, pooling,
external service presets, and implicit relay/authentication configuration. Messages
are application-authored English text/HTML with the configured sender, verification
URL, expiry, and instructions to ignore unsolicited mail; no remote tracking/artwork.

Server-only configuration:

| Setting                   | Development default     | Validation                                                                                 |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `MAIL_SMTP_HOST`          | `127.0.0.1`             | Literal loopback IP; no DNS/proxy/remote host                                              |
| `MAIL_SMTP_PORT`          | `1025`                  | Integer 1-65535                                                                            |
| `VERIFICATION_WEB_ORIGIN` | `http://127.0.0.1:3000` | Exact loopback HTTP(S) origin present in `WEB_ORIGINS`; no credentials/path/query/fragment |

Use fixed synthetic sender `Commerce <no-reply@commerce.test>`. Non-development
execution supplies these three values explicitly, including test fixtures and process
smoke; no production provider mode is added. Configuration fails before listening
with setting names only. Plaintext SMTP is an intentional loopback capture policy,
not a weakening of global TLS validation or authorization for external transport.
The root private `.env` loader remains database-only. API startup creates no SMTP
connection; a stopped inbox does not fail database readiness or public web rendering.

Reserve one of two independent issuance/delivery slots before account-dependent
request work; there is no waiting queue. The reservation covers challenge preparation
and subsequent SMTP work. Unknown/suppressed request paths release it immediately;
capacity exhaustion returns 503 for all address states. Initial registration keeps
its successful account/credential acknowledgment even when delivery cannot reserve
a slot or challenge preparation fails after commit. Duplicate registration never
invokes delivery; retain the internal creation result to distinguish this safely.

Commit a challenge before dispatching SMTP and finish the HTTP response without
awaiting transport. Retain each raw token only in the owned in-memory send task and
its intended email, with a five-second total SMTP deadline. Phase timeouts alone are
insufficient: the total deadline must cancel/destroy the owned connection, not merely
race an unresolved promise. Keep capacity occupied until cancellation settles. Expose
fixed delivery outcome classifications without recipients, bodies, URLs, raw errors,
or token/digest fields. Never detach an untracked promise or auto-retry a message.

Shutdown stops new mail/hash admission, drains both work groups, closes SMTP resources,
then closes the shared database under the current hard deadline. A crash can lose a
pending message; delivery is intentionally not durable. SMTP acceptance confirms only
capture-service acceptance. Generic user guidance always offers explicit resend.

For manual development, document a version-pinned Mailpit binary or container with
SMTP bound to `127.0.0.1:1025`, inbox bound to `127.0.0.1:8025`, no relay/release setup,
bounded temporary message storage, and synthetic addresses. Never rely on its default
all-interface bindings. Automated tests own a separate loopback SMTP capture fixture
on an isolated port and inspect only its messages; no shared developer inbox cleanup
or external service is required by the existing CI commands.

### 6. Fragment link and explicit browser submission

Construct only `<configured-origin>/verify-email#token=<secret>`. The fragment keeps
the secret out of HTTP request targets and SSR; a query token was rejected for those
reasons. Validate the fixed origin once in server configuration, never derive it from
Host, forwarded headers, arbitrary return URLs, or submitted email. Follow the
selected localhost/127.0.0.1 setup explicitly; do not silently rewrite the origin.

On `/verify-email`, read and validate the fragment into component-owned transient
memory and immediately replace the current history URL with the clean fixed route
before any API request or navigation. If URL cleanup fails, do not enable confirmation
or send a request; discard the captured token and show safe recovery instructions.
Set route-specific `Referrer-Policy: no-referrer`, avoid third-party resources, and
render no token in HTML, attributes, hidden inputs, feedback, or locale parameters.
No GET, preview, mount effect, prefetch, or automatic POST consumes a link.

The password form uses `autocomplete=current-password`, existing visibility/paste
patterns and sign-in validation semantics. Confirmation sends token/password only
as an explicit JSON POST with credentials omitted. Clear the password after a settled
attempt; retain the token on the current mounted page only for explicit retry after
a wrong password/network failure. Clear it on success, route exit, pagehide, and
history restoration. Reloading after cleanup intentionally requires reopening the
email. Browser/extension/email-provider records outside app control are not promised
to be erased. This URL exception applies to no other credentials.

`/verify-email/request` accepts email and provides the same conditional acknowledgment
for all valid responses. It does not expose developer inbox links or transport details
in product UI. Registration success and sign-in forms link to this route; no password
is transferred. Recognized sign-in verification-required feedback is distinct from
generic 403. After successful confirmation offer explicit sign-in without a session
or automatic request. The existing account page keeps its normal inspection behavior.

Follow shared Tailwind tokens, English locale resources, System/Light/Dark, control
cursors, keyboard focus, announced outcomes, password managers, no horizontal overflow,
and reduced motion. No new CSS exception or redesign is needed.

### 7. Validation fits existing entry points

Extend the existing unit/contract tests and guarded integration runner, rather than
adding a new CI workflow or test service. Browser tests use injected repositories and
an owned SMTP fixture; live tests use the guarded test database plus a separate owned
capture fixture. Update previous sign-in fixtures to verify through the new flow or
explicitly seed verified fixtures when testing unrelated session behavior. Keep
unverified fixtures for rejection, migration, and legacy-session regression cases.

Migration rollout tests use a separate test-owned prior-schema fixture and controlled
legacy rows. Existing live suite sentinel preservation is checked after approved
migration effects, never used to pretend the intentional rollout revocation did not
happen. No arbitrary database reset, unowned cleanup, or reuse of a developer inbox.
The actual local Mailpit journey is separate evidence from SMTP fixtures and browser
doubles. Preserve all existing gates, migration hashes, and generated-file policy.

## Risks / Trade-offs

- **Lost/failed mail or three undelivered links** -> Best-effort delivery is explicit;
  retain old links, bound cooldown/expiry, and offer resend without claiming arrival.
- **Local capture exposes verification secrets to its operator** -> Bind locally,
  disable relays, retain bounded temporary data, use synthetic accounts, and never
  treat capture as evidence of external deliverability.
- **Owner does not know the first registered password** -> Verification cannot reset
  it; make the limitation honest until the separate recovery milestone is delivered.
- **Email client rewrites/strips fragments** -> Verify actual Mailpit text/HTML links
  and desktop/mobile browsers; missing fragments fail safely and permit resend.
- **Existing accounts lose access immediately** -> Preserve accounts/passwords and
  provide the independent verification-request route; no automatic verification.
- **Migration and runtime versions overlap** -> Stop old local API processes for
  rollout; mixed-version deployment and fallback to unverified access are unsupported.
- **Process-local admission is bypassable across replicas** -> This remains local
  only; account issuance limits are transactional but not shared public abuse defense.

## Migration Plan

1. After separate implementation approval, add the challenge schema and reviewed
   explicit migration; never edit prior SQL/snapshots or migrate at startup.
2. Stop prior local API processes. Back up operator data through the normal operator
   workflow, then explicitly apply the migration to the intended development target.
   Automated acceptance runs only against guarded dedicated test targets.
3. The migration creates challenge constraints/indexes and revokes existing
   unverified-account sessions. It never sets verification timestamps or rewrites
   passwords. Test fresh installation on a confirmed fresh target and unchanged replay
   separately; do not reset an existing target to manufacture evidence.
4. Start the loopback capture inbox and new API/web with matching explicit web origin.
   Existing users request verification, confirm the registered password, and sign in.
5. On operational failure, stop the new runtime and repair forward while keeping the
   verified-only boundary and revoked sessions. Do not roll back by restoring the old
   unverified-sign-in binary, unrevoking sessions, dropping account data, or editing
   migration history. Any destructive rollback needs separate review/authorization.

## References

- [OWASP email validation and verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html): single-use expiring proofs and sensitive-token handling.
- [Nodemailer SMTP transport](https://nodemailer.com/smtp): standard SMTP integration with explicit transport settings.
- [Mailpit runtime options](https://mailpit.axllent.org/docs/configuration/runtime-options/): explicit bind addresses and bounded local message retention.
- [Account pre-hijacking research](https://arxiv.org/abs/2205.10174): why mailbox proof must not inadvertently activate attacker-selected credentials or retained sessions.
