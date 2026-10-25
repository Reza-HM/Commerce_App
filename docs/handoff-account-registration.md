# Handoff: account registration

Prepared on 2026-10-25 after GitHub delivery implementation and its requested
OpenSpec finalization. Read this file before starting the next conversation's
application work; recheck GitHub and Git state rather than treating dated evidence
as current authorization.

## Next objective and approval boundary

Explore and propose `add-account-registration`, then obtain review/approval of
that concrete OpenSpec proposal before applying it. The account milestone and
direction are agreed; the registration proposal has not been created or approved.
Do not create all account proposals together. No account implementation belongs
to the completed automation change.

Follow the installed OpenSpec workflow: explore, propose, user review, apply,
verify, sync/archive. Read relevant `.agents/skills/*/SKILL.md` files. Keep one
focused feature branch and PR per change when possible; include its archive
before merging when the owner requests finalization at that stage.

## Repository and delivered baseline

- Workspace: `C:\Users\reza\Desktop\MyProjects\Commerce_App`
- Remote: `git@github.com:Reza-HM/Commerce_App.git`
- Default branch: `main`; use `feat/short-description` for application branches,
  not `codex/`. Never work directly on `main` or `master`.
- Persistence [PR #2](https://github.com/Reza-HM/Commerce_App/pull/2) was
  squash-merged as `e894969705067ad7fde34ef887a81832486a4ce3`.
- Automation [PR #3](https://github.com/Reza-HM/Commerce_App/pull/3) was
  squash-merged as `4d5e0a5d3dbf8637ac44e15faf066f0c89fc96d6`, after explicit
  authorization for head `14712a7f430acea16f05889a30d9b314af8226ef`.
- Finalization was prepared on `docs/finalize-github-delivery` from that main
  baseline. It syncs the current spec, archives the change, records real merge
  evidence, and adds this handoff. Inspect local/remote heads and its PR status:
  this file's presence alone does not prove that finalization is on remote main.
- Recheck the clean/dirty state and fetch remote refs before choosing a base.
  Start registration from up-to-date default-branch state containing the required
  predecessors. Preserve any unexpected user changes.
- No feature branch was deleted. Prior published heads include
  `feat/automate-github-pr-workflow` at `14712a7` and
  `feat/enable-account-persistence-validation` at `16d9ffe`.

Finalized archives:

1. `openspec/changes/archive/2026-10-23-initialize-store-foundation/`
2. `openspec/changes/archive/2026-10-25-enable-account-persistence-validation/`
3. `openspec/changes/archive/2026-10-25-automate-github-pr-workflow/`

After this finalization, there are no active OpenSpec changes. Current specs are
`database-foundation`, `development-workspace`, `service-runtime`, and
`github-delivery`. Preserve archived files as historical records.

## Read first

- `AGENTS.md`, `openspec/config.yaml`, applicable installed OpenSpec skills.
- Every current specification under `openspec/specs/`.
- `docs/foundation.md`, `docs/github-delivery.md`, and the relevant archives.
- `package.json`, `scripts/workspace.mjs`, database environment/integration scripts,
  migration history, and existing unit/browser/process/live tests.

The workspace uses npm workspaces, strict TypeScript, Next.js in `apps/web`,
NestJS modules in `apps/api`, and PostgreSQL/Drizzle in `packages/database`.
Prefer JavaScript/TypeScript; use other languages only when necessary. Tailwind
is the primary frontend styling approach; plain CSS is a small, justified gap
only. Shared theme tokens live in `apps/web/app/globals.css`.

There are no authentication or marketplace business features/tables yet. The web
does not import database code. Runtime/build/environment boundaries and safe
logging remain requirements when registration is added.

## Database policy and test safety

The owner explicitly removed PostgreSQL TLS requirements on 2026-10-25. Current
connections are plaintext and loopback-only in every runtime mode. Missing
`sslmode` or `sslmode=disable` is accepted. Remote transport requires a later
explicit design decision; do not restore historical TLS requirements.

Private ignored root `.env` supplies `DATABASE_URL` for local `commerce_db` and
`TEST_DATABASE_URL` for isolated `commerce_test`, on local port 5432. Never print,
copy into a handoff, or commit its contents or credentials. Automated database
tests connect only through `TEST_DATABASE_URL`; never fall back to development,
reset databases, delete unrelated data, or widen cleanup ownership.

Preserve target guards, finite connection/query/acquisition limits, exact fixture
ownership, rollback assertions, migration replay, and independently verified
sentinel preservation. Live persistence changes require actual passing database
tests; the original foundation waiver is historical. Current application history
is empty: registration must establish real non-empty application migration
coverage, including replay/rollback/cleanup behavior appropriate to its design.

CI already provisions a fresh disposable PostgreSQL 18.6 service with public
CI-only role/database identifiers, trust authentication, loopback-only host port
publishing, health checks, and no persistent host volume/private credentials.
It explicitly supplies only the test target and finite test limits. This approved
CI fixture policy does not authorize trust authentication on shared/developer/
production services. Do not change secrets handling or deployment steps without
approval. No deployment infrastructure has been selected.

## GitHub delivery is operational

Read `docs/github-delivery.md` for the exact owner workflow and failure recovery.
`npm run pr:open -- --head <full-SHA> --title "feat(scope): reviewed title" --body-file .local/pr.md`
finds/opens a matching PR for an already published clean feature branch; it never
pushes. `npm run pr:merge -- --pr <number> --head <full-SHA>` waits up to 30 minutes
for verified current CI/reviews/protection and makes one immediate head-conditional
squash-merge request. Neither helper enables deferred auto-merge or deletes branches.

GitHub CLI 2.103.2 was deliberately installed and authenticated as `Reza-HM`.
If a new shell lacks it on PATH, the installed executable is
`C:\Program Files\GitHub CLI\gh.exe`; a per-process PATH adjustment is enough.
Do not reinstall, relogin, print tokens, upload keys, or alter Git configuration
without need and applicable authorization.

CI jobs `quality` and `database` run for PRs into main (including drafts), main
pushes, and manual dispatch. They use Ubuntu 24.04, Node 24.20.0/npm 12.2.0,
pinned action SHAs/service digest, read-only access, and finite 20-minute limits.
Install the supported npm before restoring its download cache; bundled npm
11.19.0 fails the repository's intentional runtime guard.

Verified main protection requires PRs, successful `quality` and `database` from
GitHub Actions app 15368, an up-to-date base, resolved conversations, and admin
enforcement. Independent approving reviews required: zero for this solo workflow;
stale reviews dismissed; force pushes/deletions disabled. Squash support enabled;
native auto-merge, merge queue, and automatic branch deletion unused/disabled.
Helpers recheck policy and fail closed if it changes or cannot be verified.
Only the owner's ready same-repository PRs into main are eligible.

## Validation evidence and limitations

The implementation passed clean installation, lint, typecheck, 13 unit suites /
181 tests (79 helper tests), production build, one Chromium browser test, three
API process smoke checks, guarded live PostgreSQL integration, strict OpenSpec,
and actionlint. Both Windows local execution and the current suite on native
Linux GitHub runners are established.

- [Final PR run](https://github.com/Reza-HM/Commerce_App/actions/runs/40224800611):
  both jobs successful at the exact approved head.
- [Post-merge main run](https://github.com/Reza-HM/Commerce_App/actions/runs/40224979664):
  both jobs successful at `4d5e0a5`.
- The live suite reported PostgreSQL 18.6, zero application migrations, successful
  technical commit/rollback/replay/failed-migration rollback, and preservation of
  sentinels after both successful and deliberately failing workers.
- The opening helper created PR #3, and the merge helper actually merged it with
  independently confirmed head/result. These operations are no longer solely
  simulated. Failure/refusal/uncertain-response tests also pass.

This does not establish non-empty account migrations, every live pool-fault or
OS signal-delivery scenario, public deployment safety, or commercial capacity.
One million registered users remains a design aspiration, not a measured result.
Earlier dated foundation records remain historical; newer Linux/live evidence
supersedes only the specific checks actually executed.

The 2026-10-25 audit recorded three high-severity entries rooted in existing
`multer@2.4.0` under Nest's Express adapter. The automation change did not modify
that runtime dependency chain. See `docs/github-delivery.md`; do not force-fix,
downgrade, suppress, or silently mix unrelated upgrades into registration.

## Approved account direction

Implement separate changes in order:

1. `add-account-registration` (next proposal; not yet created/approved).
2. `add-account-sessions`.
3. `add-account-web-flow`.
4. `add-email-verification` (required separate pre-launch follow-up).
5. `add-password-recovery` (required separate pre-launch follow-up).

Email/password initially; no social/passwordless login. Sessions will be opaque,
revocable, PostgreSQL-backed, with Secure/HttpOnly browser cookies. Their later
proposal must precisely define inactivity expiry, renewal, and absolute lifetime;
activity must never extend that absolute lifetime. Registration does not silently
implement the session or web-flow changes.

An account can both buy and sell. Individuals need no seller-account approval to
publish their own goods; real-world business stores require admin approval.
Public registration never grants admin privileges or business approval.
Registration responses should resist email enumeration; recovery responses must
also resist it. Verification/recovery remain outside the initial account changes
but are required before public launch. Verification's proposal must define
unverified sign-in and restricted actions. Introduce local email preview/test
delivery when email is implemented; production email service is not a development
prerequisite.

Registration's proposal must settle the concrete persistence/API contract,
email normalization/uniqueness and race behavior, password policy/hashing,
validation/error and enumeration behavior, relevant abuse controls, and migration/
test coverage. These implementation details are not already approved by this
handoff; inspect current conventions and keep the proposal proportionate.

The product is a portfolio-first marketplace, potentially commercialized later,
initially English/USD with future localization. Fixed-price/negotiable listings,
messaging/contact, auctions, moderation/reporting, variants, multi-seller
cart/checkout, simulated payments, search, admin/seller workspaces, warehouse
inventory and PWA are future directions, not current implementation authority.

## Git approval rules still apply

- Commit completed logical steps autonomously on a feature branch after required
  checks; review staged/unstaged diffs, explicitly stage paths, and use
  Conventional Commits. Never commit secrets, `.env`, builds, logs or dependencies.
- Show the concrete CI/CD summary and obtain approval before pipeline commits;
  proposal approval does not waive this exception. No deploy/secrets changes
  without approval.
- Before pushing, describe the commits/branch and obtain permission. Before
  creating a PR, present the exact title/body and obtain approval.
- Merging requires an explicit instruction for the named PR and full head. One
  clear approval can cover the reviewed push/open/merge sequence; a new head
  needs fresh merge authorization. Previous PR #2/#3/finalization permissions do
  not authorize future registration delivery.
- No force push, protected-branch push, PR closing, branch deletion, published
  history rewrite, Git config change, hook bypass, or discarding work without
  the applicable explicit instruction. Do not infer blanket auto-merge authority.

Start the next conversation by inspecting the current repository/default branch,
reading the listed sources, and exploring the registration proposal. Do not create
sessions, web flow, verification or recovery proposals at the same time.
