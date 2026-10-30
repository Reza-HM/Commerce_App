# Spec Delta

## MODIFIED Requirements

### Requirement: Registration request contract

The API SHALL accept unauthenticated `POST /accounts/register` with a JSON object containing exactly string fields `email` and `password`. Missing, unknown, or incorrectly typed fields MUST return 400 before hashing or account persistence. Registration MUST NOT create sessions, return authentication credentials, or grant administrative or business approval authority. A newly committed account MUST trigger the bounded initial email-verification attempt without returning its challenge secret through the API.

#### Scenario: Valid ordinary registration

- **WHEN** an admitted request supplies a valid email and password for a new address
- **THEN** one unverified ordinary account and its password credential are committed
- **AND** there is no cookie, authentication token, session, admin grant, or business approval
- **AND** a separate password-bound email challenge is eligible for the configured real delivery

#### Scenario: Invalid shape or attempted privilege assignment

- **WHEN** the body is absent, null, an array, or contains missing/non-string fields or extra fields such as `role`, `isAdmin`, `emailVerifiedAt`, or `storeApproved`
- **THEN** the response is 400 and no password hash or account write is attempted
- **AND** submitted values are not echoed in the response or logs

### Requirement: Enumeration-resistant acceptance

New and duplicate valid registrations SHALL return HTTP 202 with exactly `{"status":"accepted","message":"Registration request processed."}` after account/credential database work succeeds. Responses MUST NOT reveal an account ID, email, existence flag, Location header, or claim that email was sent. Both paths MUST perform the same password hashing work without a duplicate-email precheck. All registration responses MUST be no-store and retain server-owned request correlation. Initial email-verification failure or suppression after commit MUST NOT change this acceptance contract or replace any credential.

#### Scenario: Accepted new and duplicate responses are compared

- **WHEN** valid new, existing, and concurrently conflicting submissions complete normally
- **THEN** status, body, and application headers match apart from server-generated correlation and transport metadata
- **AND** no 201/409 distinction, duplicate-specific field, cookie, or authentication token appears
- **AND** tests verify equal expensive-work paths without claiming perfectly constant network/database timing

#### Scenario: Delivery fails after account commit

- **WHEN** initial challenge preparation or SMTP delivery fails after the account and credential committed
- **THEN** the response remains the same generic 202 without claiming mail delivery
- **AND** the account remains unverified, its password is unchanged, and explicit resend is available
- **AND** a duplicate registration neither sends another message nor consumes the resend path's account cooldown
