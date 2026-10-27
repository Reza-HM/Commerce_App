# Spec Delta

## Purpose

Make the existing local account API usable through an accessible browser journey
while preserving registration privacy and server-controlled session security.

## ADDED Requirements

### Requirement: Account entry points
The web application SHALL expose `/register`, `/sign-in`, and `/account`, with registration and sign-in links from `/`. Public pages MUST render without an available API or database. The account page MUST initially present a session-checking state without claiming authentication.

#### Scenario: Visitor discovers the account flow
- **WHEN** a visitor opens the home page with the API unavailable
- **THEN** the home page and its registration/sign-in links remain usable
- **AND** either form can render before a request is attempted

#### Scenario: Account page is opened directly
- **WHEN** a visitor loads `/account`
- **THEN** a neutral checking state appears until session inspection completes
- **AND** no signed-in message or account details appear before a valid result

### Requirement: Registration preserves generic acceptance
The registration form SHALL submit exactly email and password to the existing registration API. Every successful 202 MUST show the same generic processing acknowledgment and a separate sign-in link. It MUST NOT automatically sign in, disclose account existence, or claim account creation, verification, or email delivery.

#### Scenario: New and existing addresses are submitted
- **WHEN** registration returns 202 for either a new or existing address
- **THEN** both produce the same acknowledgment and sign-in action
- **AND** neither triggers a session-creation request or carries the password to sign-in

#### Scenario: Existing credentials are preserved
- **WHEN** an existing address is registered with a different acceptable password
- **THEN** acceptance remains generic
- **AND** a later explicit sign-in still requires the original credential

### Requirement: Password entry follows the API policies
Account forms SHALL preserve the entered password without trimming, case folding, or silent truncation. Registration MUST explain the 15-128 NFC code-point policy and weak-password screening. Both forms MUST support paste, password managers, and an accessible show/hide control. Sign-in MUST NOT enforce registration-only password-length or blocklist rules.

#### Scenario: A password has significant content
- **WHEN** a password contains outer spaces or Unicode characters
- **THEN** the entered value is sent unchanged for the API to validate and normalize
- **AND** a browser length restriction does not truncate or miscount it

#### Scenario: Existing credential differs from new-password policy
- **WHEN** the visitor submits a sign-in password outside the current registration length or screening rules
- **THEN** the form permits API authentication rather than applying new-password policy

### Requirement: Explicit sign-in establishes the browser journey
The sign-in form SHALL submit exactly email and password to the existing session API. After a 201 it MUST navigate to `/account`, where a successful session inspection is required before showing signed-in content. Unknown accounts and incorrect passwords MUST produce the same generic authentication message.

#### Scenario: Sign-in succeeds and the cookie works
- **WHEN** sign-in returns 201 and the subsequent inspection returns 200
- **THEN** the account page shows a signed-in message and sign-out action
- **AND** it displays no internal account ID, invented email/profile details, or verified-ownership claim

#### Scenario: Credentials are rejected or the cookie is unusable
- **WHEN** sign-in returns 401 or the following inspection returns 401
- **THEN** the visitor can sign in again without a persistent authenticated UI
- **AND** the credential error does not identify whether the email exists

### Requirement: Session absence differs from unavailability
The account page SHALL treat inspection 401 as absence of a valid session and send the visitor to `/sign-in` with a safe sign-in-required message. Network, timeout, malformed-response, 403, and server failures MUST show an unavailable state with explicit retry, without claiming sign-out or rendering signed-in content.

#### Scenario: A session expires or is revoked
- **WHEN** inspection returns 401 after entering or returning to the account page
- **THEN** the account page removes authenticated presentation and directs the visitor to sign-in

#### Scenario: Session status cannot be established
- **WHEN** inspection fails with a network error, timeout, 403, 503, or an invalid response
- **THEN** the page reports inability to check the session and offers retry
- **AND** it does not misrepresent the failure as invalid credentials or confirmed sign-out

### Requirement: Session checks reflect user activity
Session inspection SHALL run on account-page entry, explicit retry, and return to a previously hidden or browser-restored account page. The web application MUST NOT use periodic inspection, background keepalive, or navigation prefetch to renew sessions. Superseded or late responses MUST NOT restore signed-in presentation after sign-out or navigation.

#### Scenario: An account page is left unattended
- **WHEN** the visitor leaves it open without returning or requesting a check
- **THEN** the web application sends no periodic session-renewal requests
- **AND** the server remains authoritative for idle and absolute expiration

