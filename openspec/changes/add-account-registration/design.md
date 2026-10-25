# Design

## Context

See `proposal.md` for motivation and `specs/account-registration/spec.md` for the
behavior contract. This is a proposal for owner review, not an implementation
record or approval to apply it.

Observed baseline after fetch: PR #4 is merged; local `main` and `origin/main`
resolve to `3eb7ab25662051cae07f9d60c58c1d8468b0bea7`. Planning starts on
`feat/add-account-registration` with no prior active changes or dirty files.

- `apps/api/src/runtime.ts` creates a small Nest runtime with health controllers,
  injectable operational resources, exact-origin CORS, trust proxy disabled,
  redacted errors/logs, bounded parsing, and graceful shutdown. Its exception
  filter currently preserves only 400/404/413/415, and CORS advertises GET/OPTIONS.
- `packages/database` owns one bounded pool and transaction helper. Its schema and
  application migration journal are empty. Consumers use its public compiled
  entry point; the web must not import it.
- `scripts/integration-migrations.cjs` applies real repository history twice and
  checks journal identities/hashes, catalog definitions, and repeated SQL. Existing
  technical workers cover failed-migration rollback and independent sentinels.
  `OwnedSchema` tracks fixture intent and confirms creation before exact cleanup.
- The existing CI database job already runs the root integration command against
  a fresh disposable PostgreSQL service. Its application history is currently
  empty. Local tests may encounter already-applied history on later invocations.
- Database guards, local plaintext transport, private environment handling, finite
  limits, Git authorization, and archived records remain governing constraints.

## Goals / Non-Goals

**Goals:** Provide a narrow API/repository boundary, a compatible future credential
format, explicit duplicate/race semantics, bounded resource use, and acceptance
evidence that distinguishes offline, existing-database, and fresh-install results.

**Non-Goals:** Build no future account flow, role system, mail infrastructure,
distributed limiter, production proxy/TLS setup, migration reset/down framework,
or capacity benchmark. No new workflow, deploy, secrets, or GitHub settings edit
is needed. Public launch remains gated by the separate verification/recovery and
deployment decisions recorded in the handoff.

## Decisions

### 1. Compose an accounts module without giving HTTP code database ownership

Place validation, password policy/hashing, registration admission, controller, and
service in `apps/api/src/accounts/`. Wire a narrow repository port in Nest; implement
it in `packages/database/src/accounts.ts` using the existing Database instance and
public package exports. The HTTP runtime keeps health and lifecycle ownership.
Avoid a second pool, app-to-app imports, database access from web, or direct imports
of package source internals. Test composition can substitute repository, clock,
UUID generation, and hasher without changing public request input.

Hash before acquiring a database connection. Pass canonical email, a generated
UUID, and encoded credential into the repository, never a plaintext password.
Repository results distinguish committed creation from existing identity only
inside the server. Do not export a general email-existence endpoint or implement
sign-in/password verification APIs as incidental helpers.

### 2. Use a strict, deliberately limited email identity policy

The initial contract accepts ASCII email only. Lowercase the full address after
trimming surrounding SP/HTAB; store only the canonical value. Full-address case
insensitivity is a product choice for review, including the local part; it does
not claim all SMTP providers treat case identically. Reject quoted/display-name
forms, address literals, raw internationalized addresses, controls, and whitespace
inside the address. No SMTP/DNS query or ownership claim follows from syntax.

Local syntax is dot-separated nonempty atoms whose characters are ASCII letters,
digits, or `!#$%&'*+/=?^_` plus backtick, braces, pipe, tilde, and hyphen. The local
part is at most 64 bytes. Domain labels are 1-63 ASCII letters/digits/hyphens,
start/end with a letter or digit, and form at least two labels without a trailing
dot. Already-ASCII punycode labels follow these rules without conversion; raw
Unicode domains do not. Canonical total length is at most 254 bytes. Bound raw
email input to 1024 UTF-8 bytes before processing. Preserve dots and plus suffixes.

This avoids provider-specific alias assumptions and locale-dependent identity.
Supporting Unicode local parts or changing canonicalization later needs a separate
compatibility/migration decision. Lowercasing only the domain was considered but
would allow confusing case-variant registrations under the intended identity UX.

