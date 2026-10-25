# Spec Delta

## MODIFIED Requirements

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
- **AND** unrelated records, application tables, and application migration records remain intact
- **AND** no business model is introduced solely to test the foundation

### Requirement: Deferred live database validation
Live integration tests SHALL require a guarded dedicated TLS database and isolate faults to test-owned connections. The 2026-10-23 deferral applies only to archived foundation completion; persistence-validation work and subsequent account-persistence changes MUST pass live tests. Driver-contract and outage process tests SHALL run locally; documentation MUST identify unverified live checks without weakening production TLS or representing simulation as database validation.

#### Scenario: TLS test prerequisites are unavailable
- **WHEN** the live database integration command lacks a valid dedicated test connection or its required TLS trust configuration
- **THEN** the command fails with a safe prerequisite error instead of skipping checks, using the development database, or disabling verification

#### Scenario: Database-independent API smoke
- **WHEN** the smoke runner starts production-mode API children without a live test database
- **THEN** it supplies valid verified-TLS configuration for a test-owned unavailable endpoint
- **AND** asserts live 200, ready 503, independent restart, and safe shutdown without writing to a database

#### Scenario: Safe outage simulation
- **WHEN** database outage/recovery tests run against a supplied test database
- **THEN** only transports or connections owned by that run are interrupted
- **AND** TLS verification stays enabled and unrelated sessions/services are untouched

#### Scenario: Completion requires actual live evidence
- **WHEN** implementation completion is assessed for `enable-account-persistence-validation` or a subsequent account-persistence change
- **THEN** its required live integration checks must have passed against the dedicated verified-TLS target
- **AND** absent prerequisites or passing driver doubles alone leave live verification incomplete
- **AND** the historical foundation archive remains an accurate record of its original waiver

## ADDED Requirements

### Requirement: Explicit live test prerequisites
Live persistence tests SHALL require `NODE_ENV=test`, an explicitly provisioned test-only PostgreSQL database, verified TLS, and restricted fixture/migration privileges. Configuration and target guards MUST run before constructing clients or writing. The execution target MUST come only from test configuration; failures MUST return nonzero without leaking credentials or falling back to another target.

#### Scenario: Unsafe test configuration is rejected before clients exist
- **WHEN** test configuration is missing, uses a non-test runtime environment, selects local/plaintext transport, disables certificate verification, contains a URL TLS override, or matches a configured non-test target
- **THEN** preflight fails before client construction or database writes
- **AND** diagnostics identify only safe setting names or error classifications, never connection URLs, passwords, certificate contents, or private filesystem paths

#### Scenario: A dedicated verified-TLS target is supplied
- **WHEN** the operator supplies a genuinely separate database, its certificate hostname, valid credentials, and any required trusted CA bundle
- **THEN** all live test and test-migration connections enforce certificate-chain and hostname verification with bounded connections and timeouts
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
