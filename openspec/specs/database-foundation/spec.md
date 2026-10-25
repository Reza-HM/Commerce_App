# database-foundation Specification

## Purpose

Provide controlled server-side database access and an explicit schema-change workflow so later business domains can use transactions without introducing unmanaged connections or unsafe migrations.

## Requirements

### Requirement: Server-only bounded connections
The database foundation SHALL expose server-only access with a finite per-process pool maximum, connection-acquisition timeout, and statement timeout. Defaults MUST cap the pool at five connections, acquisition at one second, and statements at five seconds. Invalid nonpositive limits MUST fail configuration validation. Consumers MUST release connections and close the pool on shutdown.

#### Scenario: Demand exceeds available connections
- **WHEN** requests exhaust the configured pool
- **THEN** the number of connections never exceeds the configured maximum
- **AND** a waiting acquisition fails within its configured timeout instead of waiting indefinitely

### Requirement: Background connection failure recovery
Transient background pool or idle-client errors SHALL be handled without crashing the API or logging raw connection details. Failed connections MUST be removed, and subsequent healthy connections MUST be usable. Probe-specific settings MUST NOT affect later users of a pooled connection.

#### Scenario: Warmed pool loses idle connections
- **WHEN** a test-owned transport failure interrupts idle connections in a previously healthy pool
- **THEN** the API remains live and logs only a safe error classification
- **AND** readiness can succeed after connectivity returns

#### Scenario: Probe settings do not leak
- **WHEN** a readiness check completes or times out
- **THEN** its client is either returned with normal configured settings restored or discarded
- **AND** later operations retain their configured statement deadline

### Requirement: Explicit migration execution
The repository SHALL provide `db:generate` and `db:migrate` for reviewable versioned migrations. Application startup MUST NOT migrate or synchronize schemas. Normal explicit migration execution MUST use `DATABASE_URL`; test-mode execution MUST use guarded `TEST_DATABASE_URL` with no fallback. Empty application history MUST report no pending work without connecting or creating business tables.

#### Scenario: API starts against a database
- **WHEN** the API starts and serves its health probes
- **THEN** it performs no schema creation or modification

#### Scenario: Migration is reapplied
- **WHEN** a controlled test migration is applied twice to an isolated test schema
- **THEN** the second run does not repeat its schema changes
- **AND** a migration failure returns a nonzero exit status

#### Scenario: A test-mode migration is requested
- **WHEN** the explicit command runs in test mode
- **THEN** it uses only guarded test configuration, even when development or legacy migration settings are present
- **AND** a missing test target fails instead of falling back

### Requirement: Transactional access
The database foundation SHALL support multiple operations within one transaction and SHALL propagate failure rather than silently committing partial work. Live foundation transaction tests MUST use disposable technical fixtures in the dedicated test database, without adding production business models. Driver-contract tests MUST verify commit/rollback and release without an external service.

#### Scenario: Transaction rollback
- **WHEN** a test transaction writes a fixture record and a later operation fails
- **THEN** the transaction leaves no committed fixture record
- **AND** its connection is available for subsequent work

#### Scenario: Live commit and rollback are distinguished
- **WHEN** the live suite commits one technical fixture record and rolls back another after a forced failure
- **THEN** a subsequent read observes only the committed record
- **AND** a subsequent transaction succeeds using the bounded connection pool

### Requirement: Isolated database validation
Database integration tests SHALL require an explicit dedicated test connection and isolate fixtures in schemas, temporary tables, or rolled-back/ID-tracked records in migrated test tables. They MUST reject a test target matching configured development or migration databases and MUST never reset or truncate an arbitrary configured database. Cleanup MUST be limited to the fixtures created by that test run.

#### Scenario: Development target supplied as test database
- **WHEN** the resolved test database host, port, and database name match a configured non-test connection
- **THEN** tests fail before performing any write, even if credentials or URL formatting differ

#### Scenario: Fixtures are cleaned up
- **WHEN** integration tests pass or fail normally
- **THEN** cleanup removes only that run's fixture objects
- **AND** unrelated database objects remain unchanged

