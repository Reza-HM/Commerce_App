# Spec Delta

## Purpose

Provide controlled server-side database access and an explicit schema-change workflow so later business domains can use transactions without introducing unmanaged connections or unsafe migrations.

## ADDED Requirements

### Requirement: Server-only bounded connections
The database foundation SHALL expose server-only access with a finite per-process pool maximum, connection-acquisition timeout, and statement timeout. Defaults MUST cap the pool at five connections, acquisition at one second, and statements at five seconds. Invalid nonpositive limits MUST fail configuration validation. Consumers MUST release connections and close the pool on shutdown.

#### Scenario: Demand exceeds available connections
- **WHEN** requests exhaust the configured pool
- **THEN** the number of connections never exceeds the configured maximum
- **AND** a waiting acquisition fails within its configured timeout instead of waiting indefinitely

### Requirement: Explicit transport security
The database configuration SHALL distinguish explicit local-development connections from certificate-verified TLS connections. Production-mode configuration MUST reject disabled certificate verification and unencrypted database access. Connection errors MUST NOT disclose connection strings or credentials.

#### Scenario: Unsafe production transport configuration
- **WHEN** the API starts in production mode with TLS disabled or certificate verification bypassed
- **THEN** configuration validation fails before listening and reports the unsafe setting without its secret value

#### Scenario: Deliberate local development transport
- **WHEN** the API runs in development mode with explicitly selected local unencrypted transport
- **THEN** it can connect to the configured development database without changing production or complete-acceptance security defaults

#### Scenario: Certificate verification
- **WHEN** a production-mode connection presents a trusted certificate matching the configured database hostname
- **THEN** the connection succeeds
- **AND** the same checks reject an untrusted CA or mismatched hostname without exposing credentials

### Requirement: Authoritative TLS settings
Runtime, migration, and test connections SHALL use validated explicit TLS settings. Connection URLs containing TLS-related query parameters MUST be rejected before connecting rather than overriding those settings. Diagnostics MUST name the conflicting setting without printing its value or connection URL.

#### Scenario: Connection URL attempts a TLS override
- **WHEN** any runtime, migration, or test URL includes a TLS-related query parameter such as `sslmode` or `sslrootcert`
- **THEN** configuration validation fails before connecting
- **AND** URL parsing cannot replace the validated certificate-verification policy

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
The repository SHALL provide `db:generate` and `db:migrate` commands for reviewable versioned migrations. Application startup MUST NOT run migrations or synchronize schemas. Migration execution MUST require an explicitly configured migration connection. With no application migrations, `db:migrate` MUST report no pending work without creating business tables.

#### Scenario: API starts against a database
- **WHEN** the API starts and serves its health probes
- **THEN** it performs no schema creation or modification

#### Scenario: Migration is reapplied
- **WHEN** a controlled test migration is applied twice to an isolated test schema
- **THEN** the second run does not repeat its schema changes
- **AND** a migration failure returns a nonzero exit status

### Requirement: Transactional access
The database foundation SHALL support multiple operations within one transaction and SHALL propagate failure rather than silently committing partial work. Transaction tests MUST use disposable technical fixtures in the dedicated test database, without adding production business models.

#### Scenario: Transaction rollback
- **WHEN** a test transaction writes a fixture record and a later operation fails
- **THEN** the transaction leaves no committed fixture record
- **AND** its connection is available for subsequent work

### Requirement: Isolated database validation
Database integration tests SHALL require an explicit dedicated test connection and use isolated fixture schemas or temporary tables. They MUST reject a test target matching configured development or migration databases and MUST never reset or truncate an arbitrary configured database. Cleanup MUST be limited to the fixtures created by that test run.

#### Scenario: Development target supplied as test database
- **WHEN** the resolved test database host, port, and database name match a configured non-test connection
- **THEN** tests fail before performing any write, even if credentials or URL formatting differ

#### Scenario: Fixtures are cleaned up
- **WHEN** integration tests pass or fail normally
- **THEN** cleanup removes only that run's fixture objects
- **AND** unrelated database objects remain unchanged

### Requirement: Complete database acceptance environment
Database integration and production-smoke tests SHALL require an explicitly supplied dedicated certificate-verified TLS test database. Their target guard MUST run before fixture writes or API child startup. Fault injection MUST be limited to test-owned connections/transports and MUST NOT stop shared services or alter global database settings.

#### Scenario: TLS test prerequisites are unavailable
- **WHEN** a database integration or production-smoke command lacks a valid dedicated test connection or its required TLS trust configuration
- **THEN** the command fails with a safe prerequisite error instead of skipping checks, using the development database, or disabling verification

#### Scenario: Guarded API child
- **WHEN** a test runner starts a production-mode API process
- **THEN** it first checks the test target against configured non-test targets
- **AND** only after the guard succeeds does the child receive the test connection as its runtime database setting

#### Scenario: Safe outage simulation
- **WHEN** database outage/recovery tests run against a supplied test database
- **THEN** only transports or connections owned by that run are interrupted
- **AND** TLS verification stays enabled and unrelated sessions/services are untouched

### Requirement: Connection budgeting guidance
The repository SHALL document per-process connection limits, reserved database headroom, migration concurrency, and the multiplication of pools across API replicas and future workers. It MUST require a connection-budget review before increasing replica or worker counts and MUST NOT present a registered-user count as evidence of database capacity.

#### Scenario: Operator plans another replica
- **WHEN** an operator follows the foundation scaling instructions
- **THEN** they can calculate aggregate API and future worker connections plus migration and operational headroom against the configured database limit
- **AND** the instructions call for workload measurements before changing that limit
