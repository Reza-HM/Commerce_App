# Spec Delta

## Purpose

Provide coherent browser appearance preferences and purposeful accessible motion across the public and account interface.

## ADDED Requirements

### Requirement: System and explicit appearance

The web SHALL provide keyboard-accessible System, Light, and Dark choices on all current pages. An absent or invalid preference MUST follow the system. An explicit choice MUST persist across navigation and reloads when storage is available. Theme preference MUST NOT contain account or session material.

#### Scenario: System preference changes

- **WHEN** System is selected and the operating-system appearance changes
- **THEN** the interface follows it without reloading

#### Scenario: Explicit choice is restored

- **WHEN** a visitor chooses Dark then reloads or navigates to another page
- **THEN** Dark remains selected regardless of the system appearance

#### Scenario: Storage cannot be used

- **WHEN** reading or writing browser storage fails
- **THEN** pages remain usable and appearance can still be changed for the current page

### Requirement: Consistent first paint and controls

The web SHALL apply the resolved appearance before first paint when JavaScript is available. Surfaces, typography, form controls, feedback, and native widgets MUST remain readable in both themes. Public pages MUST remain usable without JavaScript, following system appearance.

#### Scenario: Dark page loads

- **WHEN** a dark preference is restored before hydration
- **THEN** the initial page uses dark surfaces without a light-theme flash

### Requirement: Purposeful motion

The web SHALL use brief entrance and feedback motion and bounded interaction transitions. It MUST respect reduced-motion preferences, keep focus and feedback perceivable, avoid layout-shifting animation, and avoid repeating decorative motion or artificial action delays.

#### Scenario: Reduced motion is requested

- **WHEN** the visitor enables reduced motion
- **THEN** entrance and feedback movement and interaction transforms are disabled while status text remains available
