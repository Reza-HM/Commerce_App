# Design

## Context

See `proposal.md` for motivation and scope. Inspection on 2026-10-25 found no tracked `.github` workflows or active changes. Node 24.20.0 and npm 12.2.0 are the recorded runtime; OpenSpec 1.14.3 is installed globally but is not a pinned workspace dependency. GitHub CLI is not on the current PATH. Git refs are readable, but authenticated GitHub settings, subscription capabilities, and review/protection state have not been inspected.

Remote `main` is `af2edc1`. The completed persistence branch is `16d9ffe` and has not been merged. This planning branch starts from `main` so the automation proposal does not accidentally include those four commits. Before implementation, obtain separate authorization to land persistence and update this branch without rewriting published history. Read its current specs and scripts again after updating; current `main` still contains historical database behavior.

The intended implementation baseline is the persistence branch: root workspace commands order builds, browser tests build the production web shell, process smoke needs no PostgreSQL, and live integration forces test mode and honors process settings over `.env`. Live integration already exercises migration replay, transaction/failed-migration rollback, and independently owned sentinel preservation. Application migration history is empty; no account coverage is claimed.

## Goals / Non-Goals

**Goals:** One change covering reliable CI and convenient owner-controlled PR delivery. Prefer two small Node entry points backed by normal GitHub CLI operations over a service, bot, or general automation framework. Keep the usual human interaction to reviewing the work and explicitly authorizing the desired actions.

**Non-Goals:** No unattended authority over every pushed branch, automated code review approvals, dependency bots, deployment/release tooling, merge queue, background scheduler, database transport changes, or account implementation. Helpers never manage credentials or push branches.

## Decisions

### 1. Two required CI jobs

Add `.github/workflows/ci.yml` with stable jobs `quality` and `database`, initially on a specific supported Ubuntu runner image. Both run unconditionally for `pull_request` opened/synchronize/reopened events targeting `main`, `push` to `main`, and `workflow_dispatch`. Draft PRs also run. Use a per-PR concurrency group to cancel obsolete runs; cancellation is never a pass. Set finite job timeouts, initially 20 minutes each, and adjust only from observed runtime.

- `quality`: clean install; lint; typecheck; unit tests; complete production build; install the lockfile-matched Chromium plus OS dependencies; browser tests; API smoke; `openspec validate --all --strict --no-interactive`.
- `database`: clean install; wait for the disposable PostgreSQL service health check; run `npm run test:integration` with explicit test configuration. The root command builds its database dependency and forces `NODE_ENV=test`.

Keep commands serial inside each job because they write shared build outputs. Separate jobs have separate checkouts/services. Pin Node/npm to the supported recorded versions and the OpenSpec CLI as a workspace development dependency; use the local binary. Cache downloaded npm packages only, never `node_modules`, builds, database data, or prior check results. Pin external actions to verified full commit SHAs and the PostgreSQL 18 service image to a verified digest. The exact digest and supported runner label are checked during implementation, not invented in planning.

Two jobs are enough to separate service-free failures from live database failures. A larger OS/version/browser matrix would increase cost without helping this first delivery workflow. Linux coverage becomes established only after successful runner execution; the existing Windows record is not Linux evidence.

### 2. An isolated service without private credentials

Run application/test commands directly on the Ubuntu host, not inside a job container. Publish the service's port to `127.0.0.1` only, so the application uses a loopback host accepted by its guard rather than a Docker service hostname.

Proposed provisioning policy: initialize a fresh CI-only PostgreSQL service with a named test database and role, and trust authentication solely inside that disposable service. No password, repository secret, developer URL, persistent volume, or shared database is required. PostgreSQL service initialization variables are workflow-owned public fixture settings; they must never affect a developer or hosted database. Verify host-loopback binding and runner isolation before activation. The existing connection parser accepts a local URL without a password; no runtime parser changes are needed.

Supply only `TEST_DATABASE_URL` and finite test limits to the live command. Do not supply a development fallback. Existing unit guard tests continue to cover missing/unsafe/matching non-test targets. The CI suite still proves exact fixture cleanup and sentinel preservation before the service is discarded. Container teardown is environment disposal, not permission to weaken test cleanup or reset database state. This provisioning/authentication policy requires proposal approval; it is not applied during planning.

