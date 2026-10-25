# Design

## Context

See `proposal.md` for motivation. The relevant observed implementation is:

- `scripts/integration.cjs` calls `guardedTestConfiguration` before clients, requires verified TLS, and uses a random technical schema and temporary migration files. It tests one rolled-back insert, synthetic replay, and rejection of invalid SQL; it does not prove partial-migration rollback or sentinel preservation.
- `packages/database/src/testing.ts` compares normalized host/port/database identities against configured `DATABASE_URL` and `MIGRATION_DATABASE_URL`. It cannot establish physical isolation across omitted connections or undisclosed DNS aliases. It currently accepts runtime environments other than `test` if their configuration is otherwise valid.
- `scripts/migrate.cjs` uses explicit operator migration configuration and avoids connecting for empty history. `packages/database/migrations/meta/_journal.json` currently has zero entries; `schema.ts` has no business models.
- The installed migration driver creates its journal metadata before its transaction and runs pending SQL and migration-entry insertion transactionally. Its `migrationsSchema` option relocates metadata, not schema-qualified application SQL.
- The main database/workspace specs and `docs/foundation.md` record the 2026-10-23 foundation waiver. No test connection, TLS mode, CA path, or runtime environment is configured in the current process. Provisioning is outside this change.

## Goals / Non-Goals

**Goals:**

- Turn the live integration command into a truthful completion gate with exact target and cleanup ownership, without changing production transport policy or pool limits.
- Reuse the actual migration execution path and make empty versus non-empty application coverage explicit.
- Establish reusable isolation rules for later feature tests without creating their tables or endpoints.

**Non-Goals:**

- No database/container/provider provisioning, production migration execution, application-startup migrations, down-migration framework, CI/deploy edits, new dependency, or application behavior change.
- No account, credential, session, verification, recovery, or mail implementation. No fabricated application migration to make an empty history appear exercised.
- No claim that passing these checks proves pool fault recovery, live TLS-negative handshakes, commercial readiness, or capacity for a registered-user count. Existing unverified checks remain recorded until independently executed.

## Decisions

### 1. Keep the guarded verified-TLS path and require test mode

Extend the existing test guard with an explicit `NODE_ENV=test` check. Reuse the current parser, normalized identity comparison, bounded pool settings, URL-query rejection, and safe errors. Apply preflight before constructing any client, including child/worker clients. Do not temporarily map the test URL into `MIGRATION_DATABASE_URL`: that would obscure execution ownership and conflict with non-test target comparison.

Required operator setup:

| Prerequisite | Exact contract |
| --- | --- |
| Database | A separately provisioned PostgreSQL database reserved for this application's tests, never production, shared development, or another application's data. Run one suite/migration owner at a time per database; parallel jobs require separate databases. |
| Configuration | `NODE_ENV=test`, private `TEST_DATABASE_URL` containing the certificate hostname, and `TEST_DATABASE_TLS_MODE=verify-full` (also the existing safe default). Supply applicable non-test `DATABASE_URL` / `MIGRATION_DATABASE_URL` for comparison; never invent values for connections that do not exist. |
| Trust | `TEST_DATABASE_CA_FILE` when Node's default roots do not trust the issuer. Certificate chain and hostname verification remain enabled for every test connection. No `NODE_TLS_REJECT_UNAUTHORIZED=0`, URL TLS overrides, plaintext fallback, or disabled verification. |
| Privileges | CONNECT and rights to create/use the test application's schemas, apply its reviewed migrations, and create/read/write/drop precisely owned technical fixtures and journal metadata. No superuser, database-drop, role-management, service-control, or access to production databases. Runtime credentials remain separate and need no new privileges. |
| Secrets | Operator-supplied through the private local session/configuration, outside Git and command output. Keep credentials, certificate contents, and private file paths out of logs and completion evidence. |

No new provider or operating-system-specific command is required. TLS prerequisites are requirements on a supplied environment, not permission to provision or bypass one.

Alternative: a loopback plaintext test database would reduce setup work but contradict the approved test contract. Driver doubles remain useful for offline assertions, not persistence evidence.

### 2. Exercise real migration history without rewriting its SQL

Extract the small history-reading/application operation into a script-level helper shared by `scripts/migrate.cjs` and the integration runner. Keep target selection outside the helper: the operator command validates `MIGRATION_DATABASE_*`; the runner passes only the guarded `TEST_DATABASE_*` connection. Preserve the operator command's explicit configuration, safe failures, and empty-history no-connect behavior. Do not import scripts into application startup or change web/database boundaries.

