# Tasks

All tasks below are implementation after proposal approval. Planning does not complete them. Prerequisite: separately authorize and land the persistence change, then update this branch from `main` without rewriting published history. No task grants permission to merge that prerequisite or this change.

## 1. Tooling and repository prerequisites

- [ ] 1.1 Recheck the updated persistence baseline, runtime constraints, current commands, and remote default branch; verify that loopback-only guarded live integration is present and no account functionality or unrelated commits enter this change.
- [ ] 1.2 Verify deliberate GitHub CLI installation/authentication and authenticated owner/repository identity; inspect current protection, Actions access, squash support, auto-delete/auto-merge/queue settings, and plan support without printing tokens or changing settings. Record actual prerequisites in `docs/github-delivery.md`; report unsupported enforcement as an activation blocker.
- [ ] 1.3 Pin OpenSpec tooling as a workspace development dependency, preserve one root lockfile, and verify clean installation plus local strict validation commands without a global CLI.

## 2. Required CI and isolated integration

- [ ] 2.1 Add the read-only `quality` and `database` jobs with the specified PR/main/manual triggers, stable names, finite timeouts, current runtime versions, verified action SHAs/service digest, and per-PR cancellation. Review workflow syntax and confirm no path skips, write permissions, private secrets, deployment steps, or cached build/database state are introduced.
- [ ] 2.2 Run the complete ordered quality command list, including Chromium/OS installation and local strict OpenSpec validation; document the two job names and Linux coverage limits. Verify a failed command propagates failure and draft PRs are not excluded.
- [ ] 2.3 Provision the disposable CI-only PostgreSQL test service using the proposed isolated trust-authentication policy, host-loopback port publishing, health checks, no volumes/private credentials, and explicit `TEST_DATABASE_URL`. Run the existing serial live suite; require real rollback/replay/cleanup/sentinel evidence and preserve missing/unsafe-target unit coverage without altering application guards.
- [ ] 2.4 Document CI provisioning, finite limits, exact existing test ownership rules, and empty-history limitations alongside the workflow. Review the concrete CI changes with the owner and obtain approval before their commit; never interpret proposal approval alone as pipeline-commit approval.

## 3. PR opening and merge helpers

- [ ] 3.1 Add minimal Node command execution shared by the two npm helpers, with explicit repository selection, full-SHA validation, argument arrays, no shell, body-file input, and safe errors. Add local tests for missing tools/authentication, wrong repository, multiline/metacharacter metadata, and absence of credential output; document the helper prerequisites with the implementation.
- [ ] 3.2 Implement `pr:open` for an already-published clean feature branch with matching local/remote/expected heads and reviewed metadata. Test one-PR creation, unchanged matching-PR reuse, ambiguous/mismatched refusal, and read-only reconciliation after uncertain creation; assert no push, fork, existing-PR edit, or duplicate mutation is performed. Document the separately authorized push/open sequence.
- [ ] 3.3 Implement merge eligibility and bounded check polling for the owner's same-repository ready PR into `main`, expected head/base, review state, current CI evidence, and enforced protection. Test changed head/base, fork/bot/draft/other-author PRs, conflicts, reviews, missing/stale/foreign/ambiguous/skipped/neutral/cancelled checks, pending jobs, additional required checks, API failure, unsupported protection/queue, and timeout; assert every refusal leaves the PR unmerged.
- [ ] 3.4 Implement the final state recheck and immediate conditional squash merge, followed by read-only outcome confirmation. Test expected-head propagation, success, server rejection, interrupted response, already-merged reconciliation, and unknown result; assert no admin bypass, deferred auto-merge, branch deletion, auto-retry, or Git config/history changes. Document that interrupted waiting grants no background merge authority.
- [ ] 3.5 Finish the short owner workflow in `docs/github-delivery.md`: show concrete commits/title/body and authorized head; accept one explicit instruction covering the named push/open/merge actions or separate instructions; require fresh authorization for a new head; explain recovery from failure without broadening permissions. Verify examples against both helpers in PowerShell and a POSIX environment when available, and label any unexecuted platform check.

## 4. Integrated acceptance and activation

- [ ] 4.1 Run lint, typecheck, unit tests, build, browser tests, API smoke, and the guarded local live integration gate after updating to persistence; run strict validation of this change and current specs. Review the complete diff against all scenarios and record actual command/platform results without claiming Linux or GitHub success from local tests alone.
- [ ] 4.2 Present the final commits and PR title/body; after explicit push/PR authorization, publish this branch and exercise the opening helper on this change's own PR. Attach the created PR to the chat. Observe both actual GitHub jobs, including live database evidence; fix failures normally and do not weaken required checks or quietly rerun until green.
- [ ] 4.3 Present the exact repository-settings diff for approval, apply only authorized settings, and verify effective `main` protection and the two expected check sources after they exist. Confirm current-base checks, resolved conversations, administrator enforcement, squash support, zero independent required approvals for the agreed solo workflow, no queue, and no automatic branch deletion. Keep automated merging unavailable if any prerequisite is unsupported or unverifiable.
- [ ] 4.4 Record passing helper refusal/conditional-merge tests, actual CI run/PR links, and activation outcomes. Report any first live merge still unperformed as unverified; verify no implementation completion claim implies an unobserved live merge or any account/deployment work.

## Workflow follow-up

- Stop for review before applying this proposal. Implementation, pipeline commits, GitHub setting changes, pushing, PR creation, and merging retain their applicable approval boundaries.
- Sync/archive through the normal workflow after implementation verification and owner review. Keep archive actions separate from tracked implementation tasks.
- When explicitly instructed to merge the named PR/head, use the helper and record the confirmed URL/resulting squash commit. This change's final delivery can be its first real merge; do not create unrelated fixture PRs solely for testing.
- Do not delete either feature branch automatically. Propose account registration only after this delivery change and its persistence prerequisite have landed.
