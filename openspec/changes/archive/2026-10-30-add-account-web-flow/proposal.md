# Proposal

## Why

Registration and revocable sessions are available through the API, but visitors
cannot use them from the web application. A focused browser journey will make
the existing local account milestone usable and testable before separate email
verification and password recovery changes.

## What Changes

- Add `/register` with email/password inputs, password guidance and visibility
  control, accessible validation, generic acceptance, and a separate sign-in link.
- Add `/sign-in` with safe authentication errors and navigation to registration.
- Add `/account` with a session-checked signed-in message and sign-out; do not
  display the internal account ID or invent unavailable profile information.
- Add registration and sign-in links to the independently rendered home page.
- Use the existing HTTP API directly from the browser, preserving its cookie,
  origin, input, registration-enumeration, and session-expiration contracts.
- Provide English localized, responsive, keyboard-accessible forms and explicit
  pending, retry, unavailable, unauthorized, and uncertain sign-out states.
- Add browser coverage for the complete journey and failure cases, and document
  public API-origin configuration and the supported loopback setup.

Profile editing, dashboards, marketplace workflows, automatic sign-in after
registration, email delivery/verification, password recovery, session management,
and public deployment remain outside this change. Verification and recovery are
still prerequisites for public launch. No new HTTP endpoints, database schema,
migrations, or runtime dependencies are planned.

## Capabilities

### New Capabilities

- `account-web-flow`: Browser registration, sign-in, a minimal session-checked
  account page, sign-out, accessible interaction, and API failure handling.

### Modified Capabilities

- `development-workspace`: Extend the English localized web shell to expose
  account navigation while preserving independent home rendering and excluding
  marketplace workflows and role panels.

## Impact

Implementation will affect `apps/web/app`, `apps/web/src`,
`apps/web/messages/en.json`, browser tests and their public configuration in
`playwright.config.ts` and `scripts/workspace.mjs`, and the foundation/account/API
guides. The existing Next.js, React, next-intl, Tailwind and Playwright stack is sufficient. Web code
will not import API internals or the database package. API routes and their
OpenAPI contract remain unchanged; the readable API guide will explain browser
use alongside a new account web-flow guide. Existing quality and guarded
database gates remain mandatory for implementation delivery, without pipeline,
deployment, protection, or secrets-handling changes.
