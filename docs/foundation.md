# Foundation development

This is a technical foundation with an English web page and operational API.
It has no marketplace workflows or business tables. English/USD are the initial
product defaults, without pricing or monetary domain code.

## Setup

Use Node **24.20.0** (supported line: Node 24) and npm **12.2.0**, enforced in the
root manifest. Dependencies are pinned in one root lockfile. These commands work
unchanged in PowerShell and POSIX shells:

```text
npm ci
npm ls --workspaces --depth=0
npm run lint
npm run typecheck
npm test
npm run build
npm exec -- playwright install chromium
npm run test:e2e
npm run test:smoke
```

Set environment variables in your private session or a local environment loader;
the application does not automatically read `.env` files. Never commit secrets,
environment files, dependency folders, generated output or test reports.
In separate terminals run `npm run dev:web` and `npm run dev:api`. After a build,
use `npm run start:web` and `npm run start:api`. Web defaults to port 3000, API to
3001 (loopback). Rendering the web needs no API or database. Valid API configuration
permits startup even when PostgreSQL is unavailable.

## Workspace and build contract

Frontend styling uses Tailwind CSS utilities, with shared theme tokens in
`apps/web/app/globals.css`. Use plain CSS only for requirements that utilities
and theme configuration cannot express clearly; keep exceptions small, scoped,
and explained. `AGENTS.md` and OpenSpec's context preserve this project convention.

| Workspace | Ownership | Build |
| --- | --- | --- |
| `apps/web` | Next.js rendering and next-intl English resource | Framework-native modules |
| `apps/api` | NestJS operational runtime | CommonJS and decorator metadata |
| `packages/database` | Server-only PostgreSQL/Drizzle | Compiled CommonJS and declarations |

The API imports `@commerce/database` through its compiled public entry point.
Web cannot import database code, including in server-rendered modules. Apps cannot
import each other's internals; shared packages cannot import apps. Lint checks
package and relative imports, re-exports, literal dynamic imports and require.

Root type checking builds database declarations and generates Next route types
before checking workspaces/tests. Build order is database → API → web. Unit tests
and API development startup build the database first. `dev:api` builds API then
watches compiled output; after editing API/database source, rebuild and restart
that command. Production startup never compiles or migrates. TypeScript 5.9.3
matches the lint/Jest peers. Jest enables experimental VM modules to load Nest 12
dependencies; the expected warning and flag are test-only.

## Configuration

Validation happens before listening/connecting. Diagnostics name settings, never
values, credentials, URLs or CA paths. Web configuration exports no server values.

| Setting | Default / rule |
| --- | --- |
| `NODE_ENV` | Required: development, test, production |
| `DATABASE_URL` | Required postgres/postgresql URL: user, host, database |
| `DATABASE_TLS_MODE` | verify-full; local only for non-production loopback |
| `DATABASE_CA_FILE` | Optional PEM CA bundle; otherwise Node default trust roots |
| `DATABASE_POOL_MAX` | 5 per process |
| `DATABASE_ACQUIRE_TIMEOUT_MS` | 1000; effective maximum 1000 ms protects readiness |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 5000, client query and server statement deadline |
| `API_PORT` | 3001; 1–65535 |
| `WEB_ORIGINS` | Empty; otherwise comma-separated exact HTTP(S) origins |
| `API_BODY_LIMIT_BYTES` | 1048576 (1 MiB) |
| `API_HEADER_LIMIT_BYTES` | 16384 (16 KiB) |
| `API_HEADER_TIMEOUT_MS` | 5000; no greater than request timeout |
| `API_REQUEST_TIMEOUT_MS` | 10000 |
| `API_SHUTDOWN_TIMEOUT_MS` | 10000 |

Database variables accept `MIGRATION_DATABASE_` or `TEST_DATABASE_` prefixes for
their separate commands, with no runtime URL fallback. Limits are positive finite
decimal integers. URLs reject queries/fragments, including TLS overrides. Parsed
explicit options keep TLS authoritative. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
Production always requires `rejectUnauthorized: true`. Missing/malformed CA files
fail configuration; valid-but-untrusted CA/hostname failures happen on connection
and make readiness unavailable. Unit options tests do not prove a TLS handshake.

Local development uses `NODE_ENV=development`, `DATABASE_TLS_MODE=local`, and a
loopback URL such as `postgresql://local_user:placeholder@localhost:5432/commerce_dev`
in your private session. This is a syntax example, not a provisioned credential.

