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

Database commands and API development load database settings from the ignored
root `.env`; other commands use explicit process configuration as detailed below.
Never commit secrets, environment files, dependency folders, generated output,
or test reports.
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
values, credentials, URLs, or private file paths. Web exports no server values.

| Setting | Default / rule |
| --- | --- |
| `NODE_ENV` | development, test, production; database commands/API development default to development; integration sets test |
| `DATABASE_URL` | Local development/API connection and normal explicit migrations |
| `TEST_DATABASE_URL` | Sole execution target for live integration, API test mode, and test-mode migrations |
| `DATABASE_POOL_MAX` / `TEST_DATABASE_POOL_MAX` | 5 per process |
| `DATABASE_ACQUIRE_TIMEOUT_MS` / test equivalent | 1000; effective maximum 1000 ms protects readiness |
| `DATABASE_STATEMENT_TIMEOUT_MS` / test equivalent | 5000, client query and server statement deadline |
| `API_PORT` | 3001; 1–65535 |
| `WEB_ORIGINS` | Empty; otherwise exact HTTP(S) origins |
| `API_BODY_LIMIT_BYTES` | 1048576 (1 MiB) |
| `API_HEADER_LIMIT_BYTES` | 16384 (16 KiB) |
| `API_HEADER_TIMEOUT_MS` | 5000; no greater than request timeout |
| `API_REQUEST_TIMEOUT_MS` | 10000 |
| `API_SHUTDOWN_TIMEOUT_MS` | 10000 |

On 2026-10-25 the owner explicitly removed database TLS requirements and supplied
`commerce_db` and `commerce_test` on localhost:5432 in the ignored root `.env`.
The current database workflow is **local plaintext only**, in every runtime mode.
Loopback hostnames/addresses are allowed; omitted `sslmode` or exactly
`sslmode=disable` are accepted. Other URL options, duplicate options, fragments,
and remote hosts are rejected. No CA or TLS-mode settings are needed; obsolete
explicit settings fail validation rather than suggesting encryption is enabled.
Global HTTPS verification is never disabled. Remote commercial hosting and its
transport policy need a later design decision.

Root `test:integration`, `db:migrate`, and `dev:api` commands load only recognized
database settings from `.env`, using Node's built-in parser. Existing process
values win, including empty settings that must fail validation. Integration sets
`NODE_ENV=test`; a test-mode API/migration must use guarded `TEST_DATABASE_URL`.
Unit, build, type-check, browser, and process-smoke commands do not load this file.
Normal API production startup still uses explicit process configuration. Never
commit `.env`, paste credentials into commands, or include secret values in logs.

## Database lifecycle and migrations

Nest owns one lazy bounded pool per process, never one per request. Background
errors emit safe classifications; failed idle clients are removed. Readiness
coalesces requests, does not cache completed results, and discards timed-out
clients. Transactions commit on success, roll back on error, release connections,
and discard clients on failed rollback. Provisioning and role/grant changes are
outside this change. Use only necessary fixture/migration permissions; restricted
runtime and migration credentials remain a future operational responsibility.

```text
npm run db:generate
npm run db:migrate
npm run test:integration
```

Generation reads the currently empty `packages/database/src/schema.ts`. Review
SQL/metadata before future commits. Normal migrations use `DATABASE_URL`;
`NODE_ENV=test` migrations use guarded `TEST_DATABASE_URL`, never development.
No third URL is required. An optional legacy migration URL is a target-comparison
input only, never an execution fallback. Startup never creates/synchronizes
schemas. Empty application history validates configuration, then reports no work
without connecting or creating migration metadata. History length is not a count
of pending entries. There are no automatic down-migrations or database resets.

The shared `scripts/migration-history.cjs` is used by normal migrations and live
tests. Integration applies the unchanged repository history twice. Empty history
must execute no application/journal DDL. Non-empty history must preserve complete
journal identities/hashes and catalog definitions on replay, with no repeated
application statements. Applied application tables/history remain in the test
database; fixture teardown never owns them. The first account migration needs
fresh-install and non-empty replay assertions in its own change. Current empty
history does not prove account persistence.

