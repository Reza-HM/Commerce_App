# Design

## Context

See `proposal.md` for motivation and scope. Inspection found only `README.md`, the existing OpenSpec configuration, and installed OpenSpec skills. There are no application manifests, source files, tests, CI pipelines, business schemas, or existing capability specs to preserve or migrate. The OpenSpec setup and installed skills are currently untracked user-provided files and are not part of this change's commit scope.

The agreed direction is a solo-maintained JavaScript ecosystem application using TypeScript, Next.js/React, NestJS/Node.js, PostgreSQL, and Drizzle. English and USD are the initial product defaults. The architecture must leave room for a substantial marketplace, while this change establishes only the runtime and development foundation. The normative contracts are the three delta specs accompanying this design.

## Goals / Non-Goals

**Goals:**

- Make the smallest useful workspace reproducible and independently verifiable on Windows and POSIX development environments.
- Keep the web boundary, backend ownership, database access, and operational behavior explicit from the beginning.
- Establish bounded resources and failure behavior that can support later replication and measurement.
- Give subsequent feature changes a functioning baseline without implementing speculative domain abstractions.

**Non-Goals:**

- Business endpoints, database domain models, role panels, production deployment, and the other exclusions in the proposal.
- Creating empty feature modules or generalized repositories, event buses, distributed locks, or service frameworks without a present consumer.
- Proving million-user capacity with an empty application. Registered users, concurrent users, request rates, data volume, background work, and traffic distribution are distinct quantities.

## Decisions

### 1. Minimal npm workspace with explicit dependency direction

Use npm workspaces and one root lockfile. Use a supported Node.js LTS release compatible with the selected stable framework releases; record the exact runtime/package-manager versions and resolved dependencies when implementation starts. Use strict TypeScript for application and shared source. Root commands orchestrate work in dependency order with portable npm/Node commands rather than shell-specific syntax.

Planned layout:

```text
apps/
  web/                 Next.js App Router and English locale messages
  api/                 NestJS bootstrap, config, health, logging, lifecycle
packages/
  database/            server-only connection factory and migration tooling
docs/
  foundation.md        setup, operations, boundaries, and capacity assumptions
openspec/              existing configuration and planning artifacts
```

The API imports the database package. The web app does not import database code, even in server-rendered modules; future commerce operations go through the backend. Neither app imports the other's source. Shared packages do not import applications. Enforce these restrictions through lint/import checks, including package entry points and relative-path bypasses. Inspect browser build artifacts for a test-only secret sentinel in addition to import checks.

Do not introduce a shared contracts or configuration package until actual consumers need it. The web shell does not call the API. Future business modules own their data and expose deliberate interfaces rather than importing another domain's implementation.

**Alternative:** pnpm plus a build orchestrator could accelerate a much larger workspace, but adds tooling without a present need. A single Next.js backend was considered previously; the agreed dedicated NestJS backend better separates the eventual marketplace's rules and lifecycle from rendering.

### 2. Independently runnable web and modular backend

Create only the Next.js root layout/page and NestJS operational endpoints. The web shell uses `next-intl` with one English message resource, document language, basic responsive layout, and accessible landmarks. USD remains a documented product default; no pricing or monetary domain code is needed here. Preserve the framework's production build path and avoid an unnecessary custom server.

Use NestJS's default HTTP adapter initially. No user workload has established an adapter bottleneck. Keep feature logic independent of adapter-specific request objects so a measured need can justify revisiting the adapter.

The backend remains one application with internal modules. Future background workers will reuse backend modules through a separate entry point and run independently. This change does not add a dormant worker, pg-boss, Redis, realtime transport, full-text indexes, or storage SDKs.

**Alternative:** separate microservices or separate buyer/seller/admin applications add operational and contract overhead before their boundaries have been exercised. Keep future role-specific interfaces inside the web app, with authorization owned by the backend when authentication is implemented.

### 3. Process-specific configuration and secret separation

Create typed runtime configuration in the API and database package; read environment settings at startup instead of throughout request handlers. Validate settings before listening. Web code receives only explicitly public settings, never a spread of the process environment. Commit documentation with synthetic placeholders, not actual environment files or credentials.

