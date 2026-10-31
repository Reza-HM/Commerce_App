# Password recovery

Password recovery lets the owner of a registered inbox choose a new password without
knowing the old one. It supports verified and unverified accounts, preserves verification
status, revokes all sessions, and requires explicit sign-in afterward. An unverified
account must request a fresh verification email and confirm with the replacement password.
Public deployment, shared abuse protection, and general session retention remain deferred.

## Browser journey

Use **Forgot your password?** from sign-in or verification, or open `/forgot-password`.
Request acknowledgment is conditional: an eligible account may receive mail; the page
does not disclose whether an account exists or promise delivery. Open the received reset
link, enter and confirm a new password, then explicitly submit **Reset password**.

The incoming `/reset-password#token=...` fragment is captured in transient memory and
removed from the active URL before interaction. GET, preview, and prefetch do not reset
anything. Reload or history restoration requires reopening the email link. No password or
token goes into application storage, logs, server-rendered output, or navigation to sign-in.
The reset page has no-referrer and no third-party resources. Emails and external browser or
extension records remain outside the application's erasure guarantees.

Success means the database committed password replacement, all-session revocation, and
invalidation of all recovery/verification links together. Existing cookies cannot restore
revoked sessions. A timeout can follow commit: try signing in with the replacement password
or request another link rather than assuming rollback. An old verification link becomes
invalid after recovery; explicitly request a fresh one if still unverified.

## Contract and resources

