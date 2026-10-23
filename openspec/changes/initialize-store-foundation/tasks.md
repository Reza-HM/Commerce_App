# Tasks

All tasks below are future implementation work. Creating or reviewing these planning artifacts does not mark any task complete or authorize implementation. Follow the numbered groups in order; add each group's relevant tests and documentation with its implementation.

## 1. Reproducible workspace and boundaries

- [ ] 1.1 Establish the root npm workspace, `apps/web`, `apps/api`, and `packages/database` manifests with compatible supported Node.js LTS/npm/framework versions, strict TypeScript, and one lockfile; verify the workspace inventory and a clean `npm ci` without lockfile changes.
- [ ] 1.2 Add portable root lint/type-check/build commands, separate web/API development and production start commands, and ignore rules for dependencies, build output, local environment files, logs, and test artifacts; verify command resolution on Windows and POSIX and confirm generated files remain untracked.
- [ ] 1.3 Enforce web-to-database, cross-application-source, and shared-package-to-application import restrictions; verify lint rejects temporary invalid imports through both package entry points and relative paths, then remove the temporary invalid fixtures.
- [ ] 1.4 Establish the Jest unit-test runner and root `test` command without external-service prerequisites; verify a deliberately failing temporary test produces a nonzero exit, remove it, and document setup/versions/commands in `docs/foundation.md`.

## 2. Validated configuration and database foundation

- [ ] 2.1 Implement typed API/database configuration with safe errors, finite positive limits, explicit local-development transport, and certificate-verified production TLS; verify unit tests for missing/malformed settings, nonpositive/nonfinite limits, unsafe production TLS, and diagnostic secret redaction.
- [ ] 2.2 Implement the server-only PostgreSQL/Drizzle connection factory with one bounded pool per consumer process and explicit cleanup; verify integration tests for connectivity, default/configured pool maximum, acquisition/statement deadlines, transaction rollback, and connection reuse after failure.
- [ ] 2.3 Add the dedicated test-database configuration guard and run-owned fixture isolation, then wire root `test:integration`; verify missing configuration and matching development/migration targets fail before writes, including differently formatted URLs, and verify cleanup preserves unrelated fixtures.
- [ ] 2.4 Add reviewable Drizzle migration configuration and root `db:generate` / `db:migrate` commands with an explicit migration connection; verify empty-schema no-op behavior, fixture migration replay, and nonzero failure handling without creating production business tables.
- [ ] 2.5 Document database/TLS variables, local/test/TLS test prerequisites, runtime versus migration privileges, timeout defaults, fixture safety, and explicit migration execution; verify the documented commands against the dedicated development/test targets without a destructive reset.

## 3. API operational runtime

- [ ] 3.1 Bootstrap NestJS with centralized validated configuration and injected pool ownership, without startup migrations; verify an invalid setting prevents listening while an unreachable database still permits liveness, and confirm startup performs no DDL.
- [ ] 3.2 Implement `/health/live` and `/health/ready` with the specified status bodies, cache policy, and two-second total readiness budget; verify real-database outage/recovery, exhausted-pool and stalled-query cases, the 500 ms test tolerance, and absence of accumulating pending work after repeated timeouts.
- [ ] 3.3 Add server-owned `X-Request-Id`, structured request/lifecycle logs, redaction, and safe error mapping; verify correlation plus synthetic secrets in headers/query/body/database errors, safe unknown-route responses, and generic unexpected-error output without a production test-error route.
- [ ] 3.4 Add the 1 MiB default body limit, finite header/receive-time bounds, exact-origin CORS, `nosniff`, and default-disabled proxy trust; verify HTTP 413, allowed/disallowed origins, response headers, and spoofed forwarded/request-identifier behavior through HTTP tests.
- [ ] 3.5 Add idempotent graceful shutdown with readiness transition, draining, pool closure, and a ten-second default hard deadline; verify successful close, repeated shutdown, and nonzero forced termination for blocked work using portable lifecycle tests plus supported platform signal tests.
- [ ] 3.6 Document probe contracts, safe error/log fields, HTTP limits, proxy assumptions, shutdown behavior, and platform signal limitations; verify examples against the running API and record any OS-specific signal check that could not be exercised.

## 4. Minimal localized web shell

- [ ] 4.1 Create the Next.js root layout/page and `next-intl` English message resource with title, document language, main landmark, and responsive layout; verify its production build and successful root-page response while the API/database are stopped, without business UI or PWA/offline behavior.
- [ ] 4.2 Configure web framing protection, referrer policy, and `nosniff`, keeping server environment values out of public configuration; verify response headers and scan browser-delivered output for a synthetic server-secret sentinel and database modules.
- [ ] 4.3 Add a focused Playwright production-shell smoke suite and root `test:e2e`; verify desktop/mobile rendering, metadata/landmarks, no horizontal overflow or console errors, and a nonzero exit on a failed assertion; document browser installation and execution prerequisites without adding a hosted testing service.

## 5. Cross-foundation validation and handoff

- [ ] 5.1 Run the production-mode API smoke and two-instance restart check on separate ports against a certificate-verified TLS test database; verify both probes, independent restart behavior, bounded total connections, and an explicit failure when required TLS test configuration is missing.
- [ ] 5.2 Complete the foundation operating notes with dependency direction, API-replica/future-worker connection budgeting, deferred-stack decisions, and workload/latency/error/recovery measurements needed for future capacity claims; verify the instructions against observed startup/test behavior and state clearly that this change demonstrates no million-user capacity result.
- [ ] 5.3 Run clean install, `lint`, `typecheck`, `test`, `test:integration`, `build`, and `test:e2e` in the documented order, followed by the production smoke; verify all exit successfully and record platform/runtime/database versions and any unverified environment-specific checks.
- [ ] 5.4 Review the implementation diff against all three capability specs, run `openspec validate initialize-store-foundation --strict`, and verify no business endpoints/tables, CI/CD/deploy changes, committed secrets, unrelated OpenSpec setup edits, or unnecessary deferred-service dependencies were introduced.
