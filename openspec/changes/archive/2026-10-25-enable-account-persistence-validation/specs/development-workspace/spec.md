# Spec Delta

## MODIFIED Requirements

### Requirement: Executable quality gates
The workspace SHALL provide `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `test:smoke`, and `build`, each returning nonzero on failure. Unit and process smoke tests MUST run without PostgreSQL. Live integration tests MUST require a dedicated local database and fail clearly without it. The waiver covers only archived foundation completion; persistence-validation work and subsequent account-persistence changes MUST pass live tests and document unverified checks.

#### Scenario: Invalid source fails validation
- **WHEN** a type error or forbidden import is introduced
- **THEN** the corresponding root check exits nonzero

#### Scenario: Test service configuration is missing
- **WHEN** live database integration tests run without the dedicated local test database configuration
- **THEN** they fail with a safe configuration error instead of reporting success or falling back to the development database

#### Scenario: Persistence validation cannot be completed with offline checks alone
- **WHEN** lint, type checking, unit tests, builds, browser foundation checks, and API process smoke pass without a live database
- **THEN** those results establish only their stated database-independent coverage
- **AND** `enable-account-persistence-validation` remains incomplete until its mandatory live integration checks pass

### Requirement: Foundation operating instructions
The repository SHALL document setup, application commands, required environment variables, migration commands, test prerequisites, and troubleshooting. It MUST explain that registered-user count alone is not a capacity target and record the workload and infrastructure measurements required before making scale claims.

#### Scenario: Contributor validates the foundation
- **WHEN** a contributor follows the documented validation sequence
- **THEN** they can identify which checks need PostgreSQL, run each root gate, and verify web startup and API probe behavior
- **AND** the documentation distinguishes completed foundation behavior from future marketplace and scaling work

#### Scenario: Contributor prepares persistence validation
- **WHEN** a contributor follows the database testing instructions
- **THEN** they can identify the test-only database, required privileges, private configuration, serial execution, and cleanup requirements before running tests
- **AND** the instructions explain normalized target comparison and its inability to prove safety across undisclosed aliases or omitted non-test connections
- **AND** the historical waiver is preserved without presenting it as approval to skip new live persistence gates

## ADDED Requirements

### Requirement: Persistence validation evidence
Completion evidence SHALL identify commands, exit results, date, runtime/platform and PostgreSQL versions, actual application-history coverage, and sentinel/rollback outcomes without secrets. Database-independent and live results MUST be distinguished. Missing live prerequisites MUST remain an explicit incomplete gate; empty application history MUST NOT be described as non-empty account migration coverage.

#### Scenario: Required validation succeeds
- **WHEN** implementation completion is reported for `enable-account-persistence-validation`
- **THEN** results include `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:smoke`, and a successful live `npm run test:integration`
- **AND** `openspec validate enable-account-persistence-validation --strict` and `openspec validate --specs --strict` pass
- **AND** the report separates real application-history replay from technical fixture replay, and records transaction rollback, failed-migration rollback, successful/failing cleanup preservation, and remaining unverified checks

#### Scenario: Test database configuration is unavailable
- **WHEN** the required live environment cannot be supplied
- **THEN** available offline checks can be reported individually without marking live verification or the implementation complete
- **AND** no credentials are invented and no production/shared target is substituted
