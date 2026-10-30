# Spec Delta

## MODIFIED Requirements

### Requirement: Account entry points

The web application SHALL expose `/register`, `/sign-in`, `/account`, `/verify-email/request`, and `/verify-email`, with registration and sign-in links from `/` and verification-request navigation from account forms. Public pages MUST render without an available API, database, or email service. The account page MUST initially present a session-checking state without claiming authentication.

#### Scenario: Visitor discovers the account flow

- **WHEN** a visitor opens the home page with the API unavailable
- **THEN** the home page and its registration/sign-in links remain usable
- **AND** either form and the verification-request route can render before a request is attempted

#### Scenario: Account page is opened directly

- **WHEN** a visitor loads `/account`
- **THEN** a neutral checking state appears until session inspection completes
- **AND** no signed-in message or account details appear before a valid result

#### Scenario: Verification pages are opened directly

- **WHEN** a visitor opens either verification route with dependencies unavailable
- **THEN** the localized page renders without claiming mail delivery, verification, or authentication
- **AND** confirmation without a usable fragment offers safe instructions and a resend link

### Requirement: Registration preserves generic acceptance

The registration form SHALL submit exactly email and password to the existing registration API. Every successful 202 MUST show the same generic processing acknowledgment, conditional verification instructions, a verification-request link, and a separate sign-in link. It MUST NOT automatically sign in, disclose account existence, or claim account creation, verification, or email delivery.

#### Scenario: New and existing addresses are submitted

- **WHEN** registration returns 202 for either a new or existing address
- **THEN** both produce the same acknowledgment, conditional verification guidance, resend navigation, and sign-in action
- **AND** neither triggers a session-creation request or carries the password to sign-in or verification

#### Scenario: Existing credentials are preserved

- **WHEN** an existing address is registered with a different acceptable password
- **THEN** acceptance remains generic
- **AND** email confirmation and a later explicit sign-in still require the original credential
- **AND** the UI never offers password replacement as part of verification

### Requirement: Explicit sign-in establishes the browser journey

The sign-in form SHALL submit exactly email and password to the existing session API. After a 201 it MUST navigate to `/account`, where a successful session inspection is required before showing signed-in content. Unknown accounts and incorrect passwords MUST produce the same generic authentication message. A recognized 403 `verification_required` MUST show verification guidance and explicit resend navigation without claiming sign-in or automatically sending mail.

#### Scenario: Sign-in succeeds and the cookie works

- **WHEN** sign-in returns 201 and the subsequent inspection returns 200
- **THEN** the account page shows a signed-in message and sign-out action
- **AND** it displays no internal account ID, invented email/profile details, or unsupported verified-identity claim

#### Scenario: Credentials are rejected or the cookie is unusable

- **WHEN** sign-in returns 401 or the following inspection returns 401
- **THEN** the visitor can sign in again without a persistent authenticated UI
- **AND** the credential error does not identify whether the email exists

#### Scenario: Correct credentials require email verification

- **WHEN** sign-in returns the exact supported 403 verification-required contract
- **THEN** the password is cleared and the interface explains that email confirmation is required
- **AND** the user can explicitly request another verification message
- **AND** generic origin/header 403 responses remain forbidden/unavailable feedback rather than being misrepresented as an unverified account

### Requirement: Browser transport preserves existing API protections

Account requests SHALL target a configured public HTTP(S) API origin using fixed endpoint paths. Registration and verification MUST omit credentials. All session requests MUST include credentials and `X-Commerce-Request: 1`; verification requests MUST also include that header, and inspection MUST bypass browser response caching. The web MUST NOT read, copy, or weaken the HttpOnly session cookie, or introduce a web proxy for authentication.

#### Scenario: Registration and session requests cross origins

- **WHEN** forms use the supported allowed web origin and API origin
- **THEN** registration works with its existing non-credentialed CORS contract
- **AND** session requests use the browser cookie jar and existing credentialed CORS protections
- **AND** verification requests use non-credentialed JSON POST with the required custom header and trusted-origin CORS permission

#### Scenario: API-origin configuration is invalid

- **WHEN** the configured origin includes credentials, an unsupported scheme, path, query, or fragment
- **THEN** account actions show a safe configuration-unavailable state and send no credentials
- **AND** public page rendering remains available

### Requirement: Transient browser credential handling

The web application SHALL keep submitted credentials only in transient form/request memory and clear password fields on completed submissions and route exit. Credentials and session material MUST NOT enter URLs, persistent browser storage, application logs, telemetry, or serialized server-rendered data, except for the short-lived email-verification secret in its incoming link fragment. That fragment MUST be removed before interaction; token memory MUST clear on route exit/history restoration. Session status MUST NOT be persisted as authoritative client authentication.

#### Scenario: A request completes or navigation leaves a form

- **WHEN** a submission settles or the visitor leaves the form
- **THEN** the web-owned password field is cleared and a later visit starts empty
- **AND** no password or session credential is transferred through navigation or browser storage
- **AND** a failed confirmation can retain its token in the current mounted page for explicit password retry, but never persist it or restore it after leaving

#### Scenario: Browser output is inspected

- **WHEN** synthetic credentials and server-private markers are used during browser tests
- **THEN** application URLs, application logging, browser storage, and server-rendered artifacts contain no password, session credential, or private marker
- **AND** the verification token is present only in its intended incoming email fragment and transient confirmation request/memory, then absent from the active URL
- **AND** cookie values are never read into web application code
