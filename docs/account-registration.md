# Account registration

Registration is available through the API and the [account browser flow](account-web-flow.md).
Email verification/delivery and password recovery remain separate changes; verification
and recovery are required before public launch. One ordinary account can later buy
and sell. Registration grants no administrative privileges or business approval.

## Persistence and migrations

`accounts` has a server-generated UUID primary key, a nonempty lowercase ASCII
`email_normalized` (up to 254 bytes, unique), database creation timestamp, and
nullable email verification timestamp initially null. `account_passwords` has one
primary/foreign `account_id` and a versioned `password_hash`. Its foreign key uses
ON DELETE RESTRICT. Sessions are separate; no role, verification-token, or recovery table exists.

Review generated SQL, Drizzle snapshot and journal together:

```text
npm run db:generate
npm run db:migrate
npm run test:integration
```

Normal explicit migration uses DATABASE_URL. Automated tests and test-mode
migrations use only guarded TEST_DATABASE_URL with NODE_ENV=test and never fall
back. Root commands privately load the ignored `.env` without overriding process
settings. Existing loopback-only plaintext transport and finite limits still apply.
Startup does not migrate, reset, repair, or synchronize schema. Never reset the
test database to manufacture fresh-install evidence. See [foundation.md](foundation.md).

The schema is additive. If rollout fails, restore the previous health-only build
while retaining account tables/data/history, then repair forward through a reviewed
migration. There is no automatic destructive down migration or database reset.

The server-only AccountRepository uses the existing pool. It inserts the account
with `ON CONFLICT (email_normalized) DO NOTHING RETURNING id`, and inserts its
credential only when that transaction created the account. Both writes commit or
roll back together. A duplicate never updates existing credentials or timestamps.
Its internal created/existing outcome is not returned over HTTP. A rejected or
uncertain commit proves no fixture ownership; driver failures propagate to the
safe API boundary, rather than being treated as duplicate success.
Every transaction first performs a zero-row credential-relation check (account ID
column only, no hash or existence read), so missing required credential schema
cannot yield acceptance for duplicates while rejecting new addresses.

Live validation requires non-empty repository account history and the real table
constraints, applies that unchanged history twice, and compares exact journal
identities/hashes and catalog definitions. It verifies that replay repeats no
application SQL. `application.freshInstall` is true only when the pre-migration
catalog has no user relations and the application journal is empty; otherwise the
result is replay on an existing target. Retain the first fresh evidence rather
than resetting anything on later runs. Technical failed-migration rollback and
original independent sentinel tests remain mandatory.

## Fixture ownership and live evidence

Account tests register exact candidate UUIDs before insertion. Only an internal
created result after commit confirms ownership; generic HTTP acceptance does not.
Known conflicts and confirmed rollbacks retire a candidate only after independent
reads prove its account/credential absent. Unknown commit outcomes remain pending
and fail cleanup for explicit review. Confirmed rows are removed by exact keys,
credential first then account. No email/prefix sweeps, truncation, cascading drops,
or application journal/table deletion is permitted.

Successful and deliberately failing workers must leave coordinator-owned account
and credential sentinel rows byte-for-byte equivalent, retain schema definitions
and application journal, and remove only their own confirmed records. The
coordinator independently reads preservation before deleting its own rows.
Cleanup failure remains a failed gate; unsafe or missing targets never skip/fall
back. Run only one suite/migration owner per test target.

2026-10-26 first application migration run: Windows, Node 24.20.0, PostgreSQL 18.6,
guarded `commerce_test`, local plaintext. Actual root integration passed with
`application.count=1`, `empty=false`, `freshInstall=true`: the pre-migration catalog
had no user relations and no application history. Unchanged second-run replay,
technical commit/rollback/failed-migration rollback, expected failing child exit 1,
and both original worker sentinels passed. This is real fresh application-install
evidence; later runs must report existing-target replay instead.

## Input policy

Accept exactly string `email` and `password` fields; unknown fields (including
privilege/verification assignments) fail validation. Validate body, then email,
then password. Errors contain fixed safe field/reason codes and never input values.

