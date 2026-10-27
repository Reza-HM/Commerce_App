# Account browser flow

The web account milestone provides `/register`, `/sign-in`, and `/account`,
with registration/sign-in links from `/`. Public pages render without an API
or database connection. `/account` initially checks the current session in the
browser; its shell contains no private account data. The API remains responsible
for authorization, credential verification, cookie security, and expiration.

## Local setup

Follow [foundation setup](foundation.md) and explicitly apply existing migrations
before using a development account. No migration is added by this browser flow.
Use `http://127.0.0.1:3000` for the web and `http://127.0.0.1:3001` for the API.
The paired development commands now use this setup by default: `npm run dev:web`
binds and advertises `127.0.0.1`; `npm run dev:api` supplies
`WEB_ORIGINS=http://127.0.0.1:3000` only in development when that process setting
is absent. An explicit value, including an empty deny-all value, is preserved.
Use the same hostname on both sides; do not mix `localhost` and `127.0.0.1`.
For a different web port/origin, set `WEB_ORIGINS` in the API process environment.
It is not loaded from the root database-only `.env`. Restart the API after
changing its origin settings; open the exact web URL shown above. Direct API
startup and production still require explicit allowed origins.

`NEXT_PUBLIC_API_ORIGIN` defaults to `http://127.0.0.1:3001` only when absent.
An explicit value must be an HTTP(S) origin without credentials, a non-root path,
query or fragment. Invalid values disable account requests with a safe message;
they do not stop public pages rendering or silently fall back. The origin is
public configuration, never a secret. Supply it before `npm run build` when
using a different API origin; rebuild to change a production browser bundle.
Web commands do not load the root private database `.env`. Use explicit process
configuration; do not copy database settings into web configuration.

Registration fetch omits credentials because its existing CORS grant is not
credentialed. Session fetches include browser credentials and
`X-Commerce-Request: 1`. The browser manages the host-only
`__Host-commerce_session` cookie; web code never reads or copies it. It remains
Secure, HttpOnly, SameSite=Strict and Path=/. Chromium loopback support is tested;
other browser/host combinations may differ. Do not weaken cookie attributes.

## Forms and outcomes

Both forms have persistent labels, English messages, keyboard focus, appropriate
autocomplete, paste support, a password visibility control and announced pending
and error states. Registration explains the 15-128 NFC code-point password rule
and weak-password rejection. The API owns normalization, syntax, byte limits and
screening. Forms do not trim passwords, truncate them with HTML length rules,
or apply registration-only password rules to sign-in.

Every registration 202 produces the same processing acknowledgment and a separate
sign-in link. It does not establish creation, email ownership or email delivery.
Duplicate registration does not reset a password. There is no automatic sign-in
or credential transfer to another route. Unknown-email and wrong-password sign-in
responses share the same message. After sign-in 201, the browser enters `/account`
and inspects the session before showing signed-in content. The internal account
ID and unavailable email/profile information are not displayed.

One submission per action is allowed while pending. Requests have a 15-second
deadline and no automatic retries. A timeout or disconnect does not prove the
server rolled back: a registration or sign-in may already have completed. Safe
field codes are translated, raw error text is never rendered, and 429 asks the
visitor to wait. The API does not expose Retry-After through CORS, so the UI does
not invent an exact cooldown. Password fields clear after settled requests and
when leaving/restoring forms; the application does not store credentials in URLs,
browser storage, logs or telemetry. This does not control password-manager storage
or promise zeroization of JavaScript strings.
JavaScript is required for these browser API interactions. Unenhanced forms use
POST, so native submission cannot serialize credentials into a GET URL; they do
not introduce a server-side authentication handler.

## Session presentation

Inspection runs on account entry, explicit retry, return from a hidden tab, and
browser history restoration. Overlapping checks coalesce. There is no periodic
polling, background keepalive or inspection from navigation prefetch. An idle
page can look stale until the next check; the server always enforces the existing
30-minute idle and 12-hour absolute deadlines. Inspection renews accepted activity.