### 3. Keep password policy local, Unicode-aware, and reproducible

Reject ill-formed Unicode and raw input over 1024 UTF-8 bytes, then apply NFC and
require 15-128 Unicode code points. Preserve case and all spaces; never trim,
truncate, or require mixed character classes. The upper bound allows long
passphrases while bounding work. This follows the length/Unicode approach in
[NIST SP 800-63B-4 section 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)
without claiming overall NIST assurance or compliance.

Vendor the public [SecLists common-password corpus](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10k-most-common.txt) as
policy data, retaining its [MIT license](https://github.com/danielmiessler/SecLists/blob/master/LICENSE).
During apply, record the exact upstream commit, byte checksum, entry count, and
license in the asset's provenance document; no runtime download or dependency
install fetch is allowed. Compare whole NFC/lowercase strings against that corpus,
the submitted canonical email/local part, and exact service derivatives
`commerceapp12345`, `commerce_app12345`, and `commerce-app12345`. Context matching
uses only submitted input, with no account lookup. Case folding applies only to
screening, never to the bytes hashed. Test an allowed phrase containing a listed
word to prevent accidental substring rejection.

The corpus is a modest initial common-password screen, not a complete breached
password database. It must include accepted-length rejection fixtures, its checks
must run for both new and duplicate addresses, and missing/corrupt packaged data
must fail startup safely rather than silently disable screening. Build/copy the
asset through a cross-platform Node step if needed; test production artifact
loading. An online breach service was rejected because this milestone should
need no outbound request, private password disclosure, or external service.

### 4. Use stable built-in asynchronous scrypt with bounded concurrency

Use Node `crypto.scrypt`, N=131072, r=8, p=1, 16 random salt bytes, 64 output bytes,
and explicit maxmem=192 MiB. Store the ASCII encoded format:

```text
scrypt$v1$131072$8$1$<base64url-16-byte-salt>$<base64url-64-byte-key>
```

`v1` includes the NFC/UTF-8 convention. Require canonical unpadded base64url and
fixed lengths. A future session change must parse this format with bounded
parameters and safe constant-time comparison; that verifier is outside this change.

The selected cost is an [OWASP scrypt parameter set](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
Argon2id is OWASP's preferred choice; stable built-in scrypt avoids adding a native
dependency or relying on Node's experimental Argon2 API in this Windows/Linux
workspace. Revisit algorithm choice through explicit versioned credential support
if future deployment needs it. Do not lower cost to make tests fast: a small real
hash test subset uses production parameters; orchestration tests inject a hasher.

Allow at most two complete registration operations in flight per process, including
hashing and persistence. This bounds concurrent scrypt work at roughly 256 MiB of
working memory; the two explicit maxmem allowances total 384 MiB, plus application
overhead. These are budgets, not measured process RSS. Do not queue hash jobs or
add pools/threads dynamically. Record a small real-hash timing/RSS observation
during implementation; failure to fit the available budget is a design review
issue, not permission to weaken cost silently. Clear owned sensitive buffers when
possible, while acknowledging JavaScript strings cannot be reliably zeroized.

### 5. Persist a minimal ordinary identity and a separate password credential

| Table | Columns and constraints |
| --- | --- |
| `accounts` | `id uuid` primary key generated by server `randomUUID`; `email_normalized varchar(254)` not null with named unique constraint `accounts_email_normalized_key`; `created_at timestamptz` not null default now; `email_verified_at timestamptz` nullable default null |
| `account_passwords` | `account_id uuid` primary key referencing `accounts.id` with ON DELETE RESTRICT; `password_hash text` not null containing the versioned format |

Keep canonical-email checks in validation and add database checks for lowercase,
ASCII, nonempty identity. No buyer/seller-exclusive role, admin flag/grant,
business store/approval, session, verification token, or recovery table is needed.
Null verification time records lack of ownership proof without defining later
sign-in permissions. No public operation in this change can set it.

Within one existing Database transaction: insert the account with an explicit
UUID and `ON CONFLICT (email_normalized) DO NOTHING RETURNING id`; insert its
password row only if this transaction created the account. Return internal
`created` only after COMMIT succeeds; otherwise return `existing` for the email
conflict. Do not perform an existence precheck or use DO UPDATE. Let PostgreSQL's
unique constraint serialize competing canonical identities. Unexpected constraints,
hash failures, missing schema, or commit failures are not duplicate success.

Two tables add one insert but make the credential boundary explicit and give the
live suite a meaningful partial-write rollback assertion. Credential and account
IDs never enter the public acceptance payload. Existing-row contents, including
verification timestamp, remain untouched even when a duplicate uses another password.

### 6. Give valid new and duplicate requests the same truthful response

| Outcome | Contract |
| --- | --- |
| New account committed / existing identity confirmed | 202, exactly `{"status":"accepted","message":"Registration request processed."}` |
| Input/policy error | 400, `error=invalid_registration`, fixed `message=Invalid registration request`, safe `field` and `code`, server `requestId` |
| Rate limit / full peer-bucket storage | 429, existing safe error envelope, positive integer Retry-After |
| In-flight cap / shutdown / recognized dependency unavailable | 503, existing safe error envelope, Retry-After 1 |
| Unexpected internal failure | 500, existing generic internal-error envelope |

Allowed error fields are only `body`, `email`, `password`; codes are `required`,
`invalid_type`, `invalid_body`, `unexpected_field`, `invalid_email`,
`password_encoding`, `password_too_large`, `password_length`, and
`password_blocklisted`. Select the first error deterministically: body shape/extra
fields, email, then password. No submitted field name or value is interpolated.
Validation runs before hashing/repository work, independently of account existence.

Both accepted paths derive a fresh hash before resolving uniqueness. This removes
the obvious cheap duplicate timing path; it does not promise identical SQL/network
timing or conceal all future authentication side channels. A generic 202 keeps
account outcome private without pretending to send email or enqueue a job. No
Location, account representation, credential, session, or Set-Cookie is returned.

Extend the safe boundary to handle intentional registration 429/503 and the
validated 400 envelope; continue mapping unexpected exceptions to generic 500.
Map recognized connection/acquisition/query-timeout errors and missing account
relations to safe 503; do not log raw driver exceptions or suppress other errors.
Set no-store on every registration response. Keep X-Request-Id/nosniff, parser
limits, and graceful shutdown. Add only the static registration route to safe
completion-path logging. Advertise POST alongside existing methods for exact
configured CORS origins; CORS remains browser permission, not authentication.

### 7. Bound current local abuse without inventing a deployment architecture

Before field validation, count parsed POST attempts to the registration route,
including malformed field shapes, in a process-local fixed 60-second window
anchored at the peer's first attempt. Admit five attempts; use a monotonic clock.
Parser-level malformed/oversized/media-type failures retain existing statuses and
do not reach this counter. Identity is the socket peer address, normalizing
IPv4-mapped IPv6; ignore Forwarded/X-Forwarded-For and leave trust proxy false.

Cap the map at 1024 peer buckets. Prune expired entries on admission; never evict
unexpired buckets to admit a new peer. For an exhausted peer return 429 with
ceil(remaining-window-ms/1000), minimum 1. For a full map, reject a new peer with
429 and time until earliest bucket expiry. An otherwise eligible request acquires
one of two operation slots after validation, then hashes and persists; with no
slot return 503/Retry-After 1 immediately. Every parsed attempt consumes rate
budget even if a later validation/slot check fails. Health routes do not use it.

Release slots in finally after underlying work settles on every result, including
after client disconnection; a disconnect must not release a slot while scrypt or
database work still runs. An admitted request can commit after its client leaves;
retry must remain safe. Shutdown stops new work and drains existing work under
the established deadline; no Promise.race that leaves uncounted work behind.

These counters are transient resource protection, not authoritative account state
or a cross-replica guarantee. Restart resets them; replicas multiply allowances;
all current loopback clients may share one peer budget. Do not add an email-keyed
lockout that lets an attacker deny registration for a victim. A shared limiter,
trusted-proxy identity, public HTTPS ingress, and appropriate bot controls require
a deployment-specific follow-up before public exposure. Redis or a PostgreSQL
limiter table would add disproportionate authority/retention/cleanup requirements
for the current local milestone.

### 8. Extend the existing live gate rather than bypassing its ownership rules

Add account repository/HTTP integration phases to the root integration command,
building the API first if a compiled runtime harness is required. Use its existing
guarded database and finite connection budget; API composition reuses that pool.
Keep serial ownership and the coordinator/failure-child aggregate budget from the
foundation. Unit/process smoke still runs without PostgreSQL or root `.env`.

The test harness wraps the injected repository and UUID factory: register exact
candidate IDs before writes and confirm only an internal `created` result after
commit. A generic 202, duplicate, failed insert, or uncertain commit confirms no
ownership. No public test endpoint, caller-selectable account ID, email-prefix
deletion, or production fixture hook is added. If commit outcome is uncertain,
fail cleanup for review rather than assuming the candidate row is owned.
Track terminal no-creation outcomes separately: a known duplicate or confirmed
rollback retires its candidate only after verifying that candidate ID is absent,
without deleting anything. Pending/uncertain outcomes remain incomplete; an
unconfirmed intention is never converted into ownership to make cleanup pass.

Coordinator-owned account/password sentinel rows remain outside worker ownership.
After both successful and deliberately failing workers, independently read exact
sentinel contents, catalog definitions, and application journal; assert workers'
confirmed rows are absent. Remove only confirmed password IDs then account IDs,
and remove coordinator records only after preservation passes. Missing/conflicting
ownership fails safely. Retain the technical migration-failure child and original
sentinel checks; account rollback tests supplement them.

Prove the new account/password transaction rollback using a test-owned injected
failure after the actual account insert and before credential completion; a fresh
read must find no partial pair and subsequent work must succeed. Do not install a
global trigger, terminate unrelated sessions, or reset the database to simulate it.

## Risks / Trade-offs

- An address can be reserved before ownership verification. Mitigation: keep
  verification null, prevent public launch, and require the later verification
  proposal to address unverified sign-in/restrictions and existing unverified
  registrations without treating duplicate signup as password reset.
- ASCII-only, fully case-insensitive identity excludes some valid mailboxes.
  Mitigation: make this reviewed API contract explicit; future expansion requires
  compatibility analysis rather than silent normalization changes.
- Scrypt consumes substantial memory and shared worker-pool time. Mitigation:
  two-operation admission cap, no queue, production-parameter tests, measured local
  evidence, and no capacity claim. Rate windows permit boundary bursts and reset
  on restart; they are only current local protection.
- Generic acceptance gives no proof of creation to the caller. Mitigation: the
  message states only processing, and later account flows must preserve this
  privacy decision while defining recovery/verification UX separately.
- Public corpus freshness is limited. Mitigation: preserve provenance/license,
  test real accepted-length matches, and review policy before public launch.
- Application schema survives tests by design. Mitigation: only confirmed fixture
  rows are cleanup-owned; an existing database replay never counts as fresh install.

## Migration Plan

1. After owner approval to apply, define schema and generate the first normal
   application migration using `db:generate`; review SQL, constraints, indexes,
   foreign key, snapshot, and journal together. Commit reviewed migration source
   and Drizzle metadata as required versioned inputs, not unrelated build output.
2. Tests execute migrations only through guarded TEST_DATABASE_URL. API startup
   never runs them. Local development migration is an explicit operator command;
   automated validation never executes against DATABASE_URL or alters `.env`.
3. Apply unchanged repository history twice with the existing shared helper.
   Require non-empty history, expected real tables/constraints, exact journal
   hashes/identities, unchanged catalog definitions, and no repeated application SQL.
   Record whether the target was fresh before the first invocation. A migration
   failure rolls back application DDL/entries transactionally; pre-created empty
   Drizzle journal metadata may remain and is not misreported as absent.
4. Confirm fresh-install evidence on the already configured disposable CI database
   after separately authorized publication, unless the initial guarded local run
   already proves a fresh target. Do not reset an existing local database, invent
   a third URL, or claim moving the journal schema isolates application tables.
   Record actual fresh/replay evidence and keep any missing gate incomplete.
5. If rollout fails, stop registration ingress or restore the previous application
   build while retaining tables, credentials, and history; additive tables do not
   affect the previous health-only API. Repair forward with a reviewed migration.
   No automatic down migration, dropped account data, role/grant changes, or public
   deployment step is part of this plan.

Owner approval of these proposed choices is required before apply. Any later push,
PR creation, pipeline commit, or merge retains its separate Git approval boundary.
