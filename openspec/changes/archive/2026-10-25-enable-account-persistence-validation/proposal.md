# Proposal

## Why

The foundation was completed under an explicit waiver without a live PostgreSQL test database. Before account persistence is introduced, the project needs a reproducible integration gate that exercises the real migration path and proves rollback and cleanup safety without creating account functionality. On 2026-10-25 the owner explicitly replaced the TLS prerequisites with two local plaintext databases supplied in private `.env` configuration.

## What Changes

- Use the supplied loopback PostgreSQL databases without TLS: `DATABASE_URL` for development/normal explicit migrations and `TEST_DATABASE_URL` for every automated database operation. Accept omitted `sslmode` or exactly `sslmode=disable`; reject other URL options and non-loopback hosts.
- Load only database settings from the ignored root `.env` for database commands and API development, preserving explicit process settings. Unit, build, browser, and smoke commands must not load it. No CA, TLS-mode setting, or third migration URL is required.
- Extend `test:integration` to apply the repository's actual application migration history and replay it. The current empty history must remain an explicit no-op, not be replaced with a fabricated business migration.
- Retain technical fixtures for transaction rollback, successful migration replay, and atomic rollback of a deliberately failing migration, including migration-journal assertions and process exit checks.
- Extend fixture isolation to support future feature tests using rolled-back transactions or exactly tracked records in already migrated test tables. Cleanup must never reset/truncate the database, remove application migration history, or delete unowned objects/data.
- Verify a separate sentinel schema, table definition, and exact row values survive successful and deliberately failing worker cleanup before the coordinator removes its own sentinel fixture.
- Limit the historical waiver to `initialize-store-foundation`. Successful live execution becomes mandatory for this change and subsequent changes introducing account persistence; absent prerequisites leave implementation verification incomplete.
- Document database-independent versus live checks, safe operator setup, evidence required for completion, and remaining unverified checks.

The owner has approved implementation, including this explicit transport/configuration revision. No authentication, account schema, business API/UI behavior, email transport, provisioning automation, CI/CD, or new dependency is included.

## Capabilities

### New Capabilities

None; extend the existing foundation capabilities.

### Modified Capabilities

- `database-foundation`: Replace TLS and third-URL prerequisites with validated local plaintext connections, private environment loading, and strictly separate test targeting; preserve connection bounds and add real migration replay, failed-migration rollback, and cleanup preservation requirements.
- `development-workspace`: Modify executable quality gates and operating instructions to distinguish historical completion from mandatory live persistence verification and document its prerequisites and evidence.
- `service-runtime`: Reconcile configuration/probe smoke scenarios with local plaintext database configuration; preserve HTTP, startup, shutdown, and replica behavior.

## Impact

Implementation affects the database parser/test guard, API test-mode target selection, root database environment loading, integration/migration scripts, focused fixtures/tests, and `docs/foundation.md`. The shared migration helper preserves empty-history behavior while callers explicitly select development or test credentials. Main specification updates occur through normal sync/archive; archived foundation artifacts remain unchanged.

PostgreSQL remains the only external runtime service. The owner supplied separate `commerce_db` and `commerce_test` databases on localhost:5432 in ignored `.env`; credentials remain private. The revised runtime is local-only; remote hosting and its transport requirements need a later explicit decision. Application startup still performs no migrations, and tests must never write to the development database.
