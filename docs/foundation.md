# Foundation development

This repository is implementing `initialize-store-foundation`. It does not yet
provide a storefront, API runtime, accounts, or marketplace workflows. Task
completion is tracked in `openspec/changes/initialize-store-foundation/tasks.md`.

## Runtime and dependency setup

The development baseline is Node.js **24.20.0** and npm **12.2.0**. Node 24 is the
supported runtime line. `package.json` enforces the supported runtime and npm
version; `.node-version` records the exact baseline. Install Node/npm before
using the commands below. Framework tools are local dependencies.

```text
npm ci
npm ls --workspaces --depth=0
```

Use the root `package-lock.json`; do not generate per-workspace lockfiles. Direct
dependencies are pinned. TypeScript 5.9.3 satisfies the selected Jest transformer
and lint parser's peer ranges. Node's matching major type definitions are pinned
separately. Never commit local environment files, credentials, dependency folders,
compiled output, or test reports.

## Workspace and build contract

| Workspace | Responsibility | Module/build contract |
| --- | --- | --- |
| `apps/web` | Next.js rendering | Framework-native bundler resolution |
| `apps/api` | NestJS backend | CommonJS with constructor decorator metadata |
| `packages/database` | Server-only database access | CommonJS JavaScript and declaration files in `dist/` |

The API imports the database package through `@commerce/database`, never a
source alias. The web app cannot import the database package. Apps cannot import
each other's internals; shared packages cannot import application source. Root
lint checks these boundaries for package names, relative imports, re-exports,
literal dynamic imports, and literal CommonJS imports.

Root type checking, unit tests, and API development startup compile the shared
database package first. Full builds compile shared packages, then API, then web.
Production startup consumes completed build artifacts and does not compile or
run migrations. Database source changes require rebuilding the database package
before restarting the API; root `dev:api` does that on each invocation.

## Commands

These npm command lines work unchanged in PowerShell and POSIX shells. Portable
Node orchestration invokes npm without shell expansion or platform-specific
environment-assignment syntax. Separate terminals run the two applications.

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run dev:web
npm run dev:api
npm run start:web
npm run start:api
```

The commands are introduced incrementally with the implementation. Full API/web
build/start checks require their later bootstrap tasks; declaring scripts is not
evidence those tasks are complete. Unit tests use Jest with TypeScript decorator
metadata and do not need PostgreSQL. The unit-test runner enables Node's
`--experimental-vm-modules` for Jest to load NestJS 12's ESM dependencies while
keeping our application compilation CommonJS. This test-only Node flag produces
an experimental-feature warning; it is not enabled for production startup.
Root commands propagate failure statuses.
Do not use an option that turns missing or failing tests into a successful run.

## Database acceptance prerequisite

The approved plan requires an operator-supplied, dedicated PostgreSQL test
database with certificate-verified TLS for integration and production-smoke
tests. No such target was configured when implementation began. Local plaintext
development is a separate mode and cannot substitute for complete acceptance.
Database provisioning is outside this change. Do not disable TLS verification,
reuse a development/migration target, or stop a shared database service to make
tests run. Database setup/preflight documentation and executable guards are
introduced before database-writing tests in task 2.2.

## Configuration contract

Configuration parsing validates values and optional CA files without opening
database connections. The API runtime that consumes it is a later task.
Diagnostics identify a setting, never its value, URL, password, or CA-file path.

| Setting | Default / rule |
| --- | --- |
| `NODE_ENV` | Required: `development`, `test`, or `production` |
| `DATABASE_URL` | Required `postgres:` or `postgresql:` URL with host, user and database |
| `DATABASE_TLS_MODE` | `verify-full`; explicit `local` permits only non-production loopback connections |
| `DATABASE_CA_FILE` | Optional PEM CA bundle; omitted uses the system trust store |
| `DATABASE_POOL_MAX` | `5` |
| `DATABASE_ACQUIRE_TIMEOUT_MS` | `1000` |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `5000` |
| `API_PORT` | `3001`, range 1 to 65535 |
| `WEB_ORIGINS` | Empty allowlist; otherwise comma-separated exact HTTP(S) origins |
| `API_BODY_LIMIT_BYTES` | `1048576` |
| `API_HEADER_LIMIT_BYTES` | `16384` |
| `API_HEADER_TIMEOUT_MS` | `5000`, no greater than request receive timeout |
| `API_REQUEST_TIMEOUT_MS` | `10000` |
| `API_SHUTDOWN_TIMEOUT_MS` | `10000` |

Database configuration also accepts `MIGRATION_DATABASE_` and `TEST_DATABASE_`
prefixes instead of `DATABASE_`. Those clients are introduced in subsequent
tasks. There is no implicit fallback from test or migration URLs to the runtime
URL. Integration/smoke preflight must additionally enforce the dedicated test
target and verified TLS; parsing alone is not that guard.

All limits must be positive decimal integers within the supported integer range.
URLs cannot carry query parameters or fragments: supply TLS and resource options
through named settings so connection-string parsing cannot override them.
Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`. A malformed CA file is a configuration
failure; a valid CA that does not trust the server is a connection failure to be
verified by TLS integration tests. Unit validation is not proof of a successful
or secure live database handshake.

## Implementation checkpoint: 2026-10-23

Tasks 1.1 through 1.4 and 2.1 are complete (5/26). Work pauses before task 2.2
because the required dedicated TLS PostgreSQL test database is unavailable.
No API HTTP runtime, web page, database pool, migration runner, or business
feature is implemented at this checkpoint. No production capacity is established.

Validation executed on Windows with Node 24.20.0 and npm 12.2.0:

| Command | Result |
| --- | --- |
| `npm install --no-fund` | Passed; initial lockfile generated; zero reported vulnerabilities |
| `npm ci --no-fund` | Passed; lockfile SHA-256 unchanged |
| `npm ls --workspaces --depth=0` | Passed; exactly the three intended workspaces |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed in PowerShell and Git Bash on this Windows host |
| `npm test` | Final run passed: 3 suites, 45 tests |
| `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand` | Passed during Jest loader diagnosis; 32 tests before boundary regression tests were added |
| `node --check scripts/workspace.mjs` | Passed |
| `node --check scripts/import-boundaries.cjs` | Passed |
| `node --check eslint.config.mjs` | Passed |
| `node --check jest.config.cjs` | Passed |
| `openspec validate initialize-store-foundation --strict` | Passed |
| `git diff --check` | Passed |

The first `npm test` run failed to load NestJS's ESM dependency in Jest. Enabling
Jest's documented VM-module support resolved it without changing application
module format or adding dependencies. A subsequent deliberate failing-assertion
probe made `npm test` exit 1 as expected; that probe was removed before the final
passing run. Ten temporary CLI lint probes also exited 1 with the intended
architecture diagnostics; all fixtures were removed. Equivalent negative cases
plus permitted-import cases remain in `tests/unit/import-boundaries.test.ts`.

npm reported blocked install scripts for `@parcel/watcher`, `@swc/core`, and
`unrs-resolver`. The install policy was not changed, and all checks above ran
successfully. Production web/API builds and native-runtime requirements are
still unverified because their implementation tasks remain open.

`npm run build`, application startup, database integration, browser end-to-end,
and production-smoke validation have not been run. Their corresponding tasks
remain unchecked; missing test commands have not been replaced with passing
placeholders. Git Bash verification does not establish native Linux behavior.
