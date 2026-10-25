# Proposal

## Why

The foundation was completed under an explicit waiver without a live PostgreSQL test database. Before account persistence is introduced, the project needs a reproducible, verified-TLS integration gate that exercises the real migration path and proves rollback and cleanup safety without creating account functionality.

## What Changes

- Require an explicitly provisioned, dedicated PostgreSQL test database with certificate and hostname verification; retain the existing target guard, finite connection limits, redaction, and no-fallback behavior.
- Extend `test:integration` to apply the repository's actual application migration history and replay it. The current empty history must remain an explicit no-op, not be replaced with a fabricated business migration.
- Retain technical fixtures for transaction rollback, successful migration replay, and atomic rollback of a deliberately failing migration, including migration-journal assertions and process exit checks.
- Extend fixture isolation to support future feature tests using rolled-back transactions or exactly tracked records in already migrated test tables. Cleanup must never reset/truncate the database, remove application migration history, or delete unowned objects/data.
- Verify a separate sentinel schema, table definition, and exact row values survive successful and deliberately failing worker cleanup before the coordinator removes its own sentinel fixture.
- Limit the historical waiver to `initialize-store-foundation`. Successful live execution becomes mandatory for this change and subsequent changes introducing account persistence; absent prerequisites leave implementation verification incomplete.
- Document database-independent versus live checks, safe operator setup, evidence required for completion, and remaining unverified checks.

Only planning artifacts are created now. Implementation requires a separate approval. No authentication, account schema, API/UI behavior, email transport, provisioning automation, CI/CD, or new dependency is included.

## Capabilities

### New Capabilities

None; extend the existing foundation capabilities.

### Modified Capabilities

- `database-foundation`: Modify transactional access, fixture isolation, and the scope of deferred validation; add real application migration replay, failed-migration rollback, and independently verified cleanup preservation requirements.
- `development-workspace`: Modify executable quality gates and operating instructions to distinguish historical completion from mandatory live persistence verification and document its prerequisites and evidence.

## Impact

Implementation affects `scripts/integration.cjs`, the test-only guard in `packages/database/src/testing.ts`, focused test helpers/fixtures, existing database and command tests, and `docs/foundation.md`. A shared script-level migration helper will be extracted from `scripts/migrate.cjs` while preserving its explicit migration credentials and empty-history behavior. Main specification updates occur through the normal OpenSpec sync/archive workflow; archived foundation artifacts remain unchanged.

PostgreSQL remains the only external runtime service. The operator supplies an isolated database, restricted credentials, and any required CA trust file outside version control. No live database configuration is available in the current process, so planning validation cannot establish live database success.
