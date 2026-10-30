# Tasks

Implementation was approved on 2026-10-30. Checked tasks record their required
implementation and verification; remaining acceptance gates stay explicit.

The owner extended acceptance to real email delivery after PR #14 and selected
Gmail SMTP on 2026-10-30 because no owned domain is available. Sections 1-6 record
the completed local-capture baseline; section 7 is required before overall completion.

## 1. Challenge persistence and rollout migration

- [x] 1.1 Add the digest-only verification challenge schema, account linkage, indexes, and a new reviewed explicit migration with permanent revocation of existing unverified-account sessions; verify generated SQL/metadata review, prior migration hashes, and schema-constraint tests without editing existing history.
- [x] 1.2 Implement account-serialized issuance, 60-second cooldown, three-row cap, account-scoped expiry pruning, and challenge lookup using the shared bounded database; verify repository tests for unknown/verified accounts, concurrent issuance, expiry boundaries, digest storage, and preservation of earlier live links.
- [x] 1.3 Implement atomic credential/challenge revalidation, verification timestamp, all-challenge invalidation, and session revocation with consistent account-first locking; verify repository and guarded live tests for concurrent confirmations, sibling replay, stale credential proof, forced rollback, and no session revival.
- [x] 1.4 Extend the guarded integration runner with exact challenge/account/session ownership and a separate prior-schema rollout fixture; verify fresh-install versus replay reporting, verified-account preservation, expected unverified-session revocation, and independent sentinels after successful/failing workers. Document migration effects and safe rollout/recovery in the account service guides alongside this work.

## 2. Local mail transport and lifecycle

- [x] 2.1 Add and pin the reviewed SMTP client, injected sender contract, literal-loopback transport settings, configured allowlisted verification web origin, and synthetic sender; verify install/lockfile integrity and configuration tests rejecting remote/ambiguous inputs without exposing values. Document process-only settings and unchanged database-only environment loading.
- [x] 2.2 Implement English text/HTML mail with the fixed fragment-link route, disabled external content/debug logging, two tracked issuance/delivery slots, and a five-second canceling SMTP deadline; verify an owned SMTP capture fixture, correct message/link content, saturation, failed/partial/stalled transport, resource release, and redacted outcome events.
- [x] 2.3 Integrate stop/drain/close with existing shutdown and independent health behavior; verify process-smoke cases for missing SMTP service, disconnected callers, bounded cancellation, repeated shutdown, and hard-deadline failure. Document version-pinned loopback Mailpit setup, bounded inbox retention, no relay, and explicit resend after lost delivery.

## 3. Verification services and HTTP contracts

- [x] 3.1 Add strict request/confirmation validation, shared real/dummy password verification, separate five-attempt peer budgets, and service orchestration over the new repositories; verify unit tests for malformed/oversized input, significant password spaces/Unicode, generic invalid outcomes, cooldown/cap suppression, password-work saturation, disconnects, and no credential replacement.
- [x] 3.2 Add both verification POST routes with custom-header/exact-origin protection, non-credentialed CORS, no-store/correlation/nosniff, safe 400/401/403/429/503/500 contracts, and static logging; verify HTTP tests and secret-marker scans including route aliases, unknown/verified addresses, missing relations, parser limits, and no cookies or GET mutation.
- [x] 3.3 Preserve the internal committed registration creation result to trigger only a new account's bounded initial delivery; verify equal generic new/duplicate 202 contracts, no duplicate send, no credential changes, post-commit mail/preparation failures, and explicit resend recovery without holding hash/database resources during SMTP.
- [x] 3.4 Document the new routes, headers, exact bodies, side effects, limits, generic acknowledgment, and best-effort failure behavior in `docs/api/openapi.json`, `docs/api/README.md`, and a linked verification guide; update route/response coverage tests and verify `npm run docs:api:lint`, relevant HTTP contract tests, and `npm run docs:api:build`.

## 4. Verified-only session boundary

- [x] 4.1 Extend credential lookup and conditional session insertion/renewal with verification state, preserving generic wrong-password/unknown-account results and idempotent sign-out; verify unit/repository tests for verified success, correct-password unverified 403, wrong-password unverified 401, current-session 401, races, and unchanged expiry semantics.
- [x] 4.2 Update real HTTP and guarded session integration coverage for the rollout and verification transaction; verify legacy cookies fail before and after confirmation, fresh explicit sign-in works only after verification, verified existing sessions survive rollout, and verification creates no session. Update OpenAPI/session guides and their contract tests in this group.

## 5. Browser verification journey