Inspection 401 removes signed-in presentation and sends the visitor to sign-in
with a session-required message. Network/timeout/403/server/malformed-response
failures instead show that the session cannot be checked, with retry. They are
not presented as confirmed sign-out or incorrect credentials. Local status is
transient presentation, not authorization for future protected operations.

DELETE 204 confirms sign-out, including when no usable cookie exists. It clears
local presentation and navigates to sign-in. A failed or lost DELETE response
clears signed-in presentation but warns that server revocation is unconfirmed,
with an explicit retry DELETE action. Inspection is suppressed in that warning
state: the API may have cleared the cookie while revocation failed. A late
inspection cannot restore signed-in content after sign-out or navigation.

## Tests and remaining limits

The root `test:e2e` command sets the public API origin to
`http://127.0.0.1:4174` before building the web. Account browser tests bind a
test-owned real API runtime to port 4174 with in-memory account/session repositories,
real password hashing and Secure cookies, using web origin 4173. Port collisions
fail, fixtures close on success/failure, and no database or private `.env` is used.
The original independent foundation and direct-session checks remain in place.
This command leaves a web bundle configured for the test API. Rebuild with the
normal public API setting before using `npm run start:web` for development use.

Browser doubles establish browser integration, not PostgreSQL persistence or
expiration. Run the existing guarded `npm run test:integration` separately for
actual migration replay, rollback, exact owned cleanup and sentinel preservation.
Never substitute the development database or reset a target to manufacture proof.

This milestone still allows unverified sign-in. Email verification and password
recovery remain separate launch prerequisites. Profile editing, dashboards,
marketplace features, session administration, shared abuse protection, session-row
retention and secure public deployment are not established by this flow.

## Local database acceptance (2026-10-28)

Windows, Node 24.20.0, npm 12.2.0, PostgreSQL 18.6. The existing guarded serial
integration suite passed on the existing test target, with two application
migrations and `freshInstall=false`. Unchanged history replay, technical commit,
rollback and deliberately failed migration rollback (expected child exit 1),
account duplicate/race/credential preservation, real HTTP hashing, session
expiration/revocation/renewal races, and independent sentinels after successful
and failing workers all passed. Cleanup retained unrelated rows and migration
history and removed only exact owned fixtures. No development target was used.
The runner's machine-readable UTC date was 2026-10-27; the date above is the
owner's local session date. This is replay evidence, not a fresh-install claim.

## Local web acceptance (2026-10-28)

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 26 suites, 275 tests |
| `npm run build` | Passed: database, API, and all web routes |
| `npm run test:e2e` | Passed: 14 Chromium tests, including desktop/mobile account journeys |
| `npm run test:smoke` | Passed: five API process checks |
| `npm run docs:api:lint` / `npm run docs:api:build` | Passed; generated HTML remains ignored |
| Strict OpenSpec validation | Passed: six current specifications and this change |

Focused request/session tests cover deadlines, response decoding, safe mappings,
coalescing, navigation cancellation and late inspection versus sign-out. Browser
checks cover actual form/cookie flow, duplicate registration/credential preservation,
keyboard focus, layout, password cleanup, cookie rejection, outages/403/429,
uncertain revocation/retry, inactivity without keepalive, foreground/history return,
private-marker scans of account HTML/RSC/scripts, and native POST without JavaScript.
Empty desktop registration and mobile sign-in screenshots were visually reviewed;
their files remain ignored. All retained test data is synthetic. No runtime
dependency, API contract, database migration, pipeline or deployment change was
required. Actual GitHub CI is a separate current-head delivery gate.

## Local-origin follow-up (2026-10-28)

The development commands now align the advertised web host and default API
allowlist with the canonical loopback setup above. A regression test runs actual
registration/session preflights through the API runtime using the development
command's configuration and proves exact-origin grants, with no database access.
Explicit settings, empty deny-all, non-development startup and database-only
private environment loading remain unchanged. Validation passed: lint, typecheck,
277 unit tests across 27 suites, 14 Chromium tests with production builds, API
documentation lint/build and strict OpenSpec validation. The original running
checkout's generated development types were preserved during isolated validation.
