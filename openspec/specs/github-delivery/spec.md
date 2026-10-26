# github-delivery Specification

## Purpose

Make repository delivery repeatable by running automated checks and simplifying PR opening and merging while preserving explicit owner authorization and safe failure behavior.

## Requirements

### Requirement: Automatic repository validation
CI SHALL run on PR creation, updates, and reopening targeting `main`, on pushes to `main`, and on manual invocation. Every run MUST execute lint, type checking, unit tests, production build, browser tests, API process smoke, live integration, and strict validation of current OpenSpec specs and active changes. Required jobs MUST have stable names and no path-based exclusions.

#### Scenario: A pull request is opened or updated
- **WHEN** a draft or ready PR targeting `main` is opened, reopened, or receives a new commit
- **THEN** both database-independent and live database checks run against that revision without using developer configuration
- **AND** any failing mandatory command produces a failed CI job

#### Scenario: Default branch or manual validation runs
- **WHEN** `main` receives a push or the owner manually invokes CI
- **THEN** the same mandatory gates execute and report their outcomes

### Requirement: Disposable CI database isolation
Each live CI job SHALL provision its own disposable local PostgreSQL test environment, connect only through `TEST_DATABASE_URL`, and retain existing target guards, finite limits, exact fixture ownership, rollback, replay, and sentinel assertions. CI MUST NOT read a developer `.env`, use a shared database, reset application state through test cleanup, or treat service teardown as proof of fixture cleanup.

#### Scenario: Live tests execute in CI
- **WHEN** the CI test service becomes healthy
- **THEN** the existing live suite runs serially against a fresh loopback test database in test mode
- **AND** it verifies owned cleanup and independent sentinel preservation before the disposable service is discarded
- **AND** its evidence distinguishes empty application history from actual non-empty migration coverage

#### Scenario: A database prerequisite fails
- **WHEN** service health, connection configuration, isolation, assertions, or cleanup cannot be verified
- **THEN** the integration job fails rather than skipping, substituting a database, or weakening guards

### Requirement: Minimum automation permissions
CI SHALL use read-only repository access and no application secrets or repository write credentials. PR mutation SHALL run only through the owner's locally authenticated GitHub tooling. Automation MUST NOT grant itself approval, bypass protection, change Git configuration, or silently edit repository settings.

#### Scenario: Pull request code runs
- **WHEN** CI executes code from an internal or fork PR
- **THEN** it has no token permission to push, open, approve, or merge PRs and no development or production credentials

#### Scenario: Local authentication is unavailable
- **WHEN** a delivery helper lacks the necessary authenticated owner access
- **THEN** it exits with an actionable prerequisite error without exposing credentials or attempting to install or authenticate tools automatically

### Requirement: Explicit action authorization
Owner-approved implementation SHALL authorize feature-branch publishing, PR creation, and checked merging under the standing project policy, without repeated delivery prompts. The assistant MUST announce the branch/commits, PR metadata, and merge target, and record the current full head. Explicit scope/revision limits MUST prevail. Each changed head/base MUST receive fresh validation and a new head-specific helper invocation; unrelated PRs remain outside this authorization.

#### Scenario: The owner authorizes the complete delivery
- **WHEN** the owner approves implementation and the standing automatic-delivery policy applies
- **THEN** the assistant announces and performs feature-branch publishing, PR opening, required checks, and conditional merging without separate confirmations
- **AND** it reports the PR link and confirmed merge result

#### Scenario: New commits arrive after merge authorization
- **WHEN** an assistant-authored fix within the approved scope changes the PR head before merge
- **THEN** the previous helper invocation stops and the assistant validates/publishes the fix and starts a fresh invocation for the recorded current full head without another delivery prompt
- **AND** old check evidence cannot authorize the new head and no native deferred auto-merge is armed

#### Scenario: The owner limits delivery or unexpected scope appears
- **WHEN** the owner specifies local-only, draft-only, stop-before-merge, or a limited revision, or unexpected/out-of-scope commits appear
- **THEN** the assistant honors those limits and obtains any missing authorization before proceeding
- **AND** it does not transfer approval to unrelated PRs, bypass checks, or broaden implementation scope

### Requirement: Repeatable pull request opening
The opening helper SHALL use an explicit repository, `main` base, published feature branch, expected full head SHA, and supplied Conventional Commit title and body file. It MUST require a clean working tree and matching local/remote heads, create at most one matching open PR, and return its URL. It MUST NOT push, fork, rewrite history, or silently edit an existing PR.