- [x] 5.1 Extend the account API client with strict verification response parsing, credential omission/custom headers, the distinct sign-in verification-required result, finite deadlines, and no automatic retry; verify client unit tests for exact status/body combinations, generic 403 distinction, abort/timeout uncertainty, and malformed responses.
- [x] 5.2 Add `/verify-email/request` and `/verify-email` using localized shared components and semantic Tailwind tokens; implement transient fragment capture/removal, fail-safe URL cleanup, explicit password confirmation, route-specific no-referrer, password/token lifecycle clearing, and safe resend/sign-in feedback. Verify browser tests for zero mutation on open/prefetch, wrong-password retry, missing/malformed/expired/used links, response loss, reload/history restoration, and secret-free URLs/output/storage/logs after capture.
- [x] 5.3 Add conditional registration guidance and explicit resend navigation, and distinguish verification-required sign-in feedback without automatic mail requests; verify a complete register/captured-email/confirm/explicit-sign-in/account/sign-out browser journey and unchanged duplicate-password behavior. Update `docs/account-web-flow.md` with the journey and unknown-password/recovery limitation.
- [x] 5.4 Review new pages and text/HTML email on desktop and narrow mobile, both appearances, System preference changes, persistence/blocked storage, reduced motion, keyboard focus, announcements, zoom, cursors, paste, and password managers; record actual browser evidence and fix observed accessibility/layout failures without inventing product capabilities.

## 6. Integrated acceptance and review evidence

- [x] 6.1 Update existing unit, browser, local-origin, smoke, and live fixtures to use explicit verified fixtures or the real verification journey as appropriate; verify all existing cases remain meaningful, the local SMTP fixture is isolated, and no test accesses private `.env`/developer inboxes or resets development data.
- [x] 6.2 Exercise a synthetic journey through the actual loopback Mailpit inbox and normal web/API setup on localhost and 127.0.0.1 with matching configured origins; record actual delivery/browser evidence separately from doubles and guarded persistence evidence, including mail-down recovery and legacy-account verification.
- [x] 6.3 Run `npm run format`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:smoke`, and successful guarded `npm run test:integration`, plus API docs lint/build and strict all-item OpenSpec validation; record platform/date/results, real migration coverage and rollback/sentinel outcomes, protected-byte checks, and any incomplete prerequisites before claiming implementation complete.

## 7. Real inbox delivery follow-up

- [x] 7.1 Replace the capture-only runtime default with Gmail configuration, fixed authenticated TLS SMTP, validated sender/App Password and exact trusted web origin; preserve explicit loopback capture and fail closed without Gmail configuration. Verify mode/configuration, TLS and sender-boundary tests without secrets in diagnostics.
- [x] 7.2 Share the current English text/HTML message across both transports and preserve the five-second canceling total deadline, two owned delivery slots, no queue/retry, generic HTTP acknowledgment, safe events and shutdown. Verify authenticated transport, certificate/hostname failure, rejected recipients, interrupted/stalled delivery and resource cleanup using owned fixtures, with no ordinary external sends.
- [x] 7.3 Add a Windows masked startup prompt that passes credentials only to the API process and restores its environment on exit; document Google setup, quota/failure recovery, recipient privacy, local-link reachability and explicit capture selection. Keep credentials out of files, shell history, browser bundles, logs and CI. Update API/service guides without changing HTTP behavior or CI/deployment/secrets infrastructure.
- [x] 7.4 Use the owner-designated sender and recipient to confirm actual real-inbox receipt, intact link/fragment, password-bound confirmation and fresh explicit sign-in/sign-out. Keep this task incomplete until receipt and the journey are observed; do not substitute SMTP acceptance, Sent copies or capture evidence.
- [ ] 7.5 Run final formatting/lint/types/unit/build/browser/smoke/guarded database/API-docs/OpenSpec gates, review protected files and exact delivery evidence, then deliver through the unchanged current-head PR helpers. Preserve the earlier PR/branch and record the actual follow-up PR/head/checks/merge. Do not claim the user's expanded task complete while 7.4 is missing.

## Workflow follow-up

- Stop after proposal review until the owner explicitly requests apply; planning alone
  authorizes no implementation or shared delivery.
- After approved implementation and validation, use the existing project delivery
  helpers and current-head quality/database gates on this focused feature branch.
  Retain branches and do not change CI, deployment, secrets handling, or protections
  to make delivery pass.
- Sync reviewed delta specifications and archive only after implementation and the
  applicable finalization instruction; preserve current Purpose/scenarios and report
  the actual PR, full head, checks, and confirmed merge result.
