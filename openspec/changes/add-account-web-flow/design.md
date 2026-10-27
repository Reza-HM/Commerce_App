# Design

## Context

See `proposal.md` for motivation and `specs/` for observable requirements.
`apps/web` currently contains one server-rendered foundation route, an English
next-intl resource, Tailwind theme tokens, and response security headers.
There is no browser API client or account state provider. The API already owns
registration, session cookies, authorization, admission, and expiration.

`tests/e2e/session.spec.ts` proves credentialed browser fetch with a Secure
loopback cookie using an injected session repository and the real API runtime.
`tests/e2e/foundation.spec.ts` checks independent rendering, mobile layout,
security headers, and secret isolation. The root browser command builds API/web
before Playwright; its environment must therefore select public configuration
before the web build, not only when starting the web server.

## Goals / Non-Goals

**Goals:** Reuse the existing HTTP boundary without introducing another session
authority; distinguish unknown outcomes from success; keep public rendering
independent; make the full browser journey reproducible without PostgreSQL.

**Non-Goals:** SSR account personalization, an authentication proxy, a global
persisted auth store, changes to API contracts or cookie attributes, and public
deployment architecture. Product exclusions are listed in the proposal.

## Decisions

### Route shells with small client interaction components

Add App Router pages at `/register`, `/sign-in`, and `/account`. Keep translated
route metadata, page structure, and public navigation in server-rendered shells.
Pass only the required localized messages to client forms/session components,
or use a scoped next-intl client provider. Do not fetch session state during
server rendering or serialize account data into shared HTML/RSC output.

The home page gains localized registration/sign-in links and retains its current
foundation content and independent rendering. Reuse the canvas/ink/muted/outline
theme and Tailwind utilities. All new message strings, including error mapping,
password visibility labels, progress text and page titles, belong in `en.json`.

The alternative of a server-rendered account guard would need to forward cookies
from a separately configured API host and add request-origin behavior. Here the
account shell contains no private data; browser inspection gates its signed-in
presentation. Future protected operations must independently authorize on the API.

### One public API origin, fixed endpoint paths

Introduce `NEXT_PUBLIC_API_ORIGIN`, defaulting only when absent to
`http://127.0.0.1:3001`. Treat it as public build-time configuration. Validate a
single HTTP(S) origin with no credentials, non-root path, query, or fragment;
reject malformed explicit values without silently using the default. Invalid
configuration disables account requests with a localized message and leaves
public shells renderable. Never read private `.env` values into web code.

Put a small browser request module under `apps/web/src/accounts/`. It selects
fixed paths and methods; callers cannot supply arbitrary destinations. Use JSON
bodies only for registration/sign-in. Registration uses `credentials: 'omit'`
and Content-Type only. Session calls use `credentials: 'include'` and
`X-Commerce-Request: 1`; inspection also sets `cache: 'no-store'`. Only session
routes currently grant credentialed CORS, so a blanket credentialed fetch wrapper
would break registration. The browser owns Origin and the cookie jar.

Use a 15-second abort deadline for each action, clear deadline resources, and
abort/ignore superseded requests on route exit. An abort bounds browser waiting;
it does not prove the API stopped processing or rolled back. Accept only the
expected status and documented response shape (202 accepted, 201 signed_in,
200 signed_in/accountId, or bodyless DELETE 204). Malformed/unexpected responses
become safe failures, never raw displayed server text. No automatic retries.

The API origin is public, not a credential. For local use document
`http://127.0.0.1:3000` and `http://127.0.0.1:3001`, with that exact web origin
in `WEB_ORIGINS`. The public setting must be supplied before a production web
build. Do not mix `localhost` with `127.0.0.1`, add an insecure-cookie switch,
or change API-origin/CORS behavior to accommodate a broken setup. A proxy or
server action would add another HTTP/authentication contract without helping
this browser-only milestone, so neither is introduced.

### Forms retain server-authoritative policy

Use semantic forms with persistent labels, input IDs, autocomplete=email and
new-password/current-password as appropriate. Use an email input mode without
native email validation that silently changes or rejects the API's supported
identity forms. Disable autocapitalization/spellcheck for email. Limit local
validation to required values and usable error feedback; the API remains the
authority for email syntax, raw byte bounds, NFC length, and blocklisting.

Do not impose HTML minlength/maxlength counts on Unicode passwords or duplicate
the API's server-side corpus assets in the browser. Explain registration's 15-128
normalized code points and weak-password screening in plain English. Passwords
are masked initially; a type=button toggle has a descriptive accessible name,
state, and visible focus. Paste and password managers remain usable. Avoid a
second confirmation field, strength scoring, and unsupported recovery links.

Keep an immediate submission lock as well as a disabled pending submit button.
Map known registration field/code pairs to localized errors associated with their
inputs; generic sign-in 400 and unknown errors use a form-level message. Unknown
account and wrong password share one 401 message. Announce errors/status and
move focus to the relevant error/input when needed. A 429 asks the visitor to
wait. Cross-origin JavaScript cannot currently read Retry-After because it is
not CORS-exposed: use safe general wait wording, without invented countdowns or
an API-header change. Server errors/network failures offer manual retry.