Document at least `NODE_ENV`, API port, exact web-origin allowlist, `DATABASE_URL`, database TLS mode/CA configuration, pool/acquisition/statement limits, body limit, and shutdown deadline. Migration and integration commands have separate explicit `MIGRATION_DATABASE_URL` and `TEST_DATABASE_URL` settings and matching TLS options. The web shell requires no database settings.

Database defaults are five connections per process, one-second acquisition, and five-second statements; readiness uses a shorter bound described below. Default request body size is 1 MiB and default shutdown drain is ten seconds. Limit values must be finite positive integers. Production configuration requires certificate-verified database TLS. Explicit local unencrypted mode is restricted to development/test. Do not disable certificate verification globally or in connection options.

Malformed configuration prevents startup; temporary database failure does not. This allows probes to distinguish invalid deployment configuration from an unavailable dependency.

**Alternative:** a general-purpose configuration service or new schema-validation dependency is unnecessary unless required by the selected integrations. Small typed validators and centralized configuration are sufficient for this scope.

### 4. Explicit database lifecycle and migrations

The database package owns a configured connection factory using the PostgreSQL driver and Drizzle. NestJS owns one pool per API process, injects it where needed, and closes it during shutdown. Do not create a new pool per request or on every hot reload. Keep connection acquisition and statement execution bounded on client and server paths; a readiness timeout must also cancel its pending acquisition or discard its client, not merely race a timer and leave work queued.

Provide Drizzle configuration and root `db:generate` / `db:migrate` scripts. Use versioned SQL generated for review and explicit migration execution. With an empty application schema, generation reports no changes and migration execution reports no pending work; no fake initial business table or empty SQL migration is necessary. Migration metadata is permissible when needed by the runner. Runtime startup performs no DDL. Migrations are an operator-controlled single-run step, outside API replication; no deployment automation is introduced.

Integration tests use a deliberately configured test database with unique schemas or temporary tables. Compare parsed target host, normalized port, and database name against configured development/migration targets, not just URL strings. Reject matching targets and use only fixtures owned by the current run. Test transactions and migration replay with technical fixture migrations kept out of production migration history. Never reset a database or delete unowned schemas.

Document least-privilege runtime credentials and separate schema-changing credentials; the foundation does not provision database users. A dedicated test target is an operator-provided prerequisite, not proof that any arbitrary database is safe to modify.

**Alternative:** schema synchronization and startup migrations are convenient locally but create unreviewed changes and replica startup races. Per-request connections or unbounded pools make replication unsafe.

### 5. Small observable HTTP surface

Expose `/health/live` and `/health/ready` only, with JSON `{ "status": "ok" }` on success and `{ "status": "unavailable" }` on readiness failure. Both disable caching. A new readiness check must recover after dependency restoration without restarting the API. Bound the entire database check, including pool wait, to two seconds; use a one-second acquisition limit and a probe-specific statement/client deadline within that budget. Tests allow at most 500 ms additional scheduling tolerance while asserting resources do not accumulate after repeated timeouts.

Use structured JSON logging through the framework's logging facilities unless a demonstrated gap requires another dependency. Generate a request identifier at the trusted server boundary; do not trust caller-provided identifiers or forwarded client IP headers by default. Return `X-Request-Id` and use that identifier in completion/error logs. Capture method, route/path without query values, status, and duration. Redact secrets at the logging boundary and avoid logging arbitrary request or exception objects. Failed dependency checks record a safe error classification, not raw driver errors or connection details.

Configure exact-origin CORS, finite body/header/receive-time limits, `nosniff`, framing protection, and an explicit web referrer policy. Unknown routes and unexpected failures return safe responses; unexpected errors contain only a stable error code, generic message, and request identifier. Header/body rejection can occur before application middleware; do not expose internals in those responses. Do not add a fake authentication mechanism or claim CORS is access control.

Enable idempotent shutdown handling: mark unready, stop new work, drain active requests, and close resources. A hard deadline forces a nonzero exit for stalled work. Document supported signals per platform; test the close path on Windows and actual termination signals on platforms that support them. This does not assume identical signal delivery on every OS.

**Alternative:** liveness that depends on PostgreSQL can cause restart storms during an outage. Verbose health responses and raw exception logging leak operational details.

### 6. Scale through measured boundaries

Keep authoritative application state out of process memory and local disk. Process-local connection pools, request context, and transient buffers are allowed. Start two API instances on separate ports against one database and verify independent operation and restart behavior. This checks a replication prerequisite, not throughput or distributed business correctness.

