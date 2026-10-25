# Spec Delta

## MODIFIED Requirements

### Requirement: Validated startup configuration
Each process SHALL validate its required configuration before serving requests. Missing or malformed required values and invalid resource limits MUST cause a nonzero startup exit naming the invalid setting without exposing its value. Server secrets MUST NOT be exposed through public web configuration. An unreachable database with otherwise valid configuration SHALL affect readiness rather than API startup.

#### Scenario: Malformed database connection setting
- **WHEN** the API starts with a malformed database URL containing a test password
- **THEN** startup exits nonzero before listening
- **AND** the diagnostic identifies the setting without printing the password or URL

#### Scenario: Database temporarily unavailable
- **WHEN** the API starts with valid configuration but cannot reach PostgreSQL
- **THEN** liveness is available and readiness returns unavailable

#### Scenario: Invalid configuration domain
- **WHEN** an environment, URL protocol, local-host restriction, URL option, port range, or resource limit is invalid
- **THEN** startup fails before listening and names the setting without printing its value

#### Scenario: API runs in test mode
- **WHEN** the API is configured with `NODE_ENV=test`
- **THEN** it selects guarded `TEST_DATABASE_URL` and never substitutes `DATABASE_URL`
- **AND** a missing or matching development target fails before any client exists

### Requirement: Replica-independent operation
The API SHALL start on independently configured ports without requiring sticky routing, local persistent files, or in-memory authoritative application state. Resource configuration MUST apply per process. Deployment documentation MUST distinguish this foundation property from proven production capacity.

#### Scenario: Two API processes during a database outage
- **WHEN** the production-smoke runner starts two API processes on separate ports with valid local plaintext configuration pointing at a test-owned unavailable endpoint
- **THEN** both independently report liveness 200 and readiness 503
- **AND** restarting one does not prevent the other from serving its probes
