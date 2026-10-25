# Design

## Context

See `proposal.md` for motivation. The relevant observed implementation is:

- `scripts/integration.cjs` guards before clients and uses a random technical schema and temporary migration files. Stronger rollback and sentinel preservation are pending.
- `packages/database/src/testing.ts` compares normalized host/port/database identities against configured development and legacy migration URLs and requires test mode. It cannot establish physical isolation across omitted connections or undisclosed aliases.
- The shared migration helper avoids connecting for empty history. `packages/database/migrations/meta/_journal.json` has zero entries; `schema.ts` has no business models.
- The installed migration driver creates its journal metadata before its transaction and runs pending SQL and migration-entry insertion transactionally. Its `migrationsSchema` option relocates metadata, not schema-qualified application SQL.
- The main database/workspace specs record the historical foundation waiver. On 2026-10-25 the owner supplied local `commerce_db` and `commerce_test` URLs in ignored `.env` and explicitly removed TLS requirements. This revision replaces the former transport contract; archived foundation records remain historical.

## Goals / Non-Goals

**Goals:**

- Turn the live integration command into a truthful completion gate with exact target and cleanup ownership, retaining pool limits under the owner's revised local-only plaintext policy.
- Reuse the actual migration execution path and make empty versus non-empty application coverage explicit.
- Establish reusable isolation rules for later feature tests without creating their tables or endpoints.

**Non-Goals:**

- No database/container/provider provisioning, production migration execution, application-startup migrations, down-migration framework, CI/deploy edits, new dependency, or business behavior change.
- No account, credential, session, verification, recovery, or mail implementation. No fabricated application migration to make an empty history appear exercised.
- No claim that passing these checks proves pool fault recovery, commercial readiness, or capacity for a registered-user count. Database transport for remote hosting is deferred; TLS-related acceptance checks are explicitly removed by the owner, not reported as passed.

## Decisions

### 1. Use only the two supplied local databases

The current workflow accepts loopback PostgreSQL hosts, with `ssl: false`; omitted `sslmode` and exactly `sslmode=disable` are supported, while other query options, duplicates, fragments, and remote hosts are rejected. No CA or TLS-mode settings are needed. This applies in every runtime mode, including local production-build smoke; it is not a design for remote commercial hosting.

Keep `NODE_ENV=test` and normalized non-test target comparison before every test client. Every automated database connection and migration, including API test-mode startup, uses guarded `TEST_DATABASE_URL`. Normal explicit development migrations use `DATABASE_URL`; a third migration URL is neither required nor an execution fallback. Continue comparing an optional legacy migration URL if present so its target cannot be mistaken for an isolated test target.

Root database commands and API development load only database-related keys from the ignored root `.env` using Node's built-in parser. Explicit process settings win, including empty values that must fail validation. The integration root command sets test mode; normal migrations/API development default to development when no mode was supplied. Unit, build, browser, and smoke commands do not load `.env`. Missing files provide no invented credentials. The normal API production-start command retains explicit process configuration; deployment configuration is outside this change.

Required operator setup:

| Prerequisite | Exact contract |
| --- | --- |
| Database | A separately provisioned PostgreSQL database reserved for this application's tests, never production, shared development, or another application's data. Run one suite/migration owner at a time per database; parallel jobs require separate databases. |
| Configuration | Root `.env` has `DATABASE_URL` and `TEST_DATABASE_URL`; commands select the appropriate target without substitution. Tests require test mode and a distinct normalized database identity. |
| Transport | Local plaintext, omitted `sslmode` or `sslmode=disable`. No certificates or TLS settings. No global HTTPS verification settings are modified. |
| Privileges | Use the owner-supplied credentials and only their necessary fixture/migration permissions. Do not change roles or grants, invoke superuser operations, drop databases, or stop services. Prefer restricted credentials for future operation; broad local credentials do not relax cleanup ownership. |
| Secrets | Operator-supplied through the private local session/configuration, outside Git and command output. Keep credentials, certificate contents, and private file paths out of logs and completion evidence. |

No new provider, dependency, provisioning, or operating-system-specific command is required. Driver doubles remain offline contract checks, not persistence evidence. The earlier TLS-only alternative was explicitly rejected by the owner for this local workflow.

### 2. Exercise real migration history without rewriting its SQL

Use the script-level history helper shared by `scripts/migrate.cjs` and integration. Keep target selection outside it: ordinary migrations validate `DATABASE_*`; test-mode migration and integration paths validate only guarded `TEST_DATABASE_*`. Preserve safe failures and empty-history no-connect behavior. Do not import scripts into application startup or change web/database boundaries.

