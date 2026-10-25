# Proposal

## Why

Opening pull requests, monitoring checks, and merging finished work currently require repeated manual steps. Before account registration, one small delivery change should automate those mechanics while preserving the owner's explicit control over publishing and merging.

## What Changes

- Add GitHub Actions CI for pull requests targeting `main`, pushes to `main`, and manual runs. Run the existing lint, type-check, unit, build, browser, process-smoke, and live database gates, plus strict OpenSpec validation.
- Give each integration job its own disposable local PostgreSQL service and test database. Use only explicit CI test configuration through `TEST_DATABASE_URL`; retain loopback transport, finite limits, target guards, owned-fixture cleanup, rollback, and sentinel assertions.
- Provide two small cross-platform Node/GitHub CLI helpers: `pr:open` creates or finds the current published branch's PR using the reviewed title/body; `pr:merge` waits for successful checks and squash-merges only the explicitly authorized PR head commit.
- Keep pushing as an explicit normal Git operation. A single clear owner instruction may authorize a reviewed push, the displayed PR title/body, and merging the named commit after checks; authorization never carries to additional commits or another PR. Opening permission alone never permits merging.
- Require the two CI jobs on `main`, current-base checks, resolved review threads, and enforcement for administrators through owner-reviewed repository settings. Keep independent approving-review count at zero for the solo-owner workflow; the owner's explicit review and merge instruction remain required.
- Restrict helper-driven merging to the authenticated owner's non-draft, same-repository PRs into `main`. Fail safely on changed commits/base, conflicts, failed/missing checks, blocked reviews, unsupported protection, or timeout; leave the PR open for inspection.
- Document setup, exact approval boundaries, recovery, and actual GitHub acceptance evidence. No write-capable GitHub workflow, bot account, repository write secret, persistent auto-merge setting, merge queue, automatic branch deletion, deployment, or account feature is introduced.

This is a proposal for review, not authorization to install tools, change GitHub settings, push, create a PR, or merge. CI pipeline commits still require the owner's prior approval of their concrete summary.

## Capabilities

### New Capabilities

- `github-delivery`: Automated repository checks and owner-authorized PR opening and commit-specific merging, including failure behavior and minimum permissions.

### Modified Capabilities

None. Existing application and database requirements remain unchanged; CI executes their existing gates.

## Impact

Implementation affects `.github/workflows/ci.yml`, small delivery helpers under `scripts/`, root npm commands and the lockfile as needed for pinned OpenSpec tooling, focused helper tests, and delivery documentation. GitHub CLI is a local prerequisite, not an application dependency. Authentication remains in the owner's normal Git/GitHub CLI setup; no project credential storage is added.

Planning branches from remote `main` at `af2edc1`. Implementation depends on separately landing `enable-account-persistence-validation` (`16d9ffe` on its existing branch) and updating this branch before coding. That prerequisite is not permission to merge it. GitHub plan, protection support, Actions permissions, squash settings, and local CLI authentication must be verified before enabling delivery; missing prerequisites block activation rather than weakening the policy.
