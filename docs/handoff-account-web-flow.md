# Commerce App handoff: account web flow finalized

Prepared on 2026-10-30. Continue at
`C:\Users\reza\Desktop\MyProjects\Commerce_App`.

## Start here

Read `AGENTS.md`, current `openspec/specs/`, relevant installed OpenSpec skills,
`docs/account-registration.md`, `docs/account-sessions.md`,
`docs/account-web-flow.md`, `docs/interface-preferences.md`, `docs/api/README.md`,
and `docs/github-delivery.md`. This handoff supersedes the starting registration
handoff for current status. Older archive/design records describe their milestones;
current specs, operating guides, and AGENTS.md govern new work.

Fetch and inspect Git state before starting. Preserve retained branches and
unrelated work. Finalization is delivered on `docs/finalize-account-web-flow`;
its actual reviewed PR/head/merge are recorded in the closing conversation message.
No next feature proposal or implementation is approved by this handoff.

## Completed delivery

- Registration: PR #5; API reference: PR #6; sessions: PR #7.
- Account browser flow: [PR #8](https://github.com/Reza-HM/Commerce_App/pull/8).
- Local origin follow-ups: [PR #9](https://github.com/Reza-HM/Commerce_App/pull/9)
  and [PR #10](https://github.com/Reza-HM/Commerce_App/pull/10).
- Redesigned home/register/sign-in/account pages:
  [PR #11](https://github.com/Reza-HM/Commerce_App/pull/11), merge
  `51705029bc9fd2b7fad0f369414767a700e6cf26`.
- Themes, restrained motion, and Prettier:
  [PR #12](https://github.com/Reza-HM/Commerce_App/pull/12), merge
  `e65a144bcace6890e5977bf0116e629219ba86aa`.
- Required quality and database CI passed for implementation deliveries.
  Finalization has its own current-head delivery gate; use its actual CI evidence.

Web flow has 16/16 tasks complete; the theme/motion/formatting follow-up has 6/6.
Both are synced into current specifications and archived:

- `openspec/changes/archive/2026-10-30-add-account-web-flow/`
- `openspec/changes/archive/2026-10-30-add-themes-motion-formatting/`

There are no active OpenSpec changes after finalization. Current specs include
`account-web-flow` and `interface-preferences`; development-workspace now covers
account entry points and reproducible formatting too.

## Current product and security behavior

Public web routes: `/`, `/register`, `/sign-in`, `/account`. Public shells render
without the API/database. Account entry inspects the session before presenting
signed-in content; it exposes no invented profile or internal account ID.

Current API (portable contract: `docs/api/openapi.json`):

- `GET /health/live`, `GET /health/ready`
- `POST /accounts/register`
- `POST /accounts/sessions`
- `GET /accounts/sessions/current`
- `DELETE /accounts/sessions/current`

Registration returns the same 202 acknowledgment for new/existing addresses,
does not create a session, and never resets an existing password. Sign-in is a
separate explicit action. Unknown-email and wrong-password failures are generic.
Passwords preserve entered spaces/Unicode; forms clear them after settled requests
and route exit, support password managers/paste, and store no credentials in URLs,
browser storage, application logs, or telemetry.

The API issues an opaque token only in the host-only `__Host-commerce_session`
cookie (Secure, HttpOnly, SameSite=Strict, Path=/); the database stores its digest.
All session endpoints require `X-Commerce-Request: 1`; a present Origin must exactly
match WEB_ORIGINS. Registration omits credentials; session fetches include them,
and inspection bypasses caching. Successful inspection renews activity; sessions
expire after 30 minutes idle or 12 hours absolute. Browser checks run on entry,
retry, foreground/history restore, without background keepalive or polling.
Sign-out 204 confirms removal of the current session presentation and clears the
cookie, even without a usable presented cookie; subsequent inspection should be 401. An uncertain DELETE result retains a revocation warning and DELETE retry,
without claiming successful server revocation or showing signed-in content.

## Local setup and generated files

Use `npm run dev:api` and `npm run dev:web`. Both localhost and 127.0.0.1 web
origins on port 3000 are allowed by the root API dev command only when WEB_ORIGINS
is absent in development. Explicit values, including empty deny-all, take precedence.
The root private .env loader is database-only; set origin overrides in the process.
When NEXT_PUBLIC_API_ORIGIN is absent, a localhost page uses localhost:3001; other
pages default to 127.0.0.1:3001. Keep web/API hostnames consistent for strict cookies.
Supply explicit public API settings before building; restart/rebuild after config
changes. Do not weaken cookie security for local testing.

`apps/web/next-env.d.ts` is generated and ignored, no longer tracked. Its prior
uncommitted change only pointed to development-generated route types. The owner's
local file was preserved; do not commit its dev/build path changes. Root typecheck
already runs next typegen first, while dev/build also recreate it. Keep its tsconfig
include. No user-authored implementation was discarded. Temporary backups,
review screenshots, and delivery checkouts under .local/ are ignored artifacts.

Migrations are explicit (`npm run db:migrate`); API startup never applies them.
Never print private .env contents, credentials, test passwords, cookies, tokens,
or connection secrets. Never run automated tests against or reset development data.

## Durable frontend and code conventions

The owner accepted the redesign for now and expects premium, professional,
distinctive UI/UX as the project grows. Maintain coherent typography, spacing,
responsive layouts, accessible feedback, cursor semantics, focus, touch targets,
and complete pending/error/success states. Use Tailwind and shared semantic tokens
in globals.css; API/server behavior remains authoritative.

Every current page supports Appearance: System, Light, Dark. Persist only the
commerce-theme preference; apply before paint, follow OS changes for System,
and tolerate blocked storage. Include new pages and feedback/native-control states
in both themes. Short entrance/state/action motion must respect reduced motion;
avoid decorative loops, layout shifts, parallax, and artificial waiting. A future
restrictive script CSP must authorize the pre-paint bootstrap with a hash/nonce.

Prettier 3.9.10 uses single quotes, semicolons, trailing commas, 90 columns, two
spaces, bracket spacing, parenthesized arrows, and LF endings. Use npm run format
and npm run format:check (also part of lint). Honor .prettierignore: preserve
migration SQL/metadata, policy assets, generated outputs, lockfile formatting,
archives, generated skills, and separately reviewed CI files. SQL hashes depend
on exact bytes; no SQL formatter plugin was introduced.

## Validation and delivery safeguards

Implementation evidence before finalization: 283 unit/contract tests, 23 main
Chromium tests plus two localhost regressions, five API process smoke tests,
format/debug-check, lint, types, production builds, API docs lint/build, and strict
OpenSpec checks passed. Both themes' desktop/mobile account journeys were exercised.
Hashed SQL/corpus bytes match Git; protected paths were unchanged. Required CI's
database job uses its own fresh PostgreSQL service for live persistence checks.
Finalization also passed lint, types, all 283 unit/contract tests, production builds,
and strict current-spec validation, including regeneration from an absent next-env.d.ts.

Project automatic delivery is approved for implementation: announce shared actions,
use npm run pr:open and npm run pr:merge, record full current head and actual PR,
and merge only after current quality/database checks, reviews, and protections pass.
Pipeline commits still need concrete approval. Retain branches; never force-push,
push protected branches, rewrite published history, delete branches, bypass hooks,
change Git configuration, or blindly retry uncertain shared-state mutations.

## Remaining work and next instruction

Wait for the owner's next direction. Verification and password recovery remain
separate future changes and are required before public launch. Unverified accounts
may currently sign in for the local milestone; verification must deny new sign-ins
until verified and explicitly address already-issued unverified sessions.
Session-row retention/cleanup, shared abuse protection, secure public deployment,
email delivery, and measured scale/capacity planning also remain deferred. UI text
must not imply marketplace workflows, verified ownership, offline support, or
production readiness that has not been implemented and validated.