Document the initial connection budget as:

```text
API replicas * API pool maximum
+ future worker replicas * worker pool maximum
+ migration/admin/monitoring headroom
<= database connection limit
```

Record the distinction between registered users and traffic. Before a later capacity claim, define active-user concurrency, endpoint mix, request/bid/message/job rates, dataset size/skew, latency percentiles, acceptable errors, resource budgets, recovery objectives, and test infrastructure. Measure realistic workloads and failure recovery after the relevant features exist. Do not set an invented million-user throughput target now.

Document future gates: object-level authorization before private data, durable idempotency before payment/job retries, indexed query plans and pagination before large catalogs, shared coordination before scaling realtime/queue consumers, and production rate limiting, TLS termination, backups/restore verification, monitoring, and load testing before public commercial operation. These are future obligations, not implementation tasks in this change. TLS termination at a reverse proxy is separate from the database TLS required here.

**Alternative:** adding caches, replicas, distributed queues, or orchestration infrastructure now would add cost and failure modes without a workload demonstrating benefit.

### 7. Validation is executable but proportional

Provide root `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, and `build` commands. Use the framework-compatible Jest toolchain for backend behavior and one Playwright browser smoke suite for the production web shell. Integration tests exercise PostgreSQL, not mocked substitutes. Unit tests run without PostgreSQL; integration tests fail clearly instead of silently skipping when test configuration is missing.

Cover configuration failure and secret redaction, CORS/body/error behavior, probe outage/recovery and timeout resource cleanup, transaction rollback, pool bounds, migration replay, and shutdown. Browser smoke checks root-page rendering, document metadata/landmarks, narrow viewport overflow, and console errors. Inspect the production client output for server-only imports and a synthetic secret sentinel.

Run a production-mode API smoke and two-instance restart check against a certificate-verified TLS test database; document how to supply its CA and connection. Plaintext local PostgreSQL is enough for development and most tests but does not satisfy this production-mode check. Make missing TLS test prerequisites an explicit failure, not an insecure fallback. No hosted test platform or new provisioning dependency is required; a preconfigured local or remote test instance is acceptable.

**Alternative:** green placeholder tests or a schema snapshot do not verify operational behavior. A large benchmark framework, coverage target, or full browser matrix is premature for this small shell.

## Risks / Trade-offs

- [Solo maintenance of two applications] -> Keep only three workspaces, one package manager, root commands, and documented boundaries; defer shared abstractions.
- [Framework version and tooling compatibility] -> At implementation, verify current supported releases together, record versions, commit the lockfile, and validate with a clean install. Do not assume a version from this document.
- [Local development differs from production security] -> Make transport mode explicit and include the TLS production smoke; never relax production verification for local convenience.
- [Pool limits multiply with replica count] -> Document the budget and test the per-process maximum; revise based on measured database capacity.
- [Timeouts hide outstanding work] -> Assert acquisition/query cleanup under stalled and exhausted dependencies, not just a fast HTTP response.
- [An empty application gives misleading scale confidence] -> Report only foundation validation; defer capacity assertions until representative workloads and service-level targets exist.
- [No authentication or public abuse protection yet] -> Keep this release a technical foundation, document the later public-release gates, and expose no business or administrative actions.

## Migration Plan

This is a greenfield local foundation, not a deployment change. Implement on a feature branch only after explicit approval. Add workspace/tooling first, then database/configuration, runtime boundaries, web shell, and validation/docs in the dependency order in `tasks.md`.

No existing application data requires migration. Use a dedicated test database for fixture checks and explicit migration commands for development. A rollback is a normal reviewed code revert; do not delete existing OpenSpec files or reset user work. Do not perform automatic schema rollback or data deletion. CI/CD and deploy steps are excluded and would require their own approval under the user's Git rules.

## Open Questions

- Hosting provider, production database service, infrastructure size, and public domain remain deferred; none changes the local foundation contract.
- Additional languages, authentication library, UI component system, payment/payout providers, commission rules, launch jurisdiction, and shipping integrations belong to later scoped changes.
- Workload-derived service levels and capacity targets remain deferred until representative domains and traffic assumptions are defined.

## Reference Notes

Official references checked during planning; these support library capabilities, not a production capacity guarantee:

- [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/)
- [NestJS configuration](https://docs.nestjs.com/techniques/configuration) and [lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
- [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router)
