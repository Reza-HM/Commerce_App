# Spec Delta

## Purpose

Provide a reproducible development workspace that keeps application boundaries explicit and allows contributors to verify the technical foundation before adding marketplace features.

## ADDED Requirements

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
The web application SHALL serve a minimal responsive foundation page with English as its default locale, a correct document language, a page title, and a main landmark. Its visible interface text MUST come from a locale message resource. No marketplace workflows, role panels, or installation/offline claims SHALL be exposed.

#### Scenario: Default page renders
- **WHEN** a visitor opens the root page in a production build at desktop and mobile viewport sizes
- **THEN** the English foundation page renders without horizontal overflow or browser errors
- **AND** its document language, title, and main landmark are present

### Requirement: Executable quality gates
The workspace SHALL provide root commands named `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `test:smoke`, and `build`. Each command MUST exit nonzero on a relevant failure. Unit tests MUST run without an external database. Database integration and production-smoke tests MUST require an explicitly supplied dedicated TLS test database and fail clearly when prerequisites are absent.

#### Scenario: Invalid source fails validation
- **WHEN** a type error or forbidden import is introduced
- **THEN** the corresponding root check exits nonzero

#### Scenario: Test service configuration is missing
- **WHEN** database integration or production-smoke tests run without the dedicated TLS test database configuration
- **THEN** they fail with a safe configuration error instead of reporting success or falling back to the development database

### Requirement: Foundation operating instructions
The repository SHALL document setup, application commands, required environment variables, migration commands, test prerequisites, and troubleshooting. It MUST explain that registered-user count alone is not a capacity target and record the workload and infrastructure measurements required before making scale claims.

#### Scenario: Contributor validates the foundation
- **WHEN** a contributor follows the documented validation sequence
- **THEN** they can identify which checks need PostgreSQL, run each root gate, and verify web startup and API probe behavior
- **AND** the documentation distinguishes completed foundation behavior from future marketplace and scaling work
