# Spec Delta

## MODIFIED Requirements

### Requirement: Bounded resend lifecycle

Issuance SHALL allow at most one challenge per account per 60 seconds and at most three retained challenges per account. Expired challenges MUST be removed only for that account during issuance. Cooldown/cap suppression MUST retain generic 202. Issuing or failing to deliver another challenge MUST NOT invalidate an earlier unexpired link. Confirmation and successful password recovery MUST invalidate every outstanding verification challenge for that account.

#### Scenario: Resends race or delivery fails

- **WHEN** concurrent resend requests target one account or a later delivery fails
- **THEN** database-enforced serialization preserves the cooldown and three-challenge cap
- **AND** an earlier unexpired challenge remains usable until successful confirmation, successful password recovery, or its own expiry
- **AND** expired rows do not require a global cleanup worker to admit another eligible challenge

#### Scenario: Password recovery invalidates verification links

- **WHEN** password recovery commits for an unverified account with existing verification challenges
- **THEN** every old verification link returns the existing generic invalid-verification response
- **AND** recovery preserves the null verification timestamp
- **AND** explicit resend can issue a fresh challenge without waiting for invalidated rows' former cooldown

### Requirement: Explicit verification browser journey

The web SHALL provide `/verify-email/request` and `/verify-email`. Request acknowledgment MUST remain conditional and generic. Confirmation MUST require the registered password and an explicit submit, with success directing users to sign-in. Both routes MUST follow current English localization, theme, motion, accessibility, feedback, and finite-request conventions without depending on a live API to render. Verification MUST offer explicit navigation to the separate password-recovery journey.

#### Scenario: A visitor completes or retries the journey

- **WHEN** the visitor requests a message, follows its link, and confirms a matching password
- **THEN** the page announces verification success and offers explicit sign-in without automatically creating a session
- **AND** malformed/missing/expired/used links and failed confirmation provide safe feedback, resend navigation, and sign-in as appropriate
- **AND** an unknown registered password is not replaced through verification; a separate recovery link explains how to reset it

#### Scenario: Desktop, mobile, or keyboard is used

- **WHEN** new routes and email content are reviewed at desktop/mobile sizes in both appearances
- **THEN** persistent labels, password-manager/paste support, focus, announcements, contrast, and narrow-screen layout remain usable
- **AND** reduced-motion and blocked-storage behavior retain feedback without storing verification state

#### Scenario: A recovered account is still unverified

- **WHEN** a visitor returns after password recovery
- **THEN** guidance offers a fresh verification request and confirmation with the new password
- **AND** no password, recovery token, or email is passed in the navigation
- **AND** an invalid old verification link cannot imply that the password reset failed