## Database lifecycle and migrations

Nest owns one lazy pool per process, never one per request. Limits bound pool
size, acquisition and statements. Background errors emit safe classifications;
pg removes failed idle clients. Readiness coalesces work, does not cache completed
results, and discards timed-out clients. No probe changes session settings.
Transactions commit on success, roll back on error, release connections, and
discard clients if rollback fails. Use least-privilege runtime DML credentials
and separate schema-changing migration credentials. User/server provisioning is
outside this change.

```text
npm run db:generate
npm run db:migrate
```

Generation reads the empty `packages/database/src/schema.ts`. Review generated
SQL/metadata before future commits. With no schema changes/migrations, commands
report no work; migration execution does not connect or create tables, but still
validates explicit `MIGRATION_DATABASE_URL` and TLS settings. Once migrations
exist, Drizzle applies versioned history. Run once as an operator action, outside
API startup/replication. No schema sync, automatic migration/reset/rollback exists.

## Owner-approved database test exception

On **2026-10-23** the owner waived a dedicated TLS test database as a completion
gate. None is available. Unit tests use injected driver doubles. Production
`test:smoke` children use valid verified-TLS configuration with a test-owned
unavailable TCP endpoint, asserting live 200 and ready 503. Healthy readiness is
injected only in unit tests; production has no fake healthy-database mode.

The optional command remains strict:

```text
npm run test:integration
```

An operator must supply an independently provisioned dedicated PostgreSQL database,
`NODE_ENV=test`, `TEST_DATABASE_URL` using the certificate hostname,
`TEST_DATABASE_TLS_MODE=verify-full`, and `TEST_DATABASE_CA_FILE` if default trust
roots are insufficient. Synthetic URL shape:
`postgresql://test_user:placeholder@db.test.example:5432/commerce_test`.
Credentials need CONNECT, CREATE SCHEMA and rights to create/use/drop their own
fixture tables/metadata, without superuser or service-control permissions.
Supply applicable development/migration URLs as well: preflight rejects matching
parsed host/port/database despite different credentials, encoding or default port
formatting. It cannot establish safety across undisclosed DNS aliases or omitted
non-test URLs; selecting a genuinely distinct database is the operator's duty.

Guarding precedes clients/writes. The suite checks connectivity, then creates one
random `foundation_<uuid>` schema for rollback/migration replay. Cleanup drops
only that schema, never an arbitrary database. Interrupted processes can leave
named fixtures for manual review. Never stop shared services, change global
settings, disable TLS or terminate unrelated sessions. Missing configuration
returns nonzero, not a skipped/passing suite.

**Unverified:** PostgreSQL connectivity/permissions/version, trusted/untrusted
CA and hostname handshakes, live pool exhaustion/idle recovery, server statement
cancellation, transaction rollback, migration replay and fixture cleanup. The
live suite provides connectivity/rollback/replay coverage; live TLS-negative and
fault-injection extensions remain follow-up work. Driver doubles establish
contracts, not live PostgreSQL correctness. Revisit before commercial use.

## HTTP and shutdown

Only `GET /health/live` and `GET /health/ready` are application endpoints.
Success is `{ "status": "ok" }`; unavailable readiness is HTTP 503 and
`{ "status": "unavailable" }`. Both are no-store. Liveness ignores PostgreSQL.
Readiness has a two-second total budget including acquisition and at most one
active check per process, with fresh checks after completion. Tests permit 500 ms
scheduling tolerance, not a longer operational deadline.

Middleware creates server-owned UUID IDs before parsing and returns X-Request-Id.
JSON completion logs contain event, ID, method, static operational path (otherwise
`[unmatched]`), status and durationMs. Startup/dependency/shutdown events have safe
fixed fields. Caller IDs, authorization/cookies, query values, bodies, URLs and
raw exceptions are excluded. Unknown routes and malformed/oversized/unsupported
bodies return correlated safe 404/400/413/415; unexpected exceptions return a
generic 500. Do not add arbitrary request or error objects to logs.

Bodies accept only application/json (optional charset); compressed bodies are
unsupported. Limits cover declared and chunked input. Node bounds headers and
header/whole-request receive times, polling expiry at up to 100 ms intervals.
Low-level HTTP errors may return 400/408/431 or close the socket before app
correlation exists. Application responses include nosniff; web disallows framing
and sets referrer policy. CORS grants only exact configured origins; it is not
authorization. Trust proxy is disabled and API binds loopback. Public TLS/proxy
trust and abuse controls need later deployment decisions.