For the live suite, a real connection to the dedicated local test database is required even when the application journal is empty. Read repository history unchanged:

- **Empty now:** invoke the shared operation twice; assert no application/migration-metadata DDL and no application-journal creation. Report zero application migrations. The surrounding suite's technical DDL is counted separately.
- **Non-empty later:** apply pending repository SQL unchanged to the dedicated test application's normal schemas. Snapshot full applied migration identities/hashes and schema definitions after the first run; replay and assert both snapshots are unchanged and application statements are not reapplied. Keep those application tables and journal entries after test cleanup. The registration change must add assertions for its actual tables/constraints and run this non-empty path.

The first migration-bearing feature must also be tested on a fresh dedicated target so upgrade replay cannot hide missing bootstrap DDL. This foundation change has no such migration, so its evidence must say so explicitly.

Alternative: relocating all application SQL into per-run schemas would require rewriting schema-qualified migration references. Merely setting `migrationsSchema` does not isolate application tables. A genuinely dedicated test database plus retained application migration state and tightly owned data fixtures is smaller and tests the real SQL.

### 3. Keep technical transaction and migration tests separate

Use a random technical schema and run-owned temporary migration directory for foundation checks. Register exact fixture identifiers before creation, validate/quote generated identifiers, and clean only registered existing resources.

1. Commit one fixture write. Force a second transaction to throw after a write. Read from a subsequent transaction to prove only the first remains and the connection is reusable.
2. Apply a valid technical migration twice. Assert exactly one expected effect and a stable, complete journal snapshot.
3. Add a separate pending technical migration that inserts a distinct record, creates a table, then executes invalid SQL. Capture the baseline first. Assert its write and table are absent, its journal entry was not committed, and the previous records/journal entries are unchanged. Metadata already created outside the migration transaction is not falsely expected to roll back.
4. Exercise the failing history through a controlled test child process using the same helper; assert nonzero exit and safe diagnostics. Expected negative cases count as passed only after all failure/rollback assertions succeed; unexpected errors propagate.

Keep fixture migrations outside `packages/database/migrations`; never edit repository history to induce failure. These tests validate transaction rollback, not automatic rollback of successfully deployed application migrations.

### 4. Separate cleanup authority from preservation assertions

Use a coordinator to create a randomly named sentinel schema/table with known exact rows and a recorded schema definition. Its ownership manifest is distinct from every worker's. The worker receives only its own fixture ownership set for cleanup.

Run successful and deliberately failing worker cases serially. The failing case throws after technical DDL and committed fixture writes so rollback alone cannot satisfy cleanup checks. In both cases:

1. Worker cleanup removes only its registered technical objects and exact fixture records, in dependency order, and releases all clients/pools in `finally` paths.
2. After that cleanup, the coordinator verifies worker fixtures are absent, and compares the sentinel's existence, columns/constraints, and exact ordered record IDs/payloads with its baseline. A surviving empty table or unchanged row count alone is insufficient.
3. Only after the preservation assertion may the coordinator remove its own sentinel. Its teardown is not evidence that worker cleanup was allowed to remove it. On assertion failure, report incomplete cleanup and retain the sentinel for explicit operator review.

Use precise drops and dependency checks, ending with a restrictive schema drop; do not broadly `CASCADE` into unowned dependencies. Unknown objects or failed cleanup cause a nonzero suite result, never an expanded deletion scope or a swallowed error. A deliberately failed worker is expected only when its cleanup and independent preservation assertions pass.

For later application-table fixtures, record exact run-owned keys before writes and resulting IDs when available; delete only positively identified records in dependency order, or use transactions that are rolled back. If ownership cannot be proven, fail and report leftovers for review. Never truncate, drop application schemas, delete migration entries, or infer ownership from a broad name/email pattern. Current coverage demonstrates this policy with technical records; actual account-fixture coverage belongs to registration.

Alternative: a sentinel created inside the worker's cleanup schema cannot demonstrate preservation outside that cleanup boundary. Reusing real/shared user data as a sentinel would violate isolation.

### 5. Distinguish planning, offline validation, and live completion

The historical waiver stays in the archive. During implementation, update current operating notes to describe it as historical and record only live outcomes actually observed. Scope the new gate in both delta specs, preserving every unrelated foundation constraint.