## Persistence test isolation and historical waiver

The 2026-10-23 waiver applied only to archived foundation completion. The owner's
2026-10-25 local transport revision supersedes its former TLS setup prerequisites;
it does not waive actual database verification for this or later account changes.
Archived foundation files remain unchanged historical evidence.

The root live integration command connects only to `TEST_DATABASE_URL`. Before
constructing any client, it requires test mode, validates the URL/options, and
rejects identities matching configured development or legacy migration targets.
Comparison normalizes host case/trailing dots, common loopback aliases, decoded
database names, and default ports; credentials do not make the same database safe.
It cannot prove isolation across undisclosed aliases or omitted non-test URLs.
Missing configuration fails nonzero, never skips, invents credentials, or falls
back. Run one migration/suite owner at a time per test database; use separate
databases for parallel jobs.

The supplied role must be able to connect, create/use schemas, apply reviewed
application migrations, and create/read/write/drop precisely owned fixtures and
metadata. The suite never changes roles/grants, invokes database-drop or
service-control operations, or terminates unrelated sessions. No production/shared
database is an acceptable target. No test connects to `commerce_db`.

Live coverage has separate phases:

1. Real application history replay, explicitly distinguishing the empty no-op.
2. Coordinator-owned sentinel rows and schema definitions, outside each worker's
   ownership set. Successful and deliberately failing workers commit fixtures,
   clean their own resources, and are independently checked for fixture absence
   and exact sentinel preservation. Only then is the coordinator sentinel removed.
3. Technical committed/rolled-back transactions and migration replay. A failing
   migration executes valid insert/DDL statements before invalid SQL; both effects
   and its journal entry must roll back while prior state survives. A controlled
   child must exit nonzero for the expected SQL failure, followed by fresh reads.

Cleanup uses generated identifiers and explicit object/record manifests, exact
parameter-bound keys, dependency order, and restrictive schema drops. Unknown
contents or outside dependencies fail safely. Never truncate/reset a database,
sweep schemas by prefix, delete application history, or broaden into unowned
cascades. Test SQL lives in registered temporary directories, cleaned by exact
file removal and restrictive directory removal, never recursive deletion. A
cleanup failure remains a failure even after an expected worker error. Failed
preservation leaves the coordinator sentinel for explicit operator review.

Record intent is registered before insertion and confirmed only after successful
creation. Failed, conflicting, or uncertain inserts do not authorize deletion of
an existing record; unconfirmed cleanup fails for explicit review.

Forced termination can leave named fixtures for manual inspection. Never remove
unknown objects or stop shared PostgreSQL services to simulate failure. Coordinator
and migration-failure child each own one bounded pool (default maximum five);
reserve at most ten suite connections plus ordinary operational headroom. The
normal cleanup path releases/closes owned connections and removes technical
fixtures only. Pool fault recovery, exhaustion, and statement-cancellation checks
remain unverified unless separately run; no scale/commercial-readiness claim follows.

### Current validation record (2026-10-25)

Windows, Node 24.20.0, npm 12.2.0, PostgreSQL 18.6. The initial complete local live
run passed on `commerce_test`: application history zero (empty no-op), technical
commit/rollback/replay and failed-migration rollback, expected child exit 1, and
both successful/failing worker sentinel checks. Credentials and `.env` were not
printed, changed, or committed. This supersedes the earlier 4/18 partial checkpoint.

Final validation on this checkpoint:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 12 suites, 102 tests |
| `npm run build` | Passed: database, API, web |
| `npm run test:e2e` | Passed: desktop/mobile production page, headers and secret scans |
| `npm run test:smoke` | Passed: 3 API process checks |
| `npm run test:integration` | Passed against commerce_test with the live outcomes above |
| `openspec validate enable-account-persistence-validation --strict` | Passed |
| `openspec validate --specs --strict` | Passed: 3 current main specs |

All revised persistence-validation tasks are complete. Non-empty account migration
coverage belongs to the first migration-bearing feature; remaining pool-fault,
native Linux, and commercial workload checks are not claimed. No authentication
or other business functionality was introduced.

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
