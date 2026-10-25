# GitHub delivery

The delivery workflow has two operations: open a reviewed PR for an already
published branch, then wait for checks and merge its explicitly authorized commit.
The assistant can carry out both after one clear instruction covering the named
push, displayed PR title/body, and exact merge head. Permission to open alone
never permits merging. A new commit requires fresh merge authorization.

## Prerequisites

Use the Node/npm versions in `package.json`. Install GitHub CLI deliberately and
authenticate as the repository owner using its browser/device login flow. Restart
the terminal after installation if `gh` is not on PATH. Never paste a token into
chat, a command, or a repository file. Existing SSH Git authentication is separate;
the helpers do not run login, upload keys, configure Git, or push branches.

For this repository the supported identity is `Reza-HM` on `github.com`, operating
on `Reza-HM/Commerce_App`. Automated merging supports only that owner's own ready,
same-repository PRs into `main`. Forks, bots, and other authors use a separately
reviewed manual process. No self-approval or synthetic bot review is submitted.

Before activation, approve and configure classic `main` protection: require PRs,
successful `quality` and `database` checks from the GitHub Actions app, a current
base, resolved conversations, administrator enforcement, and no force pushes or
branch deletion. Required independent approvals are zero for this solo-owner
workflow; explicit owner review/merge instruction remains required. Preserve any
additional server requirements. Squash merging must be enabled, automatic branch
deletion disabled, and merge queues/native deferred auto-merge unused. Helpers
inspect settings and refuse unsupported or unverifiable enforcement.

## Owner workflow

1. Finish the change and its local validation. The assistant presents the commits,
   target branch, and exact Conventional Commit PR title/description. CI pipeline
   commits need approval of their concrete summary before committing.
2. Explicitly authorize the desired actions. A complete instruction can say:
   "Push this reviewed branch, open the PR with this title and description, and
   squash-merge head `<full SHA>` once the required checks pass."
3. Push normally with an explicit feature-branch refspec after authorization.
   Save the reviewed PR description in an ignored UTF-8 `.local/` Markdown file.
4. Run the opening helper with the reviewed head and metadata. It returns a new
   or exactly matching existing PR URL; it never silently edits existing PR text.
5. Run the merge helper only after explicit merge authorization. It waits in the
   current session, checks the head/base and CI evidence, and requests an immediate
   squash merge conditional on that head. It reports the confirmed merge commit.

Commands work with the same syntax in PowerShell and a POSIX shell. Replace all
placeholders; helpers reject missing arguments and shortened commit IDs:

```text
npm run pr:open -- --head <full-SHA> --title "feat(example): add reviewed change" --body-file .local/pr.md
npm run pr:merge -- --pr <number> --head <full-SHA>
```

The default wait limit is 1,800 seconds, polling about every ten seconds. A shorter
deadline can be selected with `--timeout-seconds <1-1800>`. Closing/interruption
does not arm a future merge. Branches are retained after merging.

## CI environment

`quality` runs lint, typecheck, unit tests, production build, Chromium browser
tests, API process smoke, and strict OpenSpec validation. `database` runs the
existing serial live suite against its own fresh PostgreSQL 18 service. Both jobs
run for all PR openings/updates/reopenings into `main`, including drafts, pushes
to `main`, and manual dispatch. There are no path exclusions. Obsolete runs can
be cancelled; cancellation is never passing evidence.

Jobs use a supported Ubuntu host, pinned Node/npm and OpenSpec, immutable action
references, clean lockfile installs, and only npm-download caching. CI has
`contents: read`; checkout does not persist a credential. No privileged PR-target
workflow, writer token, application secret, shared database, or developer `.env`
is used.

The PostgreSQL service uses trust authentication only within a disposable hosted
job, publishes its port on `127.0.0.1`, and has no persistent host volume or private
password. Its public CI-only role/database identifiers are not deployment
configuration. The suite receives only `TEST_DATABASE_URL` and finite test limits;
the root command forces test mode. Do not reuse this provisioning policy for a
shared/local developer/hosted database or relax the application transport guard.

The suite must still prove rollback, replay, owned cleanup, and independent
sentinel preservation before service disposal. Container teardown does not count
as cleanup evidence. Empty application history is reported as empty; registration
must later establish fresh non-empty application migration coverage.

## Failures and recovery

Changed head/base, conflicts, unresolved reviews, unsupported protection, failed
or ambiguous CI evidence, lost access, and timeout stop delivery. Missing checks
can wait until the deadline; skipped/neutral/cancelled/stale/foreign results cannot
satisfy a mandatory gate. Additional GitHub-required checks must also succeed.

Inspect the reported PR and CI run. Fix failures through normal reviewed commits
and obtain authorization for a new head. A base-only change requires a deliberate
update/revalidation and rerun; the helper never rebases the branch. It never
reruns CI, retries a merge mutation, bypasses protection, closes an unmerged PR,
or deletes a branch. An uncertain network response is reconciled read-only; an
unknown outcome is reported as unknown rather than success. If opening failed,
look up the existing PR before retrying to avoid duplicates.

## Observed setup and validation

2026-10-25: persistence PR #2 was separately authorized and squash-merged as
`e894969705067ad7fde34ef887a81832486a4ce3`; the unpublished automation proposal
was rebased onto that main baseline. The persistence recheck passed all seven root
gates, including 102 unit tests and the real isolated PostgreSQL suite on Windows.
GitHub CLI 2.103.2 was installed with owner approval and authenticated as `Reza-HM`.