Alternative: managed/shared databases need credentials and lifecycle coordination. A locally generated secret with custom container orchestration adds machinery that the isolated disposable fixture does not need.

### 3. Small local helpers, no write workflow

Expose `npm run pr:open -- ...` and `npm run pr:merge -- ...` through small JavaScript modules under `scripts/`. Keep GitHub interaction in `gh`, local Git inspection in `git`, and subprocess invocation in argument arrays with `shell: false`. Use existing test tooling with injected command execution for meaningful negative-path tests; add no GitHub SDK or generic workflow engine.

Require installed authenticated GitHub CLI. The initial owner performs installation/login as a deliberate prerequisite; never install automatically, request a project-stored token, print token contents, or change Git config. Use explicit `Reza-HM/Commerce_App` arguments and verify origin/owner identity so the caller cannot accidentally operate on another repository. Pass descriptions through UTF-8 files, preserving literal newlines and shell metacharacters.

`pr:open` receives the expected full head SHA, Conventional Commit title, and body-file path. Verify a clean feature branch, exact local HEAD and published remote head, and an accessible `main` base. Query for an existing open PR with the exact same repository/head/base. Return a matching PR unchanged; reject different metadata or ambiguous matches. Otherwise invoke `gh pr create` with explicit repository, base, head, title, and body file. Explicit `--head` avoids the CLI's automatic push/fork prompt. A network failure is reconciled by a read-only lookup; do not blindly repeat creation. Never use `gh pr create --dry-run` as a safety preview because GitHub documents that it can still push.

Pushing remains a clearly described, separately authorized normal `git push` with an explicit feature-branch refspec. Existing git approval rules remain intact. This is less code and keeps failed pushes separate from PR creation.

### 4. Commit-specific merge with bounded waiting

`pr:merge` receives an explicit PR number and authorized full head SHA. It checks owner identity, open/non-draft state, same-repository head, `main` base, conflict status, unresolved discussions/change requests, and verified protection. Only the owner's own PRs are supported initially; fork/bot/other-author PRs are not automatically included by a label or branch pattern.

Poll at a modest interval, initially ten seconds, for up to 30 minutes. Capture head/base/tested merge revision and require unambiguous successful `quality` and `database` jobs from this repository's CI workflow for that current revision. Use GitHub run/check metadata to verify provenance and freshness; neither an empty `gh pr checks --required` response nor generic pass buckets are sufficient. Also honor any additional server-required checks/reviews. Failed/cancelled/skipped/neutral checks are blocking; pending or not-yet-created expected jobs can wait until the deadline. No automatic check reruns or repair commits.

Any head or base change stops this invocation. A changed head requires new owner authorization. A base-only update requires fresh current-base checks and a deliberate rerun for the same authorized head; the helper never updates/rebases the branch itself. Immediately before mutation, re-read eligibility and protection. Request an immediate squash merge with the expected head SHA, using GitHub's conditional merge facility through `gh`; do not pass admin bypass, delete-branch, or deferred auto-merge options. A merge queue is unsupported and blocks activation/use. Re-read merged state and report the resulting commit. On uncertain responses, reconcile read-only and report unknown if confirmation is unavailable.

Alternative: native persistent auto-merge is convenient but can remain armed when a trusted author pushes additional commits. A bounded local waiter keeps authorization tied to the reviewed SHA, avoids write credentials in Actions, and needs no new bot/daemon. The terminal/assistant session must remain available; interruption leaves the PR open without deferred authority.

### 5. Owner approval and repository enforcement

Planning and implementation approval do not themselves authorize any shared Git action. Before publishing, present the branch/commits and intended PR title/body. Before merging, identify the PR/head and squash method. The owner can explicitly authorize the complete described sequence in one instruction, including merging that head after checks. Otherwise preserve the separate approval boundaries. Pipeline commits require approval of their concrete summary even after implementation is authorized.

Use a reviewed classic `main` branch-protection rule for the initial setup: require PRs; require `quality` and `database` from GitHub Actions; require the branch to be current; require resolved review conversations; enforce for administrators; disallow force pushes/deletion. Set required independent approvals to zero because the owner authors these PRs and cannot self-approve. Do not create fake bot approvals. Explicit owner review/instruction remains a conversational prerequisite, not a claim that GitHub can verify private chat consent.