| Environment | Commands / checks | Evidence and completion rule |
| --- | --- | --- |
| Planning only | `openspec validate enable-account-persistence-validation --strict`; `openspec validate --specs --strict`; full diff review | Valid planning structure and compatibility with current specs, never implementation or database success. |
| No PostgreSQL | `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run test:e2e`; `npm run test:smoke` | Preflight-before-client, normalized target matching, test-mode requirement, URL validation/redaction, migration contracts, and cleanup error propagation. No `.env` loading for these commands. |
| Dedicated local environment | `npm run test:integration` using private `.env` | Required exit 0 after actual local connectivity, actual empty/non-empty repository history replay, technical commit/rollback/replay/failed-migration rollback, successful/failing worker cleanup, and independent sentinel checks. |

Offline missing-configuration child tests intentionally expect nonzero preflight; they are not a live pass. Do not mark live tasks complete until the live command actually succeeds. Record date, platform, Node/npm/PostgreSQL versions, command exits, actual application-journal coverage, cleanup/rollback results, and any remaining unverified checks without connection secrets. If prerequisites are absent, stop at an explicit incomplete live gate.

Exhaustion, statement cancellation, and transport-fault recovery retain their unverified status unless executed separately; no broad fault-injection project is added. TLS handshake requirements are superseded by the owner's explicit local transport revision, never represented as passed tests.

### 6. Preserve the approved milestone boundaries

Dependency order remains this change, `add-account-registration`, `add-account-sessions`, then `add-account-web-flow`. No later proposal is created here. `add-email-verification` and `add-password-recovery` are separate **required pre-launch follow-ups**; email verification must also precede enabling verification-dependent marketplace actions. Their local preview/test email transport does not require a production provider for development.

Carry these approved constraints into the later proposals, without implementing or specifying account APIs in this change:

- Registration uses the same public status/message for valid new and already-registered canonical emails, never overwrites existing credentials, and avoids an obvious fast-exit timing distinction. The usability cost is that a duplicate address is not directly diagnosed; the UI guides users to sign-in and, once implemented, recovery.
- Sessions start with `absoluteExpiresAt = createdAt + 7 days` and `idleExpiresAt = min(createdAt + 24 hours, absoluteExpiresAt)`. A valid authenticated request before both deadlines can renew inactivity to `min(activityTime + 24 hours, absoluteExpiresAt)`. At or after either deadline the session is invalid; rejected/unauthenticated requests cannot renew it. Activity never changes `createdAt` or the absolute deadline and cannot resurrect an expired/revoked session. Later session requirements must specify atomic renewal/concurrency semantics and their tests.
- Recovery uses account-enumeration-resistant responses. Verification and recovery have no endpoints, token tables, mail transport, or UI in the initial four changes. Public registration grants neither administrative authority nor business-store approval.

## Risks / Trade-offs

- **Connection settings do not prove a successful database run** -> Verify actual connectivity, privileges, cleanup, and live assertions before completion; no inherited waiver or simulated success.
- **Target identity comparison is not proof of physical isolation** -> Require deliberate operator selection and restricted access, document alias/omission limitations, and keep destructive cleanup limited to exact ownership.
- **Persistent test application schema accumulates approved migration history** -> Do not reset it for convenience. Use fresh separately provisioned targets for first-install verification and separate databases for concurrent jobs.
- **Forced process termination can interrupt cleanup** -> Report run-owned resource identifiers safely for operator inspection; never automatically sweep old schemas by prefix. Normal success/failure paths must clean up; crash-proof janitorial tooling is deferred.
- **Cleanup can hide an earlier failure or destroy unrelated dependencies** -> Preserve original failure plus cleanup-failure classification, refuse unowned cascades, and verify sentinel contents independently after cleanup.
- **Empty application history gives limited coverage** -> Report zero and require the first real account migration's fresh-install/replay assertions in its own change.

## Migration Plan

There is no deployment or production schema migration. The owner approved implementation and the local transport revision. Run offline checks and then the actual suite against `commerce_test`; do not write to `commerce_db` from tests. Private `.env` is never modified or committed. Application startup still performs no DDL.

If implementation is reverted, revert the test/tooling changes through normal Git review; do not undo test application migrations or remove existing application history automatically. Failed technical migrations are rolled back by their transaction, and only precisely owned technical fixtures are teardown candidates. Archived foundation artifacts are never rewritten.

## Open Questions

- The actual local PostgreSQL version and permissions are measured during execution without printing credentials. Remote hosting transport remains a future deployment decision.
