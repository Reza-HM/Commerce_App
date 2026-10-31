# Proposal

## Why

People who forget their Commerce password cannot regain access, even when they control
the registered inbox. Registration, email verification, and Gmail delivery now provide
the foundation for a separate recovery journey without weakening verification or sessions.

## What Changes

- Add generic password-recovery requests and explicit token-bound password replacement.
  Support verified and unverified accounts, preserving their verification status.
- Deliver recovery links through the existing Gmail/capture transport. Use expiring,
  single-use, digest-only recovery challenges that cannot serve as verification or
  session credentials. Send a bounded notification after a committed reset.
- Apply the current new-password policy, atomically replace the credential, revoke all
  existing sessions, and invalidate outstanding recovery and verification challenges.
  Require explicit sign-in; unverified accounts must still complete email verification.
- Close the sign-in/reset race by rechecking the password proof during serialized
  session creation, so an old-password request cannot create a usable post-reset session.
- Add `/forgot-password` and `/reset-password`, recovery navigation from sign-in and
  verification, and accessible English feedback using the current account visual system.
- Document the HTTP contract and add isolated database, browser, mail, and real-inbox
  acceptance coverage. Keep public deployment and shared abuse protection deferred.

## Capabilities

### New Capabilities

- `password-recovery`: Request recovery mail, safely replace a forgotten password through
  mailbox proof, and complete the browser journey with bounded operational resources.

### Modified Capabilities

- `account-sessions`: Prevent stale password proofs from creating sessions across a reset
  and distinguish delivered recovery from remaining public-launch prerequisites.
- `account-web-flow`: Add recovery entry points, new-password input, transport protections,
  and transient recovery-secret handling while preserving existing account journeys.
- `email-verification`: Replace unavailable-recovery guidance with explicit recovery
  navigation and explain verification-link invalidation after password replacement.

## Impact

- API account services/controllers, runtime protections and shutdown wiring; database
  repositories, Drizzle schema, and one new explicit migration. Existing migrations remain
  unchanged; rollout preserves accounts, credentials, verification status, and sessions.
- Web account forms, public routes, API client, English resources, and existing theme and
  accessibility conventions. No authentication proxy or browser credential storage.
- Existing Gmail startup and fixed trusted-origin configuration, with separate mail
  content for verification, recovery, and reset notification. No new provider or secret.
- OpenAPI/HTTP contract coverage, service guides, owned fixtures, and acceptance tooling.
  No CI/deployment/protection changes or automatic development-database migration.
- This proposal authorizes planning only. Implementation and normal delivery await a
  subsequent instruction; no existing archived change is reopened.
