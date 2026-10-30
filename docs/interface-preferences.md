# Appearance, motion, and formatting

Every current page offers Appearance: System, Light, or Dark. The default follows
prefers-color-scheme; explicit choices override it and survive reload/navigation.
Other tabs update through the storage event. Only commerce-theme is persisted;
blocked storage degrades to a usable current-page selection. Public pages follow
system appearance through CSS even without JavaScript. The static bootstrap in
the document head restores appearance before body paint; a future stricter script
CSP must allow it through an approved hash/nonce. No account API or cookies are used.

Use semantic canvas/surface/ink/muted/outline/accent/action/danger theme tokens
from globals.css for new components. The artwork panel intentionally stays dark
in both palettes. Native selects and inputs inherit the resolved color scheme.

Motion supports orientation and feedback: short page entrances, state feedback,
arrow/pressed responses, and pending indicators. No animation delays requests,
repeats decoration, or moves layout. Reduced-motion disables animation, transitions,
and interaction movement while keeping progress/error text available. This policy
applies to all future pages; see AGENTS.md.

## Formatting

npm run format writes supported maintained source; npm run format:check checks
without writing and runs as part of npm run lint. Prettier is pinned locally.
The supplied style works for TypeScript/TSX, JavaScript/CJS/MJS, CSS, JSON, YAML,
and Markdown. JSON retains its required double quotes; language parsers handle
syntax instead of forcing JavaScript rules onto every file. LF endings agree
with .gitattributes across Windows and Linux.

.prettierignore protects SQL migrations and generated metadata, policy corpus,
lockfiles, generated declarations/builds, archived records, generated skills,
private/local files, and separately approved CI workflows. Prettier does not
natively format SQL; no SQL plugin is added to rewrite hashed migration history.
A formatting check is idempotent and never edits these protected bytes. No
formatter modifies database contents or applies migrations.

## Validation evidence

Validated on 2026-10-30 in Windows with the pinned Node/npm toolchain: formatting
check and Prettier debug-check, lint, types, 283 unit/contract tests, 23 main browser
tests, two localhost browser regressions, five API process smoke tests, API docs
lint/build, production builds, and strict validation of all eight OpenSpec items.
Reviewed dark desktop/mobile form screenshots and existing light-mode coverage.
Git diffs confirm protected paths unchanged; raw migration SQL and policy corpus
bytes match their Git blobs exactly. CI's isolated database job remains the live
persistence gate; these local checks do not use the development database.
