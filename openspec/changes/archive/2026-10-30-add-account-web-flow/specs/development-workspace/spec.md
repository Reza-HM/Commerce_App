# Spec Delta

## MODIFIED Requirements

### Requirement: English localized web shell

The web application SHALL serve a responsive foundation page with English as its default locale, a correct document language, a page title, and a main landmark. Its visible interface text MUST come from a locale message resource. The home page SHALL link to account registration and sign-in while remaining independent of API/database availability. Marketplace workflows, role panels, and installation/offline claims MUST NOT be exposed.

#### Scenario: Default page renders

- **WHEN** a visitor opens the root page in a production build at desktop and mobile viewport sizes
- **THEN** the English foundation page renders without horizontal overflow or browser errors
- **AND** its document language, title, and main landmark are present

#### Scenario: Account navigation does not require dependencies

- **WHEN** a visitor opens the home page while the API and database are unavailable
- **THEN** localized registration and sign-in links remain available
- **AND** following either link renders its form without a successful dependency check
