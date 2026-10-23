# Tasks

Implementation is approved. Owner revision on 2026-10-23 waives live database execution as a completion gate; simulated driver checks are not evidence of PostgreSQL/TLS behavior. Creating or reviewing these planning artifacts does not mark any task complete or authorize implementation. Follow the numbered groups in order; add each group's relevant tests and documentation with its implementation.

## 1. Reproducible workspace and boundaries

- [x] 1.1 Establish the root npm workspace, `apps/web`, `apps/api`, and `packages/database` manifests with compatible supported Node.js LTS/npm/framework versions, strict TypeScript, and one lockfile; verify the workspace inventory and a clean `npm ci` without lockfile changes.
- [x] 1.2 Configure compiled CommonJS database exports/declarations, CommonJS API decorator metadata, framework-native web module settings, dependency-ordered root lint/type-check/build commands, and separate startup commands; verify package/compiler configuration and command resolution, document the build contract, and ignore generated/local files without committing environment values. Clean consumer execution is verified after bootstrap in 5.3.
- [x] 1.3 Enforce web-to-database, cross-application-source, and shared-package-to-application import restrictions; verify lint rejects temporary invalid imports through both package entry points and relative paths, then remove the temporary invalid fixtures.
- [x] 1.4 Establish the Jest unit-test runner with API-compatible decorator transforms and root `test` without external-service prerequisites; verify a one-time failing assertion propagates a nonzero exit, remove it, and document setup/versions/commands in `docs/foundation.md`.

## 2. Validated configuration and database foundation

- [x] 2.1 Implement typed API/database configuration with safe errors, validated environment/TLS enums, URL protocol, port range, finite positive limits, and explicit local transport; make separate TLS settings authoritative for runtime/migration/test clients and reject TLS-related URL parameters; verify unit tests for invalid settings, URL overrides, unsafe production TLS, and secret redaction.
- [x] 2.2 Implement the dedicated-target guard, run-owned fixture helpers, and optional root `test:integration` preflight before any database-writing test. Unit-test missing TLS prerequisites and matching parsed development/migration targets. Document fixture-only cleanup and test setup; live cleanup validation is deferred under the owner waiver.
- [x] 2.3 Implement the server-only PostgreSQL/Drizzle factory with one injected pool per API process, explicit cleanup, and safe background error handling. Verify effective pool limits, lazy connectivity, failure handling and reconnection contracts with injected driver doubles; live pool behavior remains unverified.
- [x] 2.4 Implement bounded acquisition/statements and transactional access. Verify configured deadlines, stalled-probe disposal, commit/rollback/release contracts with driver doubles; live exhausted-pool and rollback validation is deferred. Add no business schemas.
- [x] 2.5 Verify effective TLS options and runtime/migration/test URL override rejection with unit tests. Document configuration failure versus handshake/readiness failure and explicitly defer trusted/untrusted/hostname live handshake validation.
- [x] 2.6 Add reviewable Drizzle migration configuration and root `db:generate` / `db:migrate` commands with explicit migration connection validation. Verify empty-schema no-op and nonzero failure locally; provide guarded fixture replay integration coverage but defer its live execution.
- [x] 2.7 Complete database operating notes covering TLS/configuration, runtime versus migration privileges, deadlines, safe fixtures and explicit migrations. Verify available commands and document live checks as unverified; never reset a database or bypass production TLS.

## 3. API operational runtime

- [x] 3.1 Bootstrap NestJS with centralized validated configuration and injected pool ownership, without startup migrations; verify an invalid setting prevents listening while valid configuration permits HTTP startup despite an unreachable database, and confirm startup performs no DDL. Probe behavior is verified in 3.2.
- [x] 3.2 Implement uncached health probes and two-second total readiness budget with one coalesced active check per process. Verify outage/recovery, concurrent bursts, stalled dependencies and cleanup using injected run-owned driver doubles, allowing only 500 ms scheduling tolerance. Defer live warmed-pool fault validation.
- [x] 3.3 Add server-owned `X-Request-Id` before body parsing and structured request/lifecycle logs with redaction; verify matching response/completion identifiers and synthetic secrets in headers/query/body/database errors without trusting caller-supplied identifiers.
- [x] 3.4 Add JSON-only body handling with the 1 MiB default limit, 16 KiB header limit, five-second header and ten-second request receive defaults, exact-origin CORS, `nosniff`, and disabled proxy trust; verify rejection statuses for declared/chunked oversized JSON, malformed/unsupported bodies and header/receive limits, plus allowed/disallowed/malformed origins. Do not treat CORS as server-side authorization.
- [x] 3.5 Add safe error mapping for unknown routes, parser failures, and unexpected exceptions; verify safe 400/404/413/415 and generic 500 responses, appropriate correlation, and lower-level parser behavior through a test-only harness, without shipping diagnostic/error/business routes.
- [x] 3.6 Add idempotent graceful shutdown with readiness transition, draining, and pool closure; verify normal/repeated shutdown closes resources once and completes within the configured deadline using portable lifecycle tests.
- [x] 3.7 Add the ten-second default hard shutdown deadline; verify a blocked test-owned request forces nonzero termination, and exercise actual supported platform signals without exposing a production test route.
- [x] 3.8 Document probe contracts, safe error/log fields, HTTP limit units/defaults, proxy assumptions, shutdown, and platform signal limitations; verify examples against the API and explicitly record any OS-specific signal check that could not be exercised.

## 4. Minimal localized web shell

- [x] 4.1 Create the Next.js root layout/page and `next-intl` English message resource with title, document language, main landmark, and responsive layout; verify its production build and successful root-page response while the API/database are stopped, without business UI or PWA/offline behavior.
- [x] 4.2 Configure web framing protection, referrer policy, and `nosniff`, keeping server values out of public configuration; supply synthetic non-public sentinels to the web build and runtime themselves, then verify response headers and absence of sentinels/database modules in browser JavaScript, HTML, and server-component responses alongside the independent import checks.
- [x] 4.3 Add a focused Playwright production-shell smoke suite and root `test:e2e`; verify desktop/mobile rendering, metadata/landmarks, no horizontal overflow or console errors, and a nonzero exit on a failed assertion; document browser installation and execution prerequisites without adding a hosted testing service.

## 5. Cross-foundation validation and handoff

- [x] 5.1 Add root `test:smoke` for production-mode API startup, invalid configuration, two independent instances and restart against a test-owned unavailable endpoint with verified-TLS configuration. Verify live 200, ready 503 and safe shutdown without a database; healthy database behavior is covered by injected tests, not claimed as live validation.
- [x] 5.2 Complete the foundation operating notes with dependency direction, API-replica/future-worker connection budgeting, deferred-stack decisions, and workload/latency/error/recovery measurements needed for future capacity claims; verify the instructions against observed startup/test behavior and state clearly that this change demonstrates no million-user capacity result.
- [x] 5.3 From a clean install with no previous compiled output, run lint, typecheck, test, build, test:e2e and test:smoke. Run test:integration to verify missing-prerequisite failure, not a live pass. Verify declarations/build order, compiled API resolution, ignored outputs, and record runtime/platform and explicitly unverified live PostgreSQL/TLS and OS-specific checks.
- [x] 5.4 Review the implementation diff against all three capability specs, run `openspec validate initialize-store-foundation --strict`, and verify no business endpoints/tables, CI/CD/deploy changes, committed secrets, unrelated OpenSpec setup edits, or unnecessary deferred-service dependencies were introduced.