Email: raw limit 1024 UTF-8 bytes; ASCII only, trimming only outer SP/HTAB and
lowercasing the whole address. Accept a dot-atom local part up to 64 bytes, at
least two DNS labels of 1-63 alphanumeric/hyphen characters with alphanumeric ends,
and at most 254 canonical bytes. No controls, internal whitespace, quoted forms,
address literals, trailing domain dot, raw Unicode, DNS checks, or provider alias
rewrites. ASCII punycode labels are syntax-checked without conversion. Dots and
plus suffixes remain significant. Local-part case insensitivity is deliberate.

Passwords: well-formed Unicode, raw limit 1024 UTF-8 bytes, then NFC and 15-128
Unicode code points. Spaces and case remain significant; no trimming, truncation,
or composition rules. Whole NFC/lowercase matches against the common-password
corpus, submitted email/local part, and `commerceapp12345`, `commerce_app12345`,
`commerce-app12345` are rejected; hashing preserves normalized case. These checks
do not look up an account or use an external service. The local corpus is an
initial common-password screen, not exhaustive breach coverage.

The pinned public corpus, MIT notice, SHA-256, exact upstream commit and actual
10001-entry count are documented in
`apps/api/src/accounts/assets/PROVENANCE.md`. Git preserves its exact bytes.
The build copies committed assets; the runtime validates checksum/count and fails
startup safely for missing/corrupt data. No install or runtime network fetch occurs.

## Credential format and resource budget

Use asynchronous Node scrypt with N=131072, r=8, p=1, maxmem=192 MiB, random
16-byte salt, and 64-byte derived key. Store
`scrypt$v1$131072$8$1$<base64url-salt>$<base64url-key>` using unpadded canonical
base64url. Version 1 includes NFC/UTF-8. Session sign-in parses bounded
parameters and compares derived keys safely; registration itself issues no session.
Owned buffers are cleared when possible, but JavaScript strings cannot be reliably
zeroized. Plaintext and derived credentials never belong in HTTP/log output.

Two concurrent operations budget roughly 256 MiB scrypt working memory, with
384 MiB total maxmem allowance plus application overhead. This is a resource
budget, not measured capacity. Production-cost tests cover real salts/key derivation;
orchestration tests inject hashing. After building the API,
`node scripts/measure-password-hash.cjs` records a small two-operation latency/RSS
observation without printing password/hash material.

2026-10-26 local observation (Windows, Node 24.20.0): two concurrent operations
finished in 576 ms; sampled baseline RSS 36 MiB and peak 293 MiB. This small
synthetic observation does not establish throughput, production latency, or scale.

## HTTP contract

`POST /accounts/register` accepts `application/json` with exactly email/password.
New and existing canonical addresses both receive HTTP 202 and exactly:

```json
{"status":"accepted","message":"Registration request processed."}
```

This confirms processing, not creation or email delivery. Both valid paths perform
a fresh hash before database uniqueness resolution. No duplicate-email precheck,
account ID/email/existence flag, Location, session, token, or cookie is returned.
Hash work is equalized; SQL/network timing is not promised to be constant.

| Outcome | Response |
| --- | --- |
| Validation/policy | 400: `error=invalid_registration`, fixed `message=Invalid registration request`, safe `field`, `code`, server `requestId` |
| Peer budget/map capacity | Generic 429 with positive integer Retry-After |
| Operation saturation/shutdown/recognized database outage, timeout or missing account schema | Generic 503 with Retry-After 1 |
| Unexpected failure | Generic 500 `internal_error` |
| Malformed JSON / oversized JSON / unsupported media | Existing generic 400 / 413 / 415 |

Fields are only body/email/password. Codes: required, invalid_type, invalid_body,
unexpected_field, invalid_email, password_encoding, password_too_large,
password_length, password_blocklisted. Error responses never echo input or raw
exceptions. Parser failures occur before field validation and retain their generic
envelope. All registration responses are no-store with X-Request-Id/nosniff.
Completion logs use only the static route, status, duration, and generated request
ID, never email/password, hashes, cookies, authorization, query, or forwarded identity.
Exact configured CORS origins may use POST; CORS is browser permission, not auth.

## Admission and lifecycle