Initial authenticated inspection: repository public; owner administration/push access;
Actions enabled with read-only default token and PR-review approval disabled;
squash merging enabled; automatic branch deletion/native auto-merge disabled;
no current classic protection or effective rules on `main`. GitHub Actions app ID
15368 was read from its public app metadata. These are dated observations, not
proof of future settings. Protection activation, actual GitHub CI, helper/live
merge acceptance, and any unperformed platform checks are recorded as pending
until observed. No Linux, commercial workload, or non-empty account coverage is
claimed by the local persistence recheck.

The 2026-10-25 dependency audit reports three high-severity entries rooted in the
existing `multer@2.4.0` dependency of Nest's Express adapter
([GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)). The
automation lockfile change does not alter those existing packages, and the pinned
OpenSpec addition introduces no advisory reported by that audit. A production
dependency upgrade is separate work; no force-fix, downgrade, or audit suppression
is included here. Current API code has no upload/file-filter implementation.

Local implementation acceptance on 2026-10-25 (Windows, Node 24.20.0, npm 12.2.0,
PostgreSQL 18.6): clean `npm ci --no-fund`, lint, typecheck, 13 unit suites with
181 tests (79 delivery tests), build, Chromium, three API smoke checks, live
integration on the isolated test database, and strict current-spec/active-change
validation passed. The live suite reported zero application migrations, successful
technical commit/rollback/replay/failed-migration rollback, and both sentinel
preservation cases. Credentials were not printed or modified.

The clean install left the committed lockfile content unchanged from the prepared
dependency update. npm blocked dependency install scripts; no blanket script
approval was added. actionlint 1.7.12, downloaded from its official release and
verified against its published SHA-256 checksum, accepted the workflow. Helper
argument guards were executed in PowerShell and Git Bash on Windows. The actual
authenticated merge helper also refused missing main protection without issuing a
merge request. The first live helper merge had not been performed at this
pre-delivery acceptance snapshot; its final outcome belongs to PR #3's delivery
record and requires separate, exact-head authorization.

The opening helper created [PR #3](https://github.com/Reza-HM/Commerce_App/pull/3)
at the explicitly approved head. Its [first CI run](https://github.com/Reza-HM/Commerce_App/actions/runs/40223863697)
failed before installation in both jobs: setup-node's cache lookup invoked Node's
bundled npm 11.19.0 before npm 12.2.0 was selected, and the repository's runtime
guard correctly rejected it. Later steps were skipped and the jobs failed.
The workflow now selects Node with automatic caching disabled, installs npm from
the runner's temporary directory, then restores the download cache using the
supported npm. Version enforcement and both mandatory jobs remain unchanged.
The corrected head `b78c24c61e86ace6a9ee09caf6bfe7f64147b369` passed both jobs in
[run 40224461528](https://github.com/Reza-HM/Commerce_App/actions/runs/40224461528).
`quality` completed in 1m45s and `database` in 1m1s on Ubuntu 24.04 with Node
24.20.0/npm 12.2.0. Quality passed lint, typecheck, all 181 unit tests across 13
suites, production build, Chromium installation and one browser test, three API
smoke checks, and strict validation of all four OpenSpec items. Draft PRs have no
exclusion, and the first run demonstrated command-failure propagation.

The fresh PostgreSQL 18.6 service passed actual Linux integration. Its result
reported zero application migrations; successful technical commit, rollback,
replay and failed-migration rollback; and preservation of the independent
sentinels after both successful and deliberately failing workers. The service
published only to loopback and used the explicit CI test target. This establishes
the present suite on Linux; non-empty account migration coverage, remaining pool
fault scenarios, and commercial capacity remain unproven.

Read-only execution of the actual helper rejected the first failed CI run and
accepted the corrected run's current-head/current-base evidence under active
protection. No merge request was issued by either evidence check. All 79 helper
tests, including conditional merge and refusal cases, passed on Windows and Linux.
Any later commit must earn its own fresh CI results before delivery.

After both named checks registered with GitHub Actions app 15368, the owner
approved protection payload was applied and read back from GitHub on 2026-10-25.
`main` now requires PRs, successful `quality` and `database` checks from that app,
an up-to-date base, resolved conversations, and administrator enforcement. Stale
reviews are dismissed; required independent approvals are zero; force pushes and
branch deletion are disabled. Squash support remains enabled, native auto-merge
and automatic branch deletion remain disabled, and there are no effective
ruleset/merge-queue requirements. Future helper calls recheck these settings.

Final delivery on 2026-10-25: the owner explicitly authorized pushing and merging
head `14712a7f430acea16f05889a30d9b314af8226ef`. Both jobs passed in
[the final PR run](https://github.com/Reza-HM/Commerce_App/actions/runs/40224800611).
The actual merge helper then conditionally squash-merged
[PR #3](https://github.com/Reza-HM/Commerce_App/pull/3), confirmed the outcome, and
reported commit `4d5e0a5d3dbf8637ac44e15faf066f0c89fc96d6`. An independent API
read confirmed the exact merged head and resulting commit. Both jobs also passed
in [the automatic main-push run](https://github.com/Reza-HM/Commerce_App/actions/runs/40224979664).
The feature branches were retained. This establishes the first real helper merge
in addition to the simulated success/refusal tests.

The owner requested finalization and archive after delivery. All 16 tasks and
all planning artifacts were complete. The nine `github-delivery` requirements
were synced into the current spec, with Purpose/scenarios preserved, and the
change artifacts were moved unchanged to
`openspec/changes/archive/2026-10-25-automate-github-pr-workflow/`.
The documentation finalization is maintained separately from the already merged
implementation PR; inspect its current Git/PR state before starting new work.
Finalization checks passed locally: lint, typecheck, all 181 unit tests across
13 suites, and strict validation of all four current specifications. The archive
move preserved every artifact's content, including `.openspec.yaml`.
