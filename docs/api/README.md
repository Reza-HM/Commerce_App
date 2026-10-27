# HTTP API reference

The NestJS API currently implements health probes, email/password account
registration and revocable sessions. The Next.js web application provides a
foundation page and an [account browser flow](../account-web-flow.md).
PostgreSQL/Drizzle is an internal persistence
service, with no independently exposed HTTP API.

## Read or generate the reference

[`openapi.json`](openapi.json) is the version-controlled OpenAPI 3.1.2 HTTP
contract. It can be imported into OpenAPI-compatible viewers and clients.
JSON avoids a separate YAML parser in the contract tests. The 3.1 document uses
features supported by the pinned validator/viewer; it does not need 3.2 features.

The approach is documentation as code: review OpenAPI with implementation and
validate it in PRs. [OpenAPI](https://spec.openapis.org/oas/v3.1.2.html) is the
interchange format; [Redocly CLI](https://redocly.com/docs/cli/commands/build-docs)
validates it and builds the local reader. For an interactive request explorer,
[Scalar](https://scalar.com/products/api-references/configuration) can consume
the same file. Nest's [OpenAPI integration](https://docs.nestjs.com/openapi/introduction)
is a possible later source-generation path; our current custom normalization and
validation policies still need explicit descriptions and contract tests.

After the usual `npm ci`, these commands need no running API, database, private
environment file, external documentation account, or hosted documentation service:

```text
npm run docs:api:lint
npm run docs:api:build
```

Open `.local/api-reference.html` in a browser after building. Redocly validates
the contract and builds the HTML using its locally installed bundle, with
telemetry disabled. The generated file is ignored; regenerate it after changing
the contract. The viewer is a reading reference; use the examples below or import
the contract into an API client to send requests. Building or reading the docs
does not register an account. No `/docs` or `/openapi.json` application route is
added by this documentation change.

The reference describes local API base URL `http://127.0.0.1:3001`, overridden
by `API_PORT`. Follow [foundation setup](../foundation.md) before starting the API
with `npm run dev:api`. That root command supplies the canonical web origin
`http://127.0.0.1:3000` only when `WEB_ORIGINS` is absent in development;
`npm run dev:web` advertises the matching loopback host. Explicit process origin
settings are preserved, and direct/production API startup grants no origins by
default. Root `.env` loading remains database-only. See the browser-flow guide
for custom origins and restart instructions. Account tables must be installed
through the explicit
`npm run db:migrate` command; API startup does not migrate or repair schema.

## Current endpoints

| Method | Path | Authentication | Normal result | Side effect |
| --- | --- | --- | --- | --- |
| GET | `/health/live` | None | 200 `{"status":"ok"}` | None; no dependency check |
| GET | `/health/ready` | None | 200 `{"status":"ok"}` or 503 `{"status":"unavailable"}` | Bounded database probe |
| POST | `/accounts/register` | None | 202 `{"status":"accepted","message":"Registration request processed."}` | Atomically creates an unverified account/credential if absent |
| POST | `/accounts/sessions` | Email and password | 201 | Creates a session cookie |
| GET | `/accounts/sessions/current` | Session cookie | 200 or 401 | Inspects and renews a session |
| DELETE | `/accounts/sessions/current` | Optional session cookie | 204 | Revokes the presented session |

Canonical paths are shown. Express also accepts case/trailing-slash aliases and
implicitly handles HEAD for GET routes. Global OPTIONS requests without a body
return 204. With an exactly allowed `Origin`, CORS permits GET, POST, OPTIONS and
the `Content-Type` request header. An unapproved origin receives no CORS grant;
this does not authenticate clients or prevent non-browser requests. Session routes
add credentialed CORS, DELETE and the `X-Commerce-Request` header for allowed origins.

## Shared HTTP behavior

- The API listens on loopback and supports cookie-backed account sessions.
- Application responses include a server-generated UUID `X-Request-Id` and
  `X-Content-Type-Options: nosniff`. Probes, registration and application errors
  use `Cache-Control: no-store`. A caller-supplied ID is not trusted or echoed.
- Bodies support only `application/json`, including an optional charset parameter.
  The default JSON body limit is 1 MiB (`API_BODY_LIMIT_BYTES`); compressed bodies
  are unsupported. Malformed JSON returns 400, too-large JSON 413, unsupported
  media/encoding 415. These parser failures precede route handling/admission.
- Headers default to 16 KiB, with five seconds to receive headers and ten seconds
  to receive the request. Lower-level 408/431 responses or connection termination
  may occur without application JSON, correlation, or security headers.
- Unmatched routes/methods return generic 404 `http_404`; an unexpected application
  failure returns 500 `internal_error`. Submitted values and raw exceptions are
  excluded. During shutdown new application work can return generic 503 with
  `Retry-After: 1`; probes have their own lifecycle behavior.

Generic error example (the request ID also appears in the response header):

```json
{
  "error": "http_413",
  "message": "Request rejected",
  "requestId": "3e9dc602-763b-4cb1-8ea2-77c7d66cd439"
}
```

## Health service

Liveness says the HTTP process can serve requests, independently of PostgreSQL.
Readiness says a fresh bounded database check succeeded and shutdown has not
started. Concurrent readiness calls share one active check; its deadline includes
pool acquisition and is at most two seconds. Readiness is not proof that account
tables/migrations exist or that registration will succeed. A recognized outage
normally yields the status-only 503 body; an unexpected thrown failure can yield
the generic 500 error envelope instead.

```text
curl http://127.0.0.1:3001/health/live
curl -i http://127.0.0.1:3001/health/ready
```

## Account registration service

Send exactly string `email` and `password` properties. Unknown properties,
including role/verification/business-approval fields, are rejected.

```json
{
  "email": "reader+docs@example.com",
  "password": "Synthetic docs passphrase 628!"
}
```

For a portable shell example, save that synthetic object in an ignored local
`.local/registration-example.json` file, then run:

```text
curl -i http://127.0.0.1:3001/accounts/register --header "Content-Type: application/json" --data-binary @.local/registration-example.json
```

This request can create a real account in the API's configured database. Use
synthetic data and the intended development environment. It is an example, not
an automated test fixture or permission to clean up records by email.

Email is ASCII, raw-limited to 1024 UTF-8 bytes, outer space/tab-trimmed and
entirely lowercased. Canonical length is at most 254 bytes, the dot-atom local
part at most 64, and the domain has at least two valid DNS labels (1–63 ASCII
alphanumeric/hyphen characters, alphanumeric ends). Quoted local parts, Unicode,
controls, internal whitespace, literals and trailing domain dots are rejected.
Dots and plus suffixes remain significant; no DNS/delivery check occurs.

Passwords must be well-formed Unicode, at most 1024 raw UTF-8 bytes, then 15–128
Unicode code points after NFC normalization. Spaces/case are significant; there
is no trimming or composition rule. Whole normalized/lowercased matches against
the local common-password corpus, the submitted email/local part, and the service
derivatives `commerceapp12345`, `commerce_app12345`, `commerce-app12345` are
rejected. Only screening folds case; hashing preserves normalized case. These
rules cannot be fully expressed by ordinary raw JSON Schema length/email formats;
the server applies the policy documented here and in the OpenAPI descriptions.

New and existing canonical addresses receive the same exact 202 body. Acceptance
confirms processing, not creation or email delivery; it provides no ID, existence
flag, Location, cookie or token. Existing credentials never change. A retry after
disconnect can find an account already committed; account creation is not canceled
by the client leaving. Equal hashing work does not promise constant SQL/network time.

| Status | Meaning / body |
| --- | --- |
| 202 | Same accepted body for new and duplicate addresses |
| 400 | Field/policy error `invalid_registration`, or generic parser `http_400` |
| 413 / 415 | Generic body-limit / media-or-encoding error |
| 429 | Generic `http_429`; positive integer `Retry-After` seconds |
| 503 | Generic `http_503`; `Retry-After: 1` for saturation, shutdown, recognized database outage/timeout or missing account schema |
| 500 | Generic `internal_error`; no raw failure details |

Validation error example:

```json
{
  "error": "invalid_registration",
  "message": "Invalid registration request",
  "field": "password",
  "code": "password_length",
  "requestId": "3e9dc602-763b-4cb1-8ea2-77c7d66cd439"
}
```

`field` is body/email/password. `code` is required, invalid_type, invalid_body,
unexpected_field, invalid_email, password_encoding, password_too_large,
password_length or password_blocklisted. Unknown fields are checked first, then
email and password. When peer admission is exhausted 429 takes precedence over
field validation. Five parsed attempts per direct peer per 60-second fixed window
are allowed per process, with at most 1024 live peer buckets. Forwarded identity
headers are ignored. Invalid fields consume budget; parser failures do not.
Only two hashing/persistence operations run concurrently, without a waiting queue;
slots are retained until work settles, even after disconnect. Restart resets peer
budgets and replicas multiply them; these limits are not shared production protection.

Email verification/delivery and password recovery remain separate future changes,
not available endpoints. Browser registration uses this same API without
credentials, preserves generic 202 acknowledgment and requires a separate sign-in.
Registration does
not grant admin/business approval. See [account registration](../account-registration.md)
for hashing, migrations, database safeguards, lifecycle and validation evidence.

## Account sessions

`POST /accounts/sessions` accepts an email and password and returns
`{"status":"signed_in"}` with a host-only Secure, HttpOnly, SameSite=Strict
cookie. Unverified accounts can sign in during this local milestone. Sessions
expire after 30 minutes without authenticated activity or 12 hours after issue,
whichever comes first. `GET /accounts/sessions/current` returns the account ID
and renews activity; `DELETE /accounts/sessions/current` revokes the presented
session and clears the cookie. Other sessions remain valid.

All three requests require `X-Commerce-Request: 1`. A present Origin must match
an exact configured `WEB_ORIGINS` entry. Credentialed browser requests require a
trusted origin and same-site cookie context. Secure cookie behavior on local HTTP
depends on the browser and host; do not disable Secure for development. The browser
test uses Chromium with the web origin `http://127.0.0.1:4173` and the API on
`http://127.0.0.1` at a separate port, with that web origin in `WEB_ORIGINS`.
Unknown accounts and incorrect passwords return the same generic 401. Sign-in admits five
parsed attempts per direct peer per minute and shares two in-flight password work
slots with registration. Expired and revoked rows are not automatically deleted.
Verification and recovery are separate prerequisites for public launch; the future
verification change must block unverified sign-in and address existing sessions.

The browser flow calls these existing routes directly with credentials and the
custom header. It never reads the HttpOnly cookie or exposes the account ID in
its minimal account page. Inspection is user/lifecycle-triggered rather than
periodic polling. A session 401 prompts sign-in; network/403/server failures offer
retry without claiming confirmed sign-out. Failed DELETE responses retain an
unconfirmed-revocation warning and a direct retry action. No HTTP contract or
OpenAPI operation is added by these pages.

## Keeping documentation current

Update this guide, the OpenAPI operations/schemas/examples, and contract tests in
the same PR as an API change. `npm test` validates OpenAPI, checks declared Nest
route coverage, and compares representative real HTTP responses to the contract,
using an injected repository with no database access. PR CI runs those checks in
the existing required `quality` job; live PostgreSQL remains a separate mandatory
`database` job. Schema/route tests cannot prove every behavior or replace live
tests. Always run the documented lint and HTML build before delivery.