Clear web-owned password values after every settled submission, on route exit,
and on restored form pages; an unmounted/stale response cannot repopulate them.
Keep no credentials in navigation state, query strings, storage or logging.
This does not claim reliable zeroization of JavaScript strings or control over
the user's password manager. Registration 202 shows exactly the same generic
processing acknowledgment for new and existing accounts, followed by a sign-in
link with no credential transfer. There is no implicit session creation.

### Account state is transient and session checks are activity

Use explicit states: checking, signed-in, unavailable, signing-out, and
sign-out-unconfirmed. Account entry always starts checking. A valid inspection
200 enables only a signed-in message and sign-out; the UUID is validated as
contract data but not displayed or persisted. Inspection 401 replaces the route
with fixed `/sign-in` navigation and a whitelisted non-sensitive reason such as
`reason=session-required`. Do not introduce return URLs or arbitrary redirects.

Other failures show unavailable plus retry. No global authenticated state is
inferred from cookie existence, a prior sign-in 201, or a cached page. Inspection
runs on entry, explicit retry, becoming visible after being hidden, and browser
history restoration. Coalesce overlapping triggers. Ordinary rerenders, hover,
route prefetch, and timers do not inspect. An unattended page can remain visually
stale until the next check, but cannot extend the server's idle deadline.

Starting sign-out invalidates in-flight inspections using a request generation
and cancellation guard. DELETE 204 clears presentation and replaces the route
with `/sign-in?reason=signed-out`. On network/timeout/503 or an unexpected response,
enter sign-out-unconfirmed: hide signed-in content, explain that revocation was
not confirmed, and expose retry DELETE directly. Do not let automatic inspection
overwrite that warning; the API may already have cleared the browser cookie
while server revocation failed. Losing the response is not evidence of success.

### Browser evidence reuses the real runtime boundary

Add focused tests for public-origin parsing, safe response/error mapping,
finite deadlines, and stale-result suppression using the existing Jest setup.
Use Playwright for React interaction, accessibility semantics, focus, mobile
layout, history restoration and actual form behavior; add no testing dependency.

Extend the existing injected-runtime approach with test-owned in-memory account
and session repositories. For the happy path use real registration validation,
hashing and session HTTP/cookies so registration creates the credential later
used by sign-in. Duplicate registration must not replace it. Use controlled
responses or repository failures for UI error cases and controlled revocation
for expiry/absence presentation. Such browser doubles do not prove PostgreSQL
expiration or persistence; the existing live suite continues to own that proof.

Reserve loopback port 4174 for the account-flow test API, with exact origin 4173.
Set `NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:4174` in the root `test:e2e` child
environment before building the web; adjust `scripts/workspace.mjs` and
Playwright configuration as needed. Refuse port collisions, never reuse an
unknown service. Keep fixtures serial, close the runtime in failure paths, and
leave the foundation test independent when no API is listening. Existing random
port direct-session tests can continue to use their own runtime. Test fixtures
may import API internals; production web code must not.

Cover 202 equivalence, original-password preservation, explicit login, real
201/200/204/401 cookie lifecycle, missing/expired/revoked session presentation,
cookie rejection, 400/401/403/429/503, malformed responses, timeouts, duplicate
clicks, delayed inspection versus sign-out, and uncertain sign-out retry. Check
that idle/hidden periods generate no keepalive requests, that foreground/history
return rechecks, and that sensitive markers stay out of URLs, logs, storage and
HTML/RSC/bundles. Disable credential-bearing test traces/screenshots or use only
synthetic fixtures in retained failure artifacts; never print cookie values.

## Risks / Trade-offs

- [Secure cookie and same-site dependence] -> Preserve attributes and test the
  supported Chromium/loopback setup; document host consistency and exact origins.
- [Client guard mistaken for authorization] -> Render no private account data;
  retain API authorization for all protected requests and no verified-user claim.
- [Network loss after a committed action] -> Show an unknown outcome, clear
  passwords, require explicit retry, and retain the uncertain-revocation warning.
- [Idle renewal through convenience checks] -> No periodic/prefetch calls;
  revalidate only at the explicit lifecycle triggers above.
- [Public build configuration] -> Document rebuild requirements and use only
  synthetic public origins in examples and tests; private environment loading
  and CI secrets handling remain unchanged.
- [Milestone mistaken for launch readiness] -> Document unverified sign-in and
  the separate verification, recovery, deployment, retention and abuse work.

## Migration Plan

No database migration or API-contract change is planned. During implementation,
update `docs/foundation.md`, registration/session guides and `docs/api/README.md`
to describe the browser flow, and add `docs/account-web-flow.md` for configuration,
state behavior and evidence. Keep OpenAPI unchanged unless implementation would
actually alter an HTTP contract; such an alteration requires revisiting scope.

Run root lint, typecheck, unit tests, build, browser tests, process smoke, API docs
lint/build, strict OpenSpec validation, and the existing guarded integration suite
before implementation delivery. No pipeline changes or new public documentation
routes are needed. Rollback removes the web build/navigation changes while
retaining the existing API, accounts, sessions, migrations and feature branches.
Proposal creation alone authorizes none of that implementation or delivery.
