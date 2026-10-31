# Tasks

The owner approved implementation on 2026-10-31. Checkboxes record completed behavior and
evidence; unchecked tasks remain acceptance gates. See `design.md` and the four delta
specs for decisions and acceptance contracts.

## 1. Recovery storage and atomic repository operations

- [x] 1.1 Add the recovery table, Drizzle export, next explicit migration, and generated
      metadata; verify digest uniqueness, foreign key, expiry constraint, account index, and
      that all earlier migration bytes remain unchanged.
- [x] 1.2 Implement account-serialized issuance and live-proof lookup with repository tests;
      verify canonical identity, unknown-account required-schema checks, digest-only storage,
      expiry, 60-second cooldown, three-challenge cap, and preservation of earlier live links.
- [x] 1.3 Implement credential-proof revalidation and atomic replacement/revocation/challenge
      invalidation; verify unit repository tests plus guarded PostgreSQL tests for one-time
      consumption, two-link races, verification preservation, and rollback at mutation boundaries.
- [x] 1.4 Extend owned fixture accounting and independent sentinels to recovery rows; verify
      exact-ID cleanup after successful/failing workers, rollout preservation, fresh installation
      on a confirmed fresh test target, and unchanged replay on an existing guarded target.
- [x] 1.5 Start `docs/password-recovery.md` with implemented storage, lifecycle, explicit
      migration, and test-ownership behavior; verify it matches migration/repository results and
      distinguishes fresh installation, replay, and still-pending acceptance evidence.

## 2. Password proof and session concurrency

- [x] 2.1 Make session creation lock account then credential and recheck the verified hash;
      verify service/repository/HTTP tests return generic 401 with no cookie for stale proof
      while preserving existing verified success and unverified 403 behavior.
- [x] 2.2 Align verification confirmation with the common account-then-credential lock order;
      verify existing verification tests plus guarded races where reset wins and where
      verification wins, preserving the authoritative verification state and rejecting stale proof.
- [x] 2.3 Add controlled real-database sign-in/reset/renewal races; verify sessions inserted
      first are revoked, reset-first stale sign-in cannot insert a usable session, delayed
      cookies cannot restore access, and renewal cannot undo revocation.
- [x] 2.4 Update session and verification guides for reset effects, fresh verification links,
      and remaining launch prerequisites; verify claims against the concurrency results and
      keep existing expiry, independent-session, and sign-out contracts intact.

## 3. Password policy, bounded mail, and HTTP recovery

- [x] 3.1 Extract reusable policy checks and share the checked password corpus without
      changing registration/sign-in behavior; verify policy regression tests plus recovery
      Unicode, NFC, significant-space, byte/length, blocklist, and bound-identity cases.
- [x] 3.2 Separate SMTP transport from purpose-specific messages and introduce shared
      verification/recovery/notification capacity; verify capture and Gmail transport tests
      cover unchanged startup/configuration, exact link origin/fragment, five-second cancellation,
      two total mail slots, no queue, safe diagnostics, and notification suppression/failure.
- [x] 3.3 Implement recovery request/confirmation service and post-commit notification;
      verify service tests cover generic address handling, policy retry without token consumption,
      shared password capacity, commit authority, disconnects, and no automatic session/mail retry.
- [x] 3.4 Wire controllers, runtime security/error mapping, startup, and shutdown; verify
      HTTP tests cover exact success/error shapes, parser limits, custom header, Origin/CORS,
      no-store/nosniff/correlation, missing schema/outages, privacy markers, and real work drain.
- [x] 3.5 Update OpenAPI, API README, route/HTTP contract checks, and the recovery guide in
      the same implementation step; verify `npm run docs:api:lint`, focused contract tests,
      and `npm run docs:api:build`, keeping generated HTML ignored.

## 4. Browser journey and visual acceptance

- [x] 4.1 Extend the account API client with exact recovery contracts and safe localized
      errors; verify client tests cover fixed paths, credential omission, custom header,
      finite deadline, cancellation, malformed success, policy feedback, and generic failures.
- [x] 4.2 Add localized `/forgot-password` and `/reset-password` pages in the account shell,
      two new-password inputs, and sign-in/verification navigation; verify browser tests for
      dependency-free rendering, conditional acknowledgment, normalized confirmation matching,
      password-manager/paste support, policy errors, success, and explicit sign-in/resend actions.
- [x] 4.3 Implement recovery fragment capture/scrubbing and transient field/request lifecycle;
      verify browser tests for Strict Mode, hash changes, route exit, history restoration,
      reload, no GET/prefetch mutation, no-referrer, and no leaked synthetic secrets in application
      URLs, storage, requests outside confirmation, logs, or server-rendered output.
- [x] 4.4 Add isolated capture journeys for verified recovery with old-session rejection and
      unverified recovery followed by fresh verification; verify expired/used/invalid links,
      mismatches, unavailable API, 429/503, late responses, and uncertain commit feedback.
- [x] 4.5 Review actual desktop/mobile page and email rendering in both themes, keyboard
      operation, focus/announcements, zoom/narrow layout, reduced motion, appearance persistence,
      system appearance changes, and blocked storage; record results and update the browser
      flow/recovery guides with accurate user-facing instructions.

## 5. Integrated acceptance and review readiness

- [x] 5.1 Add a guarded recovery Gmail acceptance command or isolated mode using existing
      private prompt/fixture conventions; verify refusal guards and synthetic tests before any
      real send, with no credentials or received-link secrets printed, saved, or committed.
- [ ] 5.2 With designated-recipient authorization and privately supplied credentials, prove
      actual recovery Inbox receipt, intact-link reset, notification Inbox receipt, no automatic
      session, rejected old password/sessions, and explicit new-password sign-in; record dated
      evidence and exact owned-test cleanup without treating SMTP/capture as receipt proof.
- [x] 5.3 Run the candidate's required formatting, lint, typecheck, unit, build, API docs,
      browser, smoke, guarded integration, and strict OpenSpec gates; verify the unchanged
      registration/verification/session journeys and report unavailable live prerequisites as
      incomplete rather than substituting development targets or external mail in CI.
- [x] 5.4 Reconcile README/service-guide completion claims and the proposal's four deltas
      with the implemented result; verify no unsupported launch claim, archive edit, generated
      `next-env.d.ts`, private configuration, or unrelated pipeline/delivery change enters the PR.

## Workflow follow-up

- After implementation is explicitly requested, keep its commits and any authorized normal
  delivery on this same focused branch/PR; preserve all helper and protection checks.
- Once implementation and acceptance are complete, sync the four capability deltas, validate
  the current specs, and archive when authorized, keeping completion in the same PR when
  possible. Preserve archived artifact bytes and retained branches.
- Report actual commit/PR/head/check/merge evidence for delivery. The subsequent implementation
  approval authorizes normal delivery under the project policy.