See [the portable HTTP contract](api/README.md#password-recovery) and
[OpenAPI](api/openapi.json) for request/response schemas and parser errors.

- `POST /accounts/password-recovery/request`: exactly `{ "email": "reader@example.test" }`.
  Existing canonical identity rules apply. Valid admitted known/unknown/suppressed requests
  return 202, `{"status":"accepted","message":"Password recovery request processed."}`.
- `POST /accounts/password-recovery/confirm`: exactly token and password strings. Live
  proof plus an acceptable replacement returns 200, `{"status":"password_reset"}` after
  commit. No session, cookie, account identity, or verification status is returned.
- Both endpoints require `X-Commerce-Request: 1` and reject a present Origin outside exact
  `WEB_ORIGINS` with 403 before account work. Browser credentials are omitted. Responses are
  no-store, correlated, and nosniff. Tokens are accepted only in confirmation JSON.
- Malformed shape/token returns 400 `invalid_recovery`; new-password policy failure adds
  `field: password` and a supported password reason code. Unusable well-formed tokens and
  stale proofs share 401 `invalid_recovery`. Parser 400/413/415 remain separate. Recognized
  required-storage outages return generic 503; unexpected failures return generic 500.
- Each endpoint admits five parsed attempts per direct peer per 60 seconds, with 1024 live
  buckets per process. Forwarding headers do not change identity. Limits return 429 with
  positive Retry-After. These are local limits, not shared public protection.
- Password derivation shares the existing two slots with registration/sign-in/verification.
  Issuance and mail share a separate two slots across initial verification, resend, recovery,
  and reset notification. There is no queue or retry; saturation returns 503/Retry-After 1
  before account-dependent work. Slots stay held until actual work settles, even after a
  client disconnect. Health probes remain independent; shutdown uses the existing deadline.

Replacement uses the current registration policy: valid Unicode, at most 1024 raw UTF-8
bytes, NFC, 15–128 code points, no trimming/case folding for hashing, local common-password
and service-name screening, and the bound account's canonical email/local part. The caller
cannot choose another screening identity. Password history is not enforced. Salted scrypt
parameters remain N=131072, r=8, p=1, a fresh salt of at least 16 bytes, and a 64-byte key.
Sign-in and verification continue to verify existing passwords without new-password policy.

## Storage and concurrency

The additive `0003_password_recovery.sql` migration creates `account_password_recoveries`:
UUID ID, restricted account foreign key, unique SHA-256 digest, issuance/expiry timestamps,
fixed 30-minute expiry constraint, and account index. Raw secrets contain 32 random bytes
as canonical base64url and never enter persistent application storage. Verification and
recovery have distinct tables and authority. A token from one cannot serve the other.

Issuance locks the account, removes only its expired recovery rows, and enforces one new
challenge per 60 seconds with at most three retained live links. Another request or SMTP
failure does not invalidate an earlier live link. Successful reset invalidates all links.

Reset, session insertion, and verification confirmation take account then credential locks.
Reset rechecks the live challenge and unchanged credential proof before mutation. Session
creation rechecks the exact hash verified by sign-in: reset-first returns stale-proof 401;
session-first is included in reset revocation, including when its cookie response is late.
Verification-first preserves the new verified timestamp; reset-first rejects old proof.
Revocation cannot be undone by renewal. Already-authorized work can finish.

Startup never migrates or repairs schema. Use the explicit migration path; old migration
bytes remain unchanged. Applying this migration to a development database requires separate
target authorization and the established private backup procedure. Do not restore old
passwords/sessions to roll back a reset; prefer a forward fix and retain the session guard
whenever recovery can run.

## Mail and operator setup

Use `npm run dev:api:gmail` for private masked Gmail setup; a restart needs the App Password
again. Gmail remains the default authenticated TLS provider; capture requires explicit
`MAIL_PROVIDER=capture` and a validated loopback endpoint. No new credentials/provider are
introduced. `VERIFICATION_WEB_ORIGIN` remains compatible and supplies the trusted fixed
origin for verification and recovery links. Submitted Host/forwarding fields cannot choose
the link origin. Never put credentials or received links into chat, files, or CI.

After a default-origin `npm run build`, run `npm run mail:gmail:accept:recovery` in a private
interactive terminal with ports 3001 and 4310 free. The command uses the sender Inbox,
prompts privately for the App Password and received reset link, and requests actual Inbox
receipt confirmations. It creates a verified owned fixture only on the guarded test
target, proves old access rejection plus explicit new sign-in/sign-out, and removes exact
owned records. It refuses a noninteractive terminal before setup. Its ignored acceptance
report contains only safe outcome fields, never addresses, credentials, passwords, or links.

For an isolated acceptance build under `.local/`, the operator helper also accepts
`RECOVERY_ACCEPTANCE_WEB_DIR` and `RECOVERY_ACCEPTANCE_API_PORT`. The selected loopback API
port must match that build's public API origin; the email/web origin remains port 4310.
The helper rejects builds outside `.local/` (apart from its default `apps/web`) and invalid
ports. These are acceptance-only settings; they do not change normal API/web startup.

Recovery mail explains expiry and unsolicited requests. Reset notification contains no
password or token and offers recovery instructions for unauthorized changes. Notification
is attempted once after commit when a shared mail slot is available. SMTP failure,
saturation, shutdown, or process loss can suppress it without changing reset success.
There is no durable-delivery promise, tracking, external artwork, or automatic retry.

## Validation evidence

On 2026-10-31, guarded PostgreSQL 18.6 integration on the existing test target passed four
migration replays, four reset rollback boundaries, both sign-in/reset lock orders, both
verification/reset lock orders, two-link single consumption, resend/expiry, renewal
revocation, and independent sentinel preservation after successful/failing workers.
This run reported `freshInstall=false`; it is replay evidence. A separately created,
confirmed fresh guarded test database then passed the same suite with `freshInstall=true`
and was removed only after confirmed creation and successful cleanup.
Fixtures used exact confirmed-owned identities and preserved unrelated schema/history.

Browser acceptance passed 40 main journeys and two localhost checks across the existing
account flows and recovery. Actual desktop/mobile page and email rendering was reviewed
in both themes, including keyboard use, narrow layout, 200% zoom, reduced motion, system
appearance/persistence, and blocked storage. Six process smoke cases, production builds,
API documentation lint/build, typechecking, and focused policy/service/repository checks
passed. Final formatting/lint, workspace typechecking, all 321 unit tests across 33
suites, and strict validation of all 11 current-spec/change items passed. Required hosted
CI still has to pass for the published PR head before delivery.

The owner separately authorized a development backup and migration on 2026-10-31. The
verified private backup is retained under ignored `.local/backups/`. The explicit migration
advanced `commerce_db` from three to four journal entries; server-side row fingerprints
confirmed unchanged accounts (2), credentials (2), sessions (8), and verification challenges
(1), with zero recovery rows. This operator rollout is separate from automated test evidence.

Owner-confirmed real recovery/notification Inbox receipt remains pending. Capture and
SMTP acceptance do not establish real receipt. Ordinary tests and CI
use synthetic isolated capture and guarded test targets, never private inboxes or the
development database.