Read existing settings before proposing an exact settings diff. Do not weaken pre-existing stricter rules silently. Configure/check squash support, keep automatic branch deletion disabled, and do not enable native auto-merge or a merge queue. Applying settings needs the owner's explicit approval. Verify the effective protection with authenticated APIs; if the repository plan or access cannot support or verify it, leave automated merging unavailable and report the prerequisite. No custom fallback that bypasses protection is included.

### 6. Validation and first use

Test helper decisions with fake Git/CLI responses, including missing tools, exact argument handling, duplicate/create-after-network-error behavior, changed head/base, missing/stale/foreign/skipped checks, reviews/conflicts, timeout, and uncertain merge results. Assert no forbidden mutation occurs on refusal and no automatic merge retry occurs. These tests need no network, credentials, or database.

Run local lint/typecheck/unit gates and strict OpenSpec validation before code commits. Pipeline changes additionally need the owner's pre-commit approval. Actual CI acceptance must show all existing commands and real PostgreSQL assertions passing on GitHub. Validate real PR opening through this change's authorized delivery; do not create unrelated test PRs just to exercise mutations. The first real merge occurs only when the owner explicitly authorizes it. Report merge tests as simulated until that result is observed, and retain the PR URL/check results as durable GitHub evidence.

## Risks / Trade-offs

- **GitHub plan/settings cannot enforce this policy** -> Verify before activation; no unsupported fallback or bypass. This is an explicit prerequisite, not an assumption that the private/public plan permits it.
- **Approval is not machine-verifiable chat state** -> The assistant follows existing instructions; direct human invocation of a mutating helper is an explicit action. Helpers still enforce repository, revision, checks, and server protection.
- **Disposable trust authentication would be unsafe on a shared host/service** -> Restrict it to a fresh GitHub-hosted CI job, loopback-only publishing, no persistent state or external credentials; never reuse its configuration outside CI.
- **A race changes code or base after checks** -> Compare head/base before mutation, use an expected-head merge request, and retain strict current-base server enforcement.
- **External failure after a mutation leaves uncertain state** -> Read-only reconciliation and accurate reporting; no duplicate PR creation or repeated merge request.
- **Linux exposes platform differences or integration timing failures** -> Treat failures as work to fix and rerun; never relax application deadlines, target guards, or mandatory gates to get green CI.

## Migration Plan

1. Review this proposal; separately land persistence and update the automation branch before implementation.
2. Implement CI/helpers/tests/docs locally. Install/authenticate GitHub CLI deliberately, inspect repository settings, and obtain pre-commit approval for the pipeline changes.
3. After normal commit validation and explicit publishing/PR approval, push the feature branch and open its PR. Observe actual CI before describing GitHub validation as passed.
4. Show and obtain approval for the exact settings changes; activate/verify protection only after the named checks exist. Obtain explicit merge authorization for the named PR/head and exercise the merge helper when requested.
5. Preserve chronological evidence and normal sync/archive workflow. Planning completion is not implementation or live delivery completion. Record unperformed merge acceptance separately until observed; the real merge may be the final delivery of this change itself.

To roll back, stop invoking the helpers, revert implementation through normal reviewed commits, and propose any protection/workflow settings reversal for approval. Do not silently disable checks, delete branches, undo database migrations, or change deployment settings.

## References

- [GitHub CLI PR creation](https://cli.github.com/manual/gh_pr_create): explicit head selection and the dry-run push caveat.
- [GitHub CLI conditional merging](https://cli.github.com/manual/gh_pr_merge): expected-head checks, merge strategy, and queue behavior.
- [GitHub CLI check results](https://cli.github.com/manual/gh_pr_checks): pending and skipping/cancel categories.
- [PostgreSQL services on GitHub runners](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers): runner-host service networking.
- [Official PostgreSQL image](https://hub.docker.com/_/postgres): disposable service initialization and the proposed trust-authentication option, restricted here to isolated CI.
- [Branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches): required checks and current-base enforcement.
- [GitHub required reviews](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews): authors cannot approve their own PRs.
