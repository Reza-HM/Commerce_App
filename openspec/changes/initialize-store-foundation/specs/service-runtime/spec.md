# Spec Delta

## Purpose

Make the foundation API safe to configure, operate, restart, and replicate by defining observable health, failure, resource-limit, and shutdown behavior before business endpoints exist.

## ADDED Requirements

### Requirement: Validated startup configuration
Each process SHALL validate its required configuration before serving requests. Missing or malformed required values and invalid resource limits MUST cause a nonzero startup exit naming the invalid setting without exposing its value. Server secrets MUST NOT be exposed through public web configuration. An unreachable database with otherwise valid configuration SHALL affect readiness rather than API startup.

#### Scenario: Malformed database connection setting
- **WHEN** the API starts with a malformed database URL containing a test password
- **THEN** startup exits nonzero before listening
- **AND** the diagnostic identifies the setting without printing the password or URL

#### Scenario: Database temporarily unavailable
- **WHEN** the API starts with valid configuration but cannot reach PostgreSQL
- **THEN** liveness is available and readiness returns unavailable

### Requirement: Separate health probes
The API SHALL expose `GET /health/live` and `GET /health/ready`. Liveness MUST return HTTP 200 while the HTTP process can serve requests, independently of database availability. Readiness MUST return HTTP 200 only when the database check succeeds and shutdown has not begun; otherwise it MUST return HTTP 503. Probe responses MUST use `Cache-Control: no-store` and disclose no infrastructure details.

#### Scenario: Dependency outage and recovery
- **WHEN** PostgreSQL becomes unavailable and subsequently recovers while the API remains running
- **THEN** liveness continues returning 200
- **AND** readiness returns 503 during the outage and returns 200 after a successful new dependency check

### Requirement: Bounded dependency probes
Each readiness database check SHALL have a deadline of at most two seconds, including waiting for a connection. The check MUST release or cancel database work and acquired resources on completion or timeout. A timed-out probe MUST return HTTP 503 without leaving unbounded queued database work.

#### Scenario: Connection pool is exhausted
- **WHEN** a readiness request cannot acquire a connection within its deadline
- **THEN** it returns 503 by that deadline, allowing documented test timing tolerance
- **AND** its canceled wait does not accumulate pending work after the response

### Requirement: Safe HTTP boundary
The API SHALL enforce a configured finite request-body limit, reject unapproved cross-origin access, and disable trust in forwarded client identity by default. Responses MUST include `X-Content-Type-Options: nosniff`; web pages MUST also set a referrer policy and disallow framing. Health and error responses MUST NOT disclose stack traces, environment values, or dependency connection details.

#### Scenario: Oversized request
- **WHEN** a request exceeds the configured body limit
- **THEN** the API rejects it with HTTP 413 before application handling

#### Scenario: Unapproved browser origin
- **WHEN** a request supplies an origin outside the configured exact allowlist
- **THEN** the response does not grant that origin browser access through CORS headers

#### Scenario: Unexpected server failure
- **WHEN** an unexpected internal error reaches the HTTP boundary
- **THEN** the client receives a generic error and correlation identifier without internal exception or secret details

### Requirement: Correlated redacted operational logs
The API SHALL generate a server-owned request identifier, include it in the response and related structured request logs, and log request completion status and duration. It MUST emit startup, dependency-failure, and shutdown events to standard output or error. Logs MUST exclude credentials, authorization/cookie values, connection URLs, request bodies, and raw sensitive query strings.

#### Scenario: Request correlation and redaction
- **WHEN** a request contains test secrets in authorization, cookie, query, and body fields and a caller-supplied request identifier
- **THEN** the response has a server-generated identifier matching its completion log
- **AND** neither those secrets nor the caller's identifier are reproduced as trusted log context

### Requirement: Bounded graceful shutdown
On a supported shutdown signal, the API SHALL stop accepting new application work, become unready, drain in-flight requests within a documented deadline, and close its database pool. The default deadline MUST be ten seconds, after which the process MUST terminate with a failure indication if draining could not complete. Shutdown MUST be idempotent.

#### Scenario: Normal and repeated termination
- **WHEN** a supported termination request is received twice with no blocked work
- **THEN** resources are closed once and the API exits successfully within the deadline

#### Scenario: Work does not drain
- **WHEN** in-flight work cannot finish within the shutdown deadline
- **THEN** the API exits nonzero rather than waiting indefinitely

### Requirement: Replica-independent operation
The API SHALL start on independently configured ports without requiring sticky routing, local persistent files, or in-memory authoritative application state. Resource configuration MUST apply per process. Deployment documentation MUST distinguish this foundation property from proven production capacity.

#### Scenario: Two API processes share one database
- **WHEN** two production API processes start on separate ports using the same development database
- **THEN** both can independently report liveness and readiness
- **AND** restarting one does not prevent the other from serving its probes