#### Scenario: Feature records use an existing migrated test schema
- **WHEN** a later feature test uses tables created by approved application migrations in the dedicated test database
- **THEN** its writes are rolled back or its committed fixtures are identified by exact run-owned keys/record IDs and deleted precisely in dependency order
- **AND** ownership keys are recorded before writes, generated IDs are captured when available, and uncertain ownership fails cleanup safely rather than broadening deletion
- **AND** an insert conflict or failed/uncertain insert never confirms ownership of a pre-existing row
- **AND** unrelated records, application tables, and application migration records remain intact
- **AND** no business model is introduced solely to test the foundation

### Requirement: Connection budgeting guidance
The repository SHALL document per-process connection limits, reserved database headroom, migration concurrency, and the multiplication of pools across API replicas and future workers. It MUST require a connection-budget review before increasing replica or worker counts and MUST NOT present a registered-user count as evidence of database capacity.

#### Scenario: Operator plans another replica
- **WHEN** an operator follows the foundation scaling instructions
- **THEN** they can calculate aggregate API and future worker connections plus migration and operational headroom against the configured database limit
- **AND** the instructions call for workload measurements before changing that limit

### Requirement: Live persistence completion
Live integration tests SHALL require a guarded dedicated local database and isolate faults to test-owned connections. The 2026-10-23 deferral applies only to archived foundation completion; persistence-validation work and subsequent account-persistence changes MUST pass live tests. Driver-contract and outage process tests SHALL run locally; documentation MUST distinguish simulation from real database evidence. The owner's 2026-10-25 instruction removes the earlier TLS prerequisite.

#### Scenario: Test prerequisites are unavailable
- **WHEN** the live database integration command lacks a valid dedicated test connection
- **THEN** the command fails with a safe prerequisite error instead of skipping checks or using the development database

#### Scenario: Database-independent API smoke
- **WHEN** the smoke runner starts production-mode API children without a live test database
- **THEN** it supplies valid local plaintext configuration for a test-owned unavailable endpoint
- **AND** asserts live 200, ready 503, independent restart, and safe shutdown without writing to a database

#### Scenario: Safe outage simulation
- **WHEN** database outage/recovery tests run against a supplied test database
- **THEN** only transports or connections owned by that run are interrupted
- **AND** unrelated sessions/services are untouched

#### Scenario: Completion requires actual live evidence
- **WHEN** implementation completion is assessed for `enable-account-persistence-validation` or a subsequent account-persistence change
- **THEN** its required live integration checks must have passed against the dedicated local test target
- **AND** absent prerequisites or passing driver doubles alone leave live verification incomplete
- **AND** the historical foundation archive remains an accurate record of its original waiver

### Requirement: Local database transport
The current database workflow SHALL use plaintext connections only to loopback hosts, in every runtime mode. Omitted `sslmode` or exactly `sslmode=disable` MUST be accepted. Remote hosts and other URL options MUST be rejected with redacted diagnostics. No database TLS mode or CA configuration is required. Remote/commercial database transport needs a later explicit design decision.

#### Scenario: Local databases use the supplied configuration
- **WHEN** development or test configuration names a loopback PostgreSQL database, with omitted `sslmode` or `sslmode=disable`
- **THEN** connection options use `ssl: false`, preserve finite resource limits, and require no certificate files

#### Scenario: Remote or ambiguous transport settings are supplied
- **WHEN** a connection targets a non-loopback host, supplies another query option, repeats `sslmode`, or requests a different SSL mode
- **THEN** configuration fails before connecting without exposing values

### Requirement: Explicit live test prerequisites
Live persistence tests SHALL require `NODE_ENV=test`, an explicitly provisioned test-only local PostgreSQL database, and fixture/migration privileges. Configuration and target guards MUST run before constructing clients or writing. The execution target MUST come only from `TEST_DATABASE_URL`; failures MUST return nonzero without leaking credentials or falling back to another target. Tests MUST NOT write to `DATABASE_URL`.

#### Scenario: Unsafe test configuration is rejected before clients exist
- **WHEN** test configuration is missing, uses a non-test runtime environment, contains unsupported URL options, targets a remote host, or matches a configured non-test target
- **THEN** preflight fails before client construction or database writes
- **AND** diagnostics identify only safe setting names or error classifications, never connection URLs, passwords, certificate contents, or private filesystem paths

