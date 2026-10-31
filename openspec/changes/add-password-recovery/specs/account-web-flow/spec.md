# Spec Delta

## MODIFIED Requirements

### Requirement: Account entry points

The web application SHALL expose `/register`, `/sign-in`, `/account`, `/verify-email/request`, `/verify-email`, `/forgot-password`, and `/reset-password`, with registration and sign-in links from `/`, verification-request navigation from account forms, and recovery navigation from sign-in and verification. Public pages MUST render without an available API, database, or email service. The account page MUST initially present a session-checking state without claiming authentication.

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

#### Scenario: A visitor needs password recovery

- **WHEN** sign-in or verification is opened without a remembered password
- **THEN** an explicit link opens `/forgot-password` without passing credentials or account identity
- **AND** both recovery pages render with dependencies unavailable; reset without a usable fragment offers a fresh request and sign-in

### Requirement: Registration preserves generic acceptance

The registration form SHALL submit exactly email and password to the existing registration API. Every successful 202 MUST show the same generic processing acknowledgment, conditional verification instructions, a verification-request link, and a separate sign-in link. It MUST NOT automatically sign in, disclose account existence, or claim account creation, verification, or email delivery.

#### Scenario: New and existing addresses are submitted

- **WHEN** registration returns 202 for either a new or existing address
- **THEN** both produce the same acknowledgment, conditional verification guidance, resend navigation, and sign-in action
- **AND** neither triggers a session-creation request or carries the password to sign-in or verification

#### Scenario: Existing credentials are preserved

- **WHEN** an existing address is registered with a different acceptable password
- **THEN** acceptance remains generic
- **AND** email confirmation and a later explicit sign-in still require the original credential unless a separate authorized recovery replaces it
- **AND** the UI never offers password replacement as part of registration or verification; recovery has a separate explicit journey

### Requirement: Password entry follows the API policies

Account forms SHALL preserve the entered password without trimming, case folding, or silent truncation. Registration and recovery MUST explain the 15-128 NFC code-point policy and weak-password screening. Password forms MUST support paste, password managers, and an accessible show/hide control. Sign-in and verification MUST NOT enforce registration-only password-length or blocklist rules. Recovery MUST provide a new-password confirmation field.

#### Scenario: A password has significant content

- **WHEN** a password contains outer spaces or Unicode characters
- **THEN** the entered value is sent unchanged for the API to validate and normalize
- **AND** a browser length restriction does not truncate or miscount it

#### Scenario: Existing credential differs from new-password policy

- **WHEN** the visitor submits a sign-in password outside the current registration length or screening rules
- **THEN** the form permits API authentication rather than applying new-password policy

#### Scenario: Recovery password entries disagree

- **WHEN** new-password and confirmation entries differ after NFC normalization
- **THEN** associated local feedback is announced and no API request is made
- **AND** both inputs use `autocomplete="new-password"`; the confirmation entry is never sent to the API

### Requirement: Browser transport preserves existing API protections

Account requests SHALL target a configured public HTTP(S) API origin using fixed endpoint paths. Registration, verification, and recovery MUST omit credentials. All session requests MUST include credentials and `X-Commerce-Request: 1`; verification and recovery requests MUST also include that header, and inspection MUST bypass browser response caching. The web MUST NOT read, copy, or weaken the HttpOnly session cookie, or introduce a web proxy for authentication.

#### Scenario: Registration and session requests cross origins

- **WHEN** forms use the supported allowed web origin and API origin
- **THEN** registration works with its existing non-credentialed CORS contract
- **AND** session requests use the browser cookie jar and existing credentialed CORS protections
- **AND** verification and recovery requests use non-credentialed JSON POST with the required custom header and trusted-origin CORS permission

#### Scenario: API-origin configuration is invalid

- **WHEN** the configured origin includes credentials, an unsupported scheme, path, query, or fragment
- **THEN** account actions show a safe configuration-unavailable state and send no credentials
- **AND** public page rendering remains available

### Requirement: Transient browser credential handling

The web application SHALL keep submitted credentials only in transient form/request memory and clear password fields on completed submissions and route exit. Credentials and session material MUST NOT enter URLs, persistent browser storage, application logs, telemetry, or serialized server-rendered data, except for incoming verification/recovery link fragments. Those fragments MUST be removed before interaction; token memory MUST clear on route exit/history restoration.

#### Scenario: A request completes or navigation leaves a form

- **WHEN** a submission settles or the visitor leaves the form
- **THEN** the web-owned password fields are cleared and a later visit starts empty
- **AND** no password or session credential is transferred through navigation or browser storage
- **AND** failed confirmation can retain its token in the current mounted page for explicit password retry, but never persist it or restore it after leaving
- **AND** successful recovery clears the token and both new-password fields without transferring them to sign-in or verification

#### Scenario: Browser output is inspected

- **WHEN** synthetic credentials and server-private markers are used during browser tests
- **THEN** application URLs, application logging, browser storage, and server-rendered artifacts contain no password, session credential, or private marker
- **AND** verification and recovery tokens are present only in their intended incoming email fragments and transient confirmation requests/memory, then absent from the active URL
- **AND** cookie values are never read into web application code
- **AND** Session status MUST NOT be persisted as authoritative client authentication.
