# Spec Delta

## MODIFIED Requirements

### Requirement: Future verification boundary

The email-verification boundary SHALL deny unverified account sign-in and session inspection. Existing unverified accounts MUST retain credentials and null verification timestamp until password-bound email confirmation, except token-authorized recovery can replace credentials only. Every pre-verification session MUST be permanently revoked, rather than hidden while its account is unverified. Other public-launch prerequisites MUST remain separate from local milestones.

#### Scenario: Verification is introduced later

- **WHEN** the email-verification change replaces the temporary unverified-account allowance
- **THEN** new session creation and inspection require a verified account
- **AND** existing unverified accounts must confirm their email and explicitly sign in again
- **AND** public launch remains gated on secure deployment, shared abuse protection, and the other documented prerequisites even after password recovery is delivered

#### Scenario: An old session is presented after verification

- **WHEN** an account with a pre-verification session later completes verification
- **THEN** that session still receives inspection 401 even if its cookie and ordinary expiry remain valid
- **AND** completing verification issues no replacement session and does not revive the old row

#### Scenario: An unverified account recovers its password

- **WHEN** a live recovery token authorizes password replacement for an unverified account
- **THEN** its verification timestamp stays null and no session is issued
- **AND** the new password still receives verification-required feedback until explicit email verification completes

## ADDED Requirements

### Requirement: Password-reset session boundary

Session creation SHALL atomically revalidate the exact credential proof used by sign-in while serializing with password reset. Every session created before reset commits MUST be revoked by that reset; a stale old-password proof MUST NOT create a session afterward. Stale proof MUST return generic 401 `invalid_credentials` without issuing a cookie. Already-authorized work need not be canceled.

#### Scenario: Reset commits before an old-password sign-in creates a session

- **WHEN** sign-in verifies a password and a recovery reset replaces it before session creation
- **THEN** creation rechecks the credential and returns generic 401 rather than issuing a usable new session
- **AND** no verification-required distinction is used for a stale proof

#### Scenario: Session creation commits before a reset

- **WHEN** sign-in creates a session before reset commits, including a delayed HTTP response
- **THEN** reset permanently revokes that session and later inspection returns 401
- **AND** a delayed cookie does not restore server-side access

#### Scenario: Renewal races with reset revocation

- **WHEN** activity renewal and password reset overlap
- **THEN** renewal cannot clear revocation or make an old session usable after reset commits
- **AND** a fresh explicit sign-in using the replacement password can create an independent session only when the account is verified