#### Scenario: A published branch has no pull request
- **WHEN** the opening helper is invoked after authorized pushing with matching branch heads and reviewed metadata
- **THEN** it creates one PR against `main` with that exact title and body and returns its URL

#### Scenario: Opening is retried
- **WHEN** an open same-repository PR already matches the branch, base, expected head, title, and body
- **THEN** the helper returns the existing PR URL without creating or editing another PR
- **AND** mismatched metadata or multiple candidates cause an actionable error

### Requirement: Restricted merge eligibility
The merge helper SHALL accept only an explicitly identified open, non-draft PR authored by the authenticated repository owner, from the same repository into `main`, at the authorized full head SHA. It MUST require a conflict-free current base, resolved review threads, no outstanding change request, and enforced mandatory checks. Fork, bot, and other-author PRs MUST require a separate manual process.

#### Scenario: A PR is outside the supported delivery scope
- **WHEN** the PR is a draft, has another author, comes from a fork, targets another branch, has conflicts, or differs from its authorized head
- **THEN** the helper refuses to merge and reports the blocking condition

#### Scenario: Review requirements block delivery
- **WHEN** a review thread is unresolved, a change request remains outstanding, or GitHub reports an unmet review requirement
- **THEN** the helper leaves the PR open without approving, dismissing reviews, or bypassing the requirement

### Requirement: Complete current check evidence
Before merging, the helper SHALL verify successful results for every mandatory CI job on the PR's current tested revision and base, from this repository's configured CI workflow. Empty, stale, ambiguous, skipped, neutral, cancelled, or unrelated checks MUST NOT count as success. Additional checks required by GitHub MUST also pass. Pending checks MUST be observed only within a finite deadline.

#### Scenario: Checks have not finished
- **WHEN** the expected jobs are pending for the authorized revision
- **THEN** the helper reports their status and waits for up to 30 minutes by default
- **AND** failure, cancellation, loss of access, changed head/base, or timeout stops the operation without automatic retries or merging

#### Scenario: Successful-looking evidence is incomplete
- **WHEN** jobs are missing, skipped, neutral, duplicated ambiguously, from another workflow, or associated with an older head or base
- **THEN** merging remains blocked even if an empty or filtered check query returns success

### Requirement: Conditional merge and verifiable outcome
After all eligibility checks pass, the helper SHALL re-read PR state and request a squash merge conditional on the authorized head SHA. It MUST preserve server-side protection, avoid deferred auto-merge or merge queues, and confirm the resulting merge commit before reporting success. It MUST NOT delete branches, force-push, close an unmerged PR, or retry a rejected mutation automatically.

#### Scenario: The reviewed change is ready
- **WHEN** the authorized head, current base, reviews, protection, and required CI results still satisfy the policy
- **THEN** the helper requests a head-conditional squash merge and reports the confirmed merged state, URL, and resulting commit

#### Scenario: State changes or the response is uncertain
- **WHEN** GitHub rejects the merge or the network response is interrupted
- **THEN** the helper queries the outcome read-only and reports merged, unmerged, or unknown accurately
- **AND** it does not issue another merge request or leave native auto-merge armed

### Requirement: Reviewed activation and operating evidence
Delivery activation SHALL require an owner-reviewed protection configuration for `main`, including mandatory CI checks, an up-to-date base, resolved conversations, and administrator enforcement. The solo-owner policy MUST NOT require an independent approving review. Documentation MUST identify tool prerequisites, approval boundaries, recovery, observed validation, and remaining limitations; unsupported settings MUST block activation.

#### Scenario: Repository setup is incomplete
- **WHEN** protection cannot be enforced or verified, required checks are absent, squash merging is disabled, or a merge queue is required
- **THEN** automated merging remains disabled and the missing prerequisite is reported without altering settings automatically

#### Scenario: Delivery acceptance is recorded
- **WHEN** implementation completion is reported
- **THEN** evidence includes passing local helper tests and actual GitHub CI execution with a live isolated database
- **AND** real PR creation has been demonstrated only after explicit owner authorization
- **AND** conditional merge behavior has passing local tests, with live merging performed only when explicitly authorized and any unperformed live merge reported as unverified
- **AND** simulated tests alone are not represented as verified end-to-end GitHub delivery