Per process, count five parsed registration POST attempts per direct socket peer
in a fixed 60-second window from its first attempt. Normalize IPv4-mapped IPv6,
ignore forwarded identity headers, and retain trust proxy disabled. Invalid fields
consume budget; parser-level 400/413/415 do not. Expired buckets are pruned; at most
1024 live peer buckets exist and none is evicted to admit a new peer. 429 Retry-After
is the ceiling of remaining seconds (at least 1), or earliest expiry for map capacity.

After validation, allow two complete hashing/persistence operations, with no queue.
Saturation returns 503/Retry-After 1. Keep slots until underlying work settles even
after disconnect; an admitted request can commit after its client leaves. Retry
therefore never replaces a credential. Shutdown stops admissions and drains work
before pool closure under the existing hard deadline. Health has separate admission.

These are local resource controls: restart resets counters, replicas multiply
allowances, and loopback clients may share a budget. They do not establish shared
rate enforcement or public deployment readiness. Public HTTPS ingress, trusted
proxy identity, shared limits and bot protection need deployment-specific work.
Verification/recovery and their unverified-account restrictions remain pre-launch
follow-ups. The browser flow preserves generic acceptance, uses a separate
sign-in step, and never transfers the submitted password between routes.

## Validation commands

Use `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:e2e`, and `npm run test:smoke` for the database-independent gates.
They do not load root `.env`. API process smoke uses only a test-owned unavailable
loopback endpoint and checks policy-asset failure and hard shutdown as well as probes.

Run `npm run test:integration` for actual migration/repository/HTTP database tests.
It builds database and API artifacts, privately selects guarded TEST_DATABASE_URL,
uses real scrypt for the HTTP phase, and shares the suite's existing bounded pool.
It checks canonical duplicate races, credential immutability, transaction rollback,
schema constraints, startup without migrations, exact fixture cleanup, and
independent sentinel preservation. There is no extra API pool or web dependency.

Run `npx --no-install openspec validate --all --strict --no-interactive` to check
the current specifications and active change. Fresh-install evidence is recorded
above; later integration results truthfully use `freshInstall=false`.

## Implementation acceptance (2026-10-26)

Windows, Node 24.20.0, npm 12.2.0, PostgreSQL 18.6. The final API checks include
case/trailing-slash route aliases retaining no-store and static redacted logs.

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 20 suites, 251 tests |
| `npm run build` | Passed: database, API, web; final API rebuilt through smoke/integration |
| `npm run test:e2e` | Passed: production Chromium desktop/mobile, headers and secret scans |
| `npm run test:smoke` | Passed: five process checks, including blocked registration shutdown and missing/corrupt compiled policy |
| `npm run test:integration` | Passed: one real application migration, unchanged replay, account commit/duplicate/race/rollback/constraints, real HTTP hashing, startup without migrations, original and account/HTTP sentinel preservation |
| Strict OpenSpec current specs and active change | Passed: five items |

The initial application install's `freshInstall=true` evidence is recorded above;
final repeat runs report false and preserve that history. Technical failed-migration
rollback and the expected failing child exit 1 remain passing. Account tests clean
only confirmed exact fixtures; approved application tables/history remain in the
test database. Development DATABASE_URL was not an automated execution target.
Private configuration was not changed, printed, or committed.

At the local implementation checkpoint, execution above was Windows evidence and
this branch's GitHub/Linux CI had not yet run; previous changes' CI results are
not evidence for this revision. No public deployment, workload capacity,
session, email verification, or recovery claim follows. Existing CI/deploy/secrets
configuration and archived changes were left intact. This change is ready for
owner review and the normal sync/archive workflow.

On 2026-10-26 the owner requested finalization. All 16 tasks were complete; all 11
account-registration requirements were synced into the current specification with
Purpose/scenarios preserved. The five change artifacts, including `.openspec.yaml`,
were archived unchanged at
`openspec/changes/archive/2026-10-26-add-account-registration/` and verified against
their pre-move content hashes. No active registration change remains.

The owner also established automatic helper-based PR delivery for approved work.
Current `AGENTS.md`, GitHub delivery instructions/specification govern that standing
authorization; older archived approval wording remains a historical record.
