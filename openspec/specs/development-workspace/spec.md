# development-workspace Specification

## Purpose

Provide a reproducible development workspace that keeps application boundaries explicit and allows contributors to verify the technical foundation before adding marketplace features.

## Requirements

### Requirement: Reproducible setup

The repository SHALL document supported runtime and package-manager versions, commit one root dependency lockfile, and provide a clean-install procedure that does not require globally installed application tools. Documented setup and validation commands MUST work in Windows PowerShell and a POSIX shell without editing command syntax.

#### Scenario: Fresh checkout setup

- **WHEN** a contributor follows setup instructions using supported versions and a configured development database
- **THEN** dependencies install from the committed lockfile without changing it
- **AND** each application can build and start using repository commands

#### Scenario: Clean build and type checking

- **WHEN** the contributor runs root type checking and build from a clean install without previous compiled output
- **THEN** required shared declarations and packages are built before their consumers
- **AND** the compiled API starts using the database package's public entry point without source aliases or stale output

### Requirement: Enforced application boundaries

The workspace SHALL reject imports from one application's internal source into another application and SHALL prevent the web application from importing the database package. Shared packages MUST NOT depend on application internals. Client bundles MUST NOT contain database access or server secrets.

#### Scenario: Forbidden dependency is introduced

- **WHEN** a web module imports database code or an application imports another application's internal source
- **THEN** the boundary check fails with a diagnostic identifying the forbidden dependency

#### Scenario: Client artifact inspection

- **WHEN** synthetic non-public secret values are supplied to the web build and web server environment
- **THEN** browser-delivered JavaScript, HTML, and server-component responses contain none of those values or database access modules
- **AND** import-boundary validation remains required independently of the secret scan

### Requirement: Independent application startup

The workspace SHALL provide separate development and production startup commands for the web and API processes. Rendering the foundation web page MUST NOT require a running API or database. The foundation MUST NOT require a queue, cache, storage service, or external identity provider.

#### Scenario: Web starts independently

- **WHEN** the API and database are unavailable and the web application has valid public configuration
- **THEN** the production web process serves the foundation page successfully

### Requirement: English localized web shell

The web application SHALL serve a responsive foundation page with English as its default locale, a correct document language, a page title, and a main landmark. Its visible interface text MUST come from a locale message resource. The home page SHALL link to account registration and sign-in while remaining independent of API/database availability. Marketplace workflows, role panels, and installation/offline claims MUST NOT be exposed.

#### Scenario: Default page renders

- **WHEN** a visitor opens the root page in a production build at desktop and mobile viewport sizes
- **THEN** the English foundation page renders without horizontal overflow or browser errors
- **AND** its document language, title, and main landmark are present

#### Scenario: Account navigation does not require dependencies

- **WHEN** a visitor opens the home page while the API and database are unavailable
- **THEN** localized registration and sign-in links remain available
- **AND** following either link renders its form without a successful dependency check

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

### Requirement: Reproducible source formatting

The repository SHALL provide a pinned formatter, committed style configuration, and write/check commands for maintained frontend and backend sources. Formatting MUST preserve migration SQL, generated migration metadata, checksum-sensitive assets, dependency lockfiles, generated outputs, and historical workflow records.

#### Scenario: Contributor formats source

- **WHEN** the documented formatter runs
- **THEN** supported maintained source files use the same readable style and LF line endings
- **AND** protected history and checksum-sensitive files retain their bytes

#### Scenario: Formatting is checked

- **WHEN** source formatting differs from the committed configuration
- **THEN** the check command fails without writing files
