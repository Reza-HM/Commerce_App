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
- **WHEN** the API runs in development or test mode with explicitly selected local unencrypted transport
- **THEN** it can connect to the configured development or dedicated test database without changing production security defaults

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

### Requirement: Connection budgeting guidance
The repository SHALL document per-process connection limits, reserved database headroom, migration concurrency, and the multiplication of pools across API replicas and future workers. It MUST require a connection-budget review before increasing replica or worker counts and MUST NOT present a registered-user count as evidence of database capacity.

#### Scenario: Operator plans another replica
- **WHEN** an operator follows the foundation scaling instructions
- **THEN** they can calculate aggregate API and future worker connections plus migration and operational headroom against the configured database limit
- **AND** the instructions call for workload measurements before changing that limit