#### Scenario: Navigation races with session inspection
- **WHEN** an older inspection completes after sign-out or after leaving the account page
- **THEN** that result cannot restore signed-in presentation or redirect the newer page

### Requirement: Sign-out reports only confirmed outcomes
Sign-out SHALL call the existing current-session DELETE endpoint and treat 204 as confirmation, including when no usable session exists. It MUST then clear local authenticated presentation and navigate to sign-in. A failed or uncertain response MUST clear that presentation, explain that server revocation is unconfirmed, and offer explicit sign-out retry.

#### Scenario: Sign-out is confirmed
- **WHEN** DELETE returns 204
- **THEN** the visitor reaches sign-in and sees a signed-out acknowledgment
- **AND** subsequent account entry checks the session anew

#### Scenario: Revocation fails or its response is lost
- **WHEN** sign-out returns 503 or its outcome cannot be observed
- **THEN** the page does not claim successful server revocation or retain signed-in content
- **AND** retry remains available without first requiring successful inspection

### Requirement: Browser transport preserves existing API protections
Account requests SHALL target a configured public HTTP(S) API origin using fixed endpoint paths. Registration MUST omit credentials. All session requests MUST include credentials and `X-Commerce-Request: 1`; inspection MUST bypass browser response caching. The web MUST NOT read, copy, or weaken the HttpOnly session cookie, or introduce a web proxy for authentication.

#### Scenario: Registration and session requests cross origins
- **WHEN** forms use the supported allowed web origin and API origin
- **THEN** registration works with its existing non-credentialed CORS contract
- **AND** session requests use the browser cookie jar and existing credentialed CORS protections

#### Scenario: API-origin configuration is invalid
- **WHEN** the configured origin includes credentials, an unsupported scheme, path, query, or fragment
- **THEN** account actions show a safe configuration-unavailable state and send no credentials
- **AND** public page rendering remains available

### Requirement: Accessible localized forms
All account pages SHALL use English locale resources for interface text, route titles, and accessible names. Forms MUST provide persistent labels, appropriate autocomplete, visible keyboard focus, associated field errors, announced status changes, and usable desktop/mobile layouts without horizontal overflow. Password visibility controls MUST be keyboard operable and must not submit the form.

#### Scenario: A visitor uses keyboard and password-manager input
- **WHEN** the visitor completes either form without a pointer
- **THEN** inputs, password visibility, links, and submit actions are operable in a logical order
- **AND** errors and pending/success states are perceivable without relying on color

#### Scenario: Responsive account routes are inspected
- **WHEN** each route is opened at desktop and narrow mobile sizes
- **THEN** it has an English document language, descriptive title, one main landmark, and no horizontal overflow

### Requirement: Bounded safe request feedback
The web SHALL allow at most one pending submission per form or sign-out action, use a finite request deadline, and never automatically retry account requests. Known validation codes MUST map to safe localized messages; 429 MUST ask the visitor to wait, and other failures MUST offer appropriate explicit retry. Unexpected response content MUST NOT be rendered as trusted error text or success.

#### Scenario: Submission is repeated or times out
- **WHEN** a pending action is activated again or reaches its deadline
- **THEN** no concurrent duplicate submission starts and the pending state eventually ends
- **AND** a timeout explains that completion is unknown rather than proving rollback or success

#### Scenario: Admission or an unexpected response rejects the request
- **WHEN** the API returns 429, a known field error, or an unexpected status/body
- **THEN** the interface shows the corresponding safe wait, field, or generic failure message
- **AND** it neither automatically resubmits nor exposes raw server text

### Requirement: Transient browser credential handling
The web application SHALL keep submitted credentials only in transient form/request memory and clear password fields on completed submissions and route exit. It MUST NOT place credentials or session material in URLs, persistent browser storage, application logs, telemetry, or serialized server-rendered data. Session status MUST NOT be persisted as authoritative client authentication.

#### Scenario: A request completes or navigation leaves a form
- **WHEN** a submission settles or the visitor leaves the form
- **THEN** the web-owned password field is cleared and a later visit starts empty
- **AND** no credential is transferred through navigation or browser storage

#### Scenario: Browser output is inspected
- **WHEN** synthetic credentials and server-private markers are used during browser tests
- **THEN** application URLs, application logging, browser storage, and server-rendered artifacts contain no credential or private marker
- **AND** cookie values are never read into web application code
