# Design

## Context

See proposal.md. The app uses Next.js server-rendered shells, Tailwind v4 tokens,
client-side account requests, and a single English locale. Current surfaces force
light mode. Migration SQL and password-policy corpus bytes are checked by hashes.

## Goals / Non-Goals

**Goals:** consistent first paint, accessible preference controls, restrained motion,
readable source across web/API/scripts/tests, and durable contributor conventions.
**Non-Goals:** authentication changes, API endpoints, database work, animation
libraries, CI workflow changes, or formatting generated/historical records.

## Decisions

- Use semantic surface, text, action, and feedback tokens for both palettes; keep
  the dark illustration panel intentional. Tailwind handles component styling.
- A small static head bootstrap reads only commerce-theme (light/dark/system) and
  applies a resolved data-theme before body paint. Root hydration differences are
  explicitly limited to that attribute. CSS system fallback works without JS.
- An accessible native appearance select exposes all three choices. Browser
  media and storage listeners handle OS changes and other tabs. Storage exceptions
  are caught. No cookie, account API, or server-private configuration is involved.
- Use 180ms control transitions and 240-360ms entrance/feedback animations. Animate
  opacity/transform only, never add request delays. Disable with reduced motion.
- Use the supplied Prettier style with endOfLine=lf. Native parsers cover TS/TSX,
  JS/CJS/MJS, CSS, JSON, Markdown, and YAML; no SQL plugin is introduced. Preserve
  migrations, generated declarations/lockfile, corpus, archived specs, reusable
  generated skills, and CI workflows. Exclusions are documented. A local format
  check is included in lint; pipeline files and helper safety logic stay unchanged.

## Risks / Trade-offs

- Theme flashes/hydration mismatch -> bootstrap before body, CSS fallback, browser tests.
- Storage blocked -> in-memory selection and system fallback, no failed account flow.
- Low dark-mode contrast -> distinct text/action tokens and visual/browser review.
- Broad format diff -> separate formatting commit on the same requested branch;
  verify protected byte hashes, unit/contract tests, and full browser journeys.
- Static bootstrap and future CSP -> retain static script and document future hash/nonce need.

## Migration Plan

No data migration. Deploy web bundle normally; the only new browser state is a
non-sensitive appearance key. Revert the feature to restore prior styling.
