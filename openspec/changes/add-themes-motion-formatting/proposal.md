# Proposal

## Why

The current interface only supports light surfaces and a limited entrance animation.
The owner requests complete dark mode, purposeful motion, and consistent readable
formatting across frontend and backend, delivered together on one branch.

## What Changes

- Add system, light, and dark appearance choices across all current pages; persist
  only the appearance preference and apply it before first paint.
- Use semantic theme tokens for surfaces, controls, feedback, and native widgets.
- Add short entrance, feedback, and action transitions with reduced-motion support.
- Adopt pinned Prettier with the supplied style, LF endings, and safe exclusions;
  format maintained frontend/backend code without changing migration bytes.
- Record theme, motion, and formatting conventions for future contributors.

## Capabilities

### New Capabilities

- `interface-preferences`: browser appearance preferences and accessible motion.

### Modified Capabilities

- `development-workspace`: reproducible source-formatting commands and boundaries.

## Impact

Web layouts, client theme control, theme tokens, browser tests, repository source
formatting, developer commands, and project guidance. Prettier is development-only.
No API contract, database migration, authentication, pipeline, or deployment change.
