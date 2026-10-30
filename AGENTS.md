# Project conventions

## Frontend styling

- Use Tailwind CSS utilities as the primary styling approach for all frontend UI.
- Use plain CSS only when Tailwind utilities and theme configuration cannot
  express the requirement clearly. Keep such CSS small and scoped, and explain
  the reason for the exception.
- Keep shared visual tokens in the Tailwind theme in `apps/web/app/globals.css`.
- Prefer complete, statically detectable utility classes over dynamically
  constructed class names. Preserve responsive behavior and accessibility.

## Product quality and design direction

- The owner requires a premium, contemporary interface with distinctive visual
  direction, professional execution, and considered detail throughout the project.
  Treat the current redesign as a baseline to improve, not a finished design ceiling.
- Plan typography, spacing, color, hierarchy, artwork, and responsive composition
  as one coherent system. Avoid default-looking forms and generic dashboard layouts.
- Attend to the full interaction: correct pointer/text/wait/disabled cursors,
  keyboard focus, hover/active/pending/error/success states, useful feedback,
  touch targets, autofill, password managers, and navigation continuity.
- Motion must respect reduced-motion preferences. Maintain readable contrast,
  persistent labels, announced feedback, zoom support, and narrow-screen usability.
- Verify real desktop and mobile rendering, keyboard use, and complete browser
  journeys. Decorative polish must preserve privacy, security, performance, and
  honest product claims; never invent unavailable features or account data.
- Apply the same care to backend correctness and operational behavior. Preserve
  server authority, safe failure states, explicit contracts, and meaningful tests.

## OpenSpec and Git

- Keep OpenSpec configuration and the repository's reusable OpenSpec skills in
  version control so contributors receive the same workflow after cloning.
- Normally use one short-lived feature branch and one PR per OpenSpec change,
  keeping planning, implementation, validation, and archive records together.
- Small implementation refactors that preserve specification behavior do not
  require rewriting an archived change. Update current conventions where needed.
- The automatic delivery policy below overrides the global per-action delivery
  approval rules; all other Git safety rules remain in force.

## API documentation

- Document every added, changed, or removed HTTP API in the same PR as its
  implementation. Keep `docs/api/openapi.json` and `docs/api/README.md` aligned
  with the actual routes, methods, authentication, input policies, response/error
  schemas, headers, examples, resource limits, and side effects.
- OpenAPI is the portable HTTP contract; keep operational/design explanations in
  the linked service guides. Document current behavior and clearly identify
  deferred features. Use only synthetic examples and public local server URLs.
- Run `npm run docs:api:lint`, `npm test`, and `npm run docs:api:build` for API
  documentation changes. Route coverage and HTTP contract checks run in the
  existing unit-test/PR quality gate; update those checks alongside API changes.
- Keep generated HTML in ignored `.local/`, not version control. Documentation
  tooling must not require a database, load private environment files, or add
  public documentation routes to the application without a separate decision.

## Automatic PR delivery

The owner approved this project-specific policy on 2026-10-26:

- Approval to implement a change also authorizes its normal delivery: commit
  completed logical work, push its feature branch, open its PR, wait for the
  required tests/reviews, and squash-merge through the existing delivery helpers.
  Do not ask for separate push, PR-opening, or merge confirmation each time.
- Honor narrower instructions such as planning-only, local-only, draft-only,
  stop-before-merge, or a specifically limited revision. Ask when scope or actual
  authorization is missing, not merely because delivery has reached its next step.
- Before shared-state actions, announce the branch/commits, PR title/description,
  and merge target as applicable. Record the actual PR number and full head SHA;
  use `npm run pr:open` and `npm run pr:merge` as documented in
  `docs/github-delivery.md`. Keep one focused feature branch/PR per change.
- Merge only when the helpers verify the current head/base, required successful
  `quality` and `database` CI plus any additional required checks, resolved
  conversations/reviews, and enforced repository protection. Never count skipped,
  stale, cancelled, ambiguous, or missing tests as success.
- Fix failures within the approved scope through normal tested commits and let
  new PR CI run. Such fixes do not require renewed delivery approval. A changed
  head/base invalidates the previous helper invocation and check evidence:
  inspect/revalidate it and use a fresh invocation with the recorded current head.
  Unexpected or out-of-scope commits require review before proceeding.
- Do not change the helper safety checks, CI write permissions, repository
  protection, deployment, or secrets handling to make delivery succeed. Pipeline
  changes still require approval of their concrete summary before committing.
- No force push, protected-branch push, branch deletion, unmerged-PR closing,
  published-history rewrite, hook bypass, discarded work, or Git configuration
  changes are authorized by this policy. Reconcile uncertain mutations read-only;
  never blindly retry a merge or arm deferred native auto-merge.
- Report the PR link, CI result, confirmed merge commit, current branch, and any
  remaining limitation. Retain feature branches after merging.