#### Scenario: A dedicated local target is supplied
- **WHEN** the operator supplies a genuinely separate local test database and valid credentials
- **THEN** all live test and test-migration connections use plaintext with bounded connections and timeouts
- **AND** the runner does not execute migrations against the configured runtime or operator-migration database

### Requirement: Real application migration validation
Live validation SHALL apply and replay repository-owned application migration history through the same history-application logic as the explicit migration command, using only the guarded test connection. It MUST retain applied application history and distinguish empty-history no-op evidence from non-empty coverage. Replay MUST preserve migration records and application schema state. Application startup MUST NOT migrate.

#### Scenario: Repository application history is empty
- **WHEN** both replay invocations read the repository's currently empty migration journal
- **THEN** they report an empty application-history no-op without executing application or migration-metadata DDL
- **AND** the live suite still exercises technical migration fixtures and rollback
- **AND** evidence does not claim that non-empty application or account migrations were tested

#### Scenario: Repository application history contains migrations
- **WHEN** a later approved change supplies application migrations and the live suite applies that unchanged history twice
- **THEN** the first invocation applies pending migrations and the second does not repeat their application statements
- **AND** the recorded migration identities/hashes and application schema definitions are unchanged by replay
- **AND** the suite reports the actual history tested without generating replacement business migrations

### Requirement: Failed migration atomicity
Live migration tests SHALL prove a deliberately failing technical migration leaves neither its earlier writes/schema changes nor an applied journal entry. Previously committed fixture data and successful migration entries MUST remain intact. A failing migration process MUST exit nonzero with redacted diagnostics; the suite MUST explicitly assert the expected failure before treating that negative case as passed.

#### Scenario: A migration writes before encountering invalid SQL
- **WHEN** a test-owned migration performs a valid insert and creates a technical table before a deliberately invalid statement
- **THEN** the insert and table creation are rolled back, no successful migration entry is added, and the prior fixture/journal baseline is unchanged
- **AND** a controlled child process exercising the failure exits nonzero without disclosing secrets
- **AND** a subsequent database operation succeeds after rollback

### Requirement: Independently verified cleanup preservation
Live cleanup validation SHALL compare a sentinel's exact rows and schema definition before worker activity and after worker cleanup, for successful and deliberately failing workers. The sentinel MUST be outside each worker's ownership set. Cleanup errors or preservation failures MUST fail the suite. Only the coordinator may remove its sentinel after the preservation assertion; application migration state MUST never be cleanup-owned.

#### Scenario: Successful worker cleanup preserves its unrelated sentinel
- **WHEN** a worker completes and removes its owned fixture objects and tracked records
- **THEN** an independent coordinator observes those fixtures are absent and its separate sentinel table, definition, and exact row values are unchanged
- **AND** only after that assertion does the coordinator tear down its own sentinel fixture

#### Scenario: Worker failure still performs bounded owned cleanup
- **WHEN** a worker deliberately fails after creating objects and committing fixture records
- **THEN** its failure remains observable, its normal failure cleanup removes only its owned fixtures, and the coordinator verifies sentinel preservation
- **AND** a cleanup failure cannot be hidden by the expected worker failure

#### Scenario: Cleanup encounters an unowned object or dependency
- **WHEN** cleanup would require deleting an unowned record/object or cascading into objects outside the ownership manifest
- **THEN** it fails safely rather than expanding deletion scope
- **AND** diagnostics report incomplete cleanup without printing sensitive values

### Requirement: Private local database environment
Root `test:integration`, `db:migrate`, and API development SHALL load database settings from the ignored root `.env` without overriding explicit process settings. Integration execution MUST select test mode. Unit, build, browser, and process-smoke commands MUST NOT load that file. Environment values MUST NOT appear in diagnostics or version control; missing files MUST not trigger credential invention or test-target fallback.

#### Scenario: Root integration command reads the supplied local setup
- **WHEN** `.env` contains separate development and test URLs and the root integration command runs
- **THEN** it loads those settings privately, forces test mode, compares targets, and connects only to the test URL

#### Scenario: An explicit process value overrides local configuration
- **WHEN** a database setting already exists in the process environment
- **THEN** `.env` does not replace it, and the resulting configuration still passes all validation before clients exist