Shutdown marks unready, closes ingress, drains work, then closes resources once.
Repeated calls share a promise. The hard deadline destroys outstanding sockets;
main exits nonzero on failed drain. SIGINT/SIGTERM are registered; Windows also
registers SIGBREAK. Portable close and test-child deadline exits are exercised.
Actual Windows terminal Ctrl+C exercised the SIGINT handler and emitted successful
shutdown completion (code 0); the interrupted PowerShell host returned 1. Windows
child.kill force-terminates rather than delivering POSIX signals. SIGTERM/SIGBREAK
delivery and native Linux behavior remain unverified. Git Bash checks on Windows
do not establish Linux compatibility.

## Capacity and deferred work

Review this budget before adding API replicas or future workers:

```text
API replicas * API pool maximum
+ future worker replicas * worker pool maximum
+ migration/admin/monitoring headroom
<= database connection limit
```

Transient pools/probes/context are process-local, without authoritative business
state or sticky routing. Two-process restart smoke proves an operational
prerequisite only, **no million-user capacity result**. Registered accounts,
active users, concurrent sessions, request throughput and database size differ.
Before capacity claims define endpoint mix, arrival rates, data size/skew, query
plans/indexes, job rates, p50/p95/p99 latency, acceptable errors, CPU/memory and
connection budgets, infrastructure, and recovery objectives. Test representative
workloads and outages after business features exist.

Authentication/authorization, catalog, inventory, search, cart, checkout/payments,
seller/admin panels, messaging, auctions, pg-boss workers, queues, Redis, object
storage, PWA/offline, other translations and hosting remain deferred. Commercial
operation also requires object-level access checks, rate limits, idempotency,
indexed pagination, backups/restore validation, monitoring and workload tests.

## Validation record

Host: Windows, Node 24.20.0, npm 12.2.0. Unit checks, production builds, Chromium
desktop/mobile tests and production process smoke execute without PostgreSQL.
Missing-target integration rejection is checked, **not** a passed live suite.
Browser tests inspect delivered JS, HTML and RSC with private sentinels supplied
to both web build and runtime. Temporary failing assertion/import probes verify
nonzero exits and are removed.

Final clean-install verification on 2026-10-23 (Windows NT 10.0.28000.0):

| Command / check | Result |
| --- | --- |
| `npm ci --no-fund` | Passed; lockfile unchanged (SHA-256 B344A7FBCEC038CD7C0F627A5F45652D7B5679C06F4E67F6E872DA9DAB380E45) |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed from no prior build output |
| `npm test` | Passed: 7 suites, 61 tests |
| `npm run build` | Passed: database, API, web |
| `npm run test:e2e` | Passed: Chromium desktop/mobile, headers, secret scans |
| `npm run test:smoke` | Passed: 3 process tests |
| `npm run test:integration` with `NODE_ENV=test` | Expected exit 1: missing TEST_DATABASE_URL; live execution deferred |
| `npm run db:generate` | Passed: zero tables, no schema changes |
| `npm run db:migrate` with explicit synthetic migration configuration | Passed: no pending migrations; no connection |
| `npm run db:migrate` without migration target | Expected exit 1; no fallback |
| `npm audit` | Passed: zero vulnerabilities |
| `npm ls --workspaces --depth=0` | Passed: three workspaces |
| `openspec validate initialize-store-foundation --strict` (before archive) | Passed |
| Windows terminal Ctrl+C | API shutdown completed with code 0 |

The browser root command was deliberately made to fail under Node 24/npm 12,
returned exit 1 from the intended assertion, then passed after removing that
temporary assertion. Earlier unit/import failure probes also propagated nonzero
exits. Native Linux and remaining signal checks retain the limitations above.

The final Git Bash type-check attempt did not execute: automatic approval review
timed out, and the one normal-sandbox retry returned `Bash/E_ACCESSDENIED`.
PowerShell validation passed. An earlier workspace checkpoint ran type checking
in Git Bash, but the final full command is not represented as verified there.

npm can report blocked dependency install scripts; no blanket script approval
is needed by the verified commands. A scoped esbuild override under
`@esbuild-kit/core-utils` addresses its transitive development-server advisory;
verify migration generation after dependency changes. Browser/migration tooling
is development-only. No CI/CD or deploy changes are included.
