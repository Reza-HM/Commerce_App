# Tasks

## 1. Browser API boundary and test foundation

- [x] 1.1 Add the public API-origin parser and fixed-path browser request module under `apps/web/src/accounts/`, with absent-only loopback default, registration credential omission, session credentials/header, no-store inspection, strict success decoding, safe error mapping, and a 15-second deadline; verify focused unit tests cover invalid origins, transport options, malformed responses, status mapping, timeout cleanup, and no automatic retry.
- [x] 1.2 Extend the serial Playwright setup with test-owned in-memory account/session repositories using the actual API runtime and registration hashing on loopback port 4174; set the public API origin before the web build in the root browser command, refuse port collisions, and verify startup/teardown works without PostgreSQL or private environment loading while the existing direct-session test remains valid.
- [x] 1.3 Create `docs/account-web-flow.md` and update foundation configuration instructions for `NEXT_PUBLIC_API_ORIGIN`, build-time selection, matching loopback hosts, exact `WEB_ORIGINS`, and cookie security; verify the documented public setup matches the browser fixture and no private environment setting or new API contract is introduced.

## 2. Public account pages and registration

- [x] 2.1 Add English localized route shells/titles, reusable accessible form presentation, and home-page registration/sign-in links using Tailwind and existing theme tokens; verify desktop/mobile browser checks preserve document language, main landmarks, security headers, no overflow, secret isolation, and public rendering with the API unavailable.
- [x] 2.2 Implement `/register` with required email/password input, password-policy guidance, paste/autocomplete support, show/hide, associated safe field errors, announced feedback, submission locking, and transient password cleanup; verify keyboard/focus tests, significant spaces/Unicode preservation, safe policy-code mapping, duplicate-click prevention, and password clearing after settled requests and restored navigation.
- [x] 2.3 Implement generic registration acceptance with a separate sign-in link and no automatic login/credential transfer; verify new and duplicate registrations produce equivalent UI and requests, a duplicate with another password preserves the original credential, and request failures/429/malformed responses never claim success or automatically retry.
- [x] 2.4 Document the registration browser behavior and limitations in the new web-flow guide and `docs/account-registration.md`; verify the wording preserves generic processing acknowledgment, separate sign-in, server-authoritative input policy, and deferred verification/recovery.

## 3. Sign-in and session-checked account page

- [x] 3.1 Implement `/sign-in` with current-password autocomplete, visibility control, generic credential errors, registration navigation, pending/retry feedback, and password cleanup without registration-only policy checks; verify both unknown-email and wrong-password responses have the same UI, 400/403/429/503/network/timeout failures are safe, and 201 navigates to account inspection rather than directly asserting authentication.
- [x] 3.2 Implement the `/account` checking/signed-in/unavailable states and fixed sign-in-required navigation on inspection 401; verify direct entry and rejected cookies never flash signed-in content, valid inspection exposes only a signed-in message/sign-out, and 403/503/network/malformed responses offer retry without claiming sign-out.
- [x] 3.3 Add entry, explicit-retry, hidden-to-visible and history-restoration checks with coalescing, cancellation and stale-result suppression; verify no timer/prefetch/background keepalive renews a session, returning to a revoked/expired fixture goes to sign-in, and delayed results cannot affect a departed route.
- [x] 3.4 Update `docs/account-sessions.md`, `docs/api/README.md`, and the web-flow guide with the implemented browser lifecycle and supported local setup; verify API endpoint/response descriptions still match the unchanged OpenAPI contract and that no verified-ownership/profile/launch-readiness claim is added.

## 4. Confirmed and uncertain sign-out

- [x] 4.1 Implement sign-out locking, inspection invalidation, confirmed-204 navigation, and an unconfirmed-revocation state that clears authenticated presentation and can retry DELETE without inspection; verify 204 for valid/missing sessions, revocation failure with cleared cookie, lost-response/timeout behavior, and late inspection/sign-out races.
- [x] 4.2 Document confirmed versus uncertain sign-out and user-triggered retry in the web-flow/session guides; verify a failed DELETE never produces a successful-revocation message and automatic foreground inspection cannot erase the uncertainty warning.

## 5. Complete journey and acceptance

- [x] 5.1 Verify the integrated registration-to-separate-sign-in-to-account-to-sign-out journey with actual HTTP/cookies, followed by inspection 401, at desktop/mobile sizes; include keyboard flow and confirm submitted synthetic credentials/session material are absent from URLs, application logs, browser storage and server-rendered artifacts, with existing private-marker scans preserved.
- [x] 5.2 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:smoke`, `npm run docs:api:lint`, `npm run docs:api:build`, and `npx --no-install openspec validate --all --strict --no-interactive`; record actual results in the web-flow guide, leave generated reference HTML ignored, and verify no API/schema/pipeline/deployment/secrets-handling changes slipped into scope.
- [x] 5.3 Run the existing `npm run test:integration` only on guarded `TEST_DATABASE_URL` and record replay/rollback/exact fixture cleanup/sentinel outcomes separately from browser doubles; do not reset any target or describe existing-target replay as fresh-install evidence, and leave acceptance incomplete if a required gate is unavailable.

## Workflow follow-up

- After separate implementation authorization, deliver this focused feature branch through the existing opening/merge helpers under the current project policy, announcing the actual head/PR metadata and requiring fresh successful quality/database checks and protection evidence. Retain feature branches.
- After implementation review/verification and authorization to finalize, sync the two delta specs and archive the change through the applicable OpenSpec workflows. Keep archive-dependent steps outside tracked implementation progress.