For the live suite, a verified connection is still required even when the real application journal is empty. Read the actual repository history without modifying it:

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
| No PostgreSQL | `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run test:e2e`; `npm run test:smoke` | Existing root gates plus unit/process checks for preflight-before-client, normalized target matching, test-mode requirement, TLS overrides/redaction, migration contracts, and precise cleanup error propagation. Existing browser/process foundation checks stay database-independent. |
| Dedicated verified-TLS environment | `npm run test:integration` with the private prerequisite settings above | Required exit 0 after verified connectivity, actual empty/non-empty repository history replay, technical commit/rollback/replay/failed-migration rollback, successful/failing worker cleanup, and independent sentinel checks. |

Offline missing-configuration child tests intentionally expect nonzero preflight; they are not a live pass. Do not mark live tasks complete until the live command actually succeeds. Record date, platform, Node/npm/PostgreSQL versions, command exits, actual application-journal coverage, cleanup/rollback results, and any remaining unverified checks without connection secrets. If prerequisites are absent, stop at an explicit incomplete live gate.

Live untrusted-CA/hostname-negative handshakes, exhaustion, statement cancellation, and transport-fault recovery retain their existing requirements and unverified status; this change does not claim to have closed them or add a broad fault-injection project. Production certificate verification and all existing defaults remain mandatory.

### 6. Preserve the approved milestone boundaries

Dependency order remains this change, `add-account-registration`, `add-account-sessions`, then `add-account-web-flow`. No later proposal is created here. `add-email-verification` and `add-password-recovery` are separate **required pre-launch follow-ups**; email verification must also precede enabling verification-dependent marketplace actions. Their local preview/test email transport does not require a production provider for development.

Carry these approved constraints into the later proposals, without implementing or specifying account APIs in this change:

- Registration uses the same public status/message for valid new and already-registered canonical emails, never overwrites existing credentials, and avoids an obvious fast-exit timing distinction. The usability cost is that a duplicate address is not directly diagnosed; the UI guides users to sign-in and, once implemented, recovery.
- Sessions start with `absoluteExpiresAt = createdAt + 7 days` and `idleExpiresAt = min(createdAt + 24 hours, absoluteExpiresAt)`. A valid authenticated request before both deadlines can renew inactivity to `min(activityTime + 24 hours, absoluteExpiresAt)`. At or after either deadline the session is invalid; rejected/unauthenticated requests cannot renew it. Activity never changes `createdAt` or the absolute deadline and cannot resurrect an expired/revoked session. Later session requirements must specify atomic renewal/concurrency semantics and their tests.
- Recovery uses account-enumeration-resistant responses. Verification and recovery have no endpoints, token tables, mail transport, or UI in the initial four changes. Public registration grants neither administrative authority nor business-store approval.

## Risks / Trade-offs

- **The database has not been supplied** -> Planning can be approved, but live implementation acceptance remains blocked until actual prerequisites and a passing run exist. No synthetic success or inherited waiver.
- **Target identity comparison is not proof of physical isolation** -> Require deliberate operator selection and restricted access, document alias/omission limitations, and keep destructive cleanup limited to exact ownership.
- **Persistent test application schema accumulates approved migration history** -> Do not reset it for convenience. Use fresh separately provisioned targets for first-install verification and separate databases for concurrent jobs.
- **Forced process termination can interrupt cleanup** -> Report run-owned resource identifiers safely for operator inspection; never automatically sweep old schemas by prefix. Normal success/failure paths must clean up; crash-proof janitorial tooling is deferred.
- **Cleanup can hide an earlier failure or destroy unrelated dependencies** -> Preserve original failure plus cleanup-failure classification, refuse unowned cascades, and verify sentinel contents independently after cleanup.
- **Empty application history gives limited coverage** -> Report zero and require the first real account migration's fresh-install/replay assertions in its own change.

## Migration Plan

There is no deployment or production schema migration in this change. After a separate implementation approval, introduce the test/script changes, run offline checks, then run the live suite only with operator-provided dedicated configuration. Preserve the operator migration command's contract and application startup behavior.

If implementation is reverted, revert the test/tooling changes through normal Git review; do not undo test application migrations or remove existing application history automatically. Failed technical migrations are rolled back by their transaction, and only precisely owned technical fixtures are teardown candidates. Archived foundation artifacts are never rewritten.

## Open Questions

- The operator may choose any PostgreSQL service/location satisfying these prerequisites. Its endpoint, credentials, trusted CA path, and actual PostgreSQL version are environment inputs to record privately before live execution, not grounds to change this design.
