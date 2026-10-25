# Tasks

All tasks are implementation work after proposal approval. None is complete merely because these planning artifacts exist. Live assertions require the operator-provided dedicated verified-TLS database described in `design.md`; missing prerequisites leave those tasks incomplete.

## 1. Test preflight and operator prerequisites

- [ ] 1.1 Require `NODE_ENV=test` in the existing test-target guard while preserving parser/TLS/limit behavior; extend `tests/unit/database.test.ts` and configuration tests to verify rejection of non-test modes, missing settings, plaintext/verification bypass, and URL TLS overrides with safe diagnostics.
- [ ] 1.2 Extend guard/command tests to cover matching runtime and migration identities despite case, trailing dots, loopback aliases, encoded database names, default ports, and different credentials. Verify an injected client factory is never called before successful preflight and missing/unsafe child-command configuration exits nonzero without secret values or fallback.
- [ ] 1.3 Update current operating instructions with private test configuration, certificate hostname/CA trust, restricted privileges, serial execution, alias limitations, and the historical waiver's limited scope. Verify documented commands/settings against the actual scripts and leave all unexecuted live results explicitly unverified; do not change archived foundation files or provision anything.

## 2. Real application migration path

- [ ] 2.1 Extract a script-level history-application helper shared by the explicit migration command and integration runner, keeping their distinct target validation outside it. Verify offline command/helper tests preserve explicit `MIGRATION_DATABASE_*` configuration, redacted errors, empty-history no-connect/no-DDL behavior, and failure propagation; application startup remains untouched.
- [ ] 2.2 Add live integration phases that read the repository's unchanged application history and invoke that helper twice on the guarded test target. Assert the current empty history creates no application/journal objects, reports zero migrations, and leaves the observed schema state unchanged; confirm this through a real verified-TLS run rather than doubles alone.
- [ ] 2.3 Add the non-empty-history replay branch without introducing application SQL: compare complete migration-entry and application schema-definition snapshots and verify no application statements repeat. Unit-test branch control/snapshot comparisons using technical history; document that actual non-empty application/fresh-install coverage becomes mandatory when registration supplies its migration and remains unclaimed now.
- [ ] 2.4 Document application versus technical migration ownership, retained test application history, and the empty-history limitation. Verify the integration summary distinguishes those phases and the operator migration command still has no runtime/test-target fallback.

## 3. Owned fixtures and independently checked cleanup

- [ ] 3.1 Add narrow test helpers for generated identifiers, exact object/record ownership manifests, temporary-directory ownership, dependency-ordered cleanup, and restrictive final schema removal. Verify offline tests reject unknown ownership/dependencies, never emit broad reset/truncate/unowned-cascade operations, and propagate cleanup errors while preserving the primary failure classification.
- [ ] 3.2 Add a coordinator-owned sentinel in a separate schema, recording its table definition and exact ordered IDs/payloads before worker activity. Verify a normal live worker removes only its fixtures, then independently assert fixture absence and identical sentinel definition/content before coordinator-only sentinel teardown.
- [ ] 3.3 Add a controlled worker failure after technical DDL and committed fixture writes. Verify its failure remains observable, its cleanup removes owned objects/records, sentinel preservation still passes, and clients/pools close. Unit-test that a cleanup/preservation error cannot be mistaken for the expected worker failure or converted to success.
- [ ] 3.4 Document exact fixture-key/ID tracking for future migrated application tables, retained application journals, normal versus forced-termination cleanup, and manual inspection of leftovers. Verify technical fixture tests demonstrate the ownership rules without adding an account model, sweeping by prefix, or using unrelated real data.

## 4. Live transaction and migration atomicity

- [ ] 4.1 Extend the technical transaction test with a committed write and a distinct forced rollback, then verify subsequent reads observe only committed data and a subsequent transaction succeeds. Pass these assertions against the dedicated TLS database; keep existing driver-contract tests passing without PostgreSQL.
- [ ] 4.2 Extend valid technical migration replay to assert exactly one expected effect and an unchanged complete migration journal after the second application. Verify temporary migration files remain outside repository application history and are removed only from the registered run-owned directory.
- [ ] 4.3 Add a failing pending technical migration with an insert and table creation before invalid SQL. Verify live rollback removes both effects, preserves prior committed fixtures/journal entries, adds no failed-migration entry, and allows a later operation; also assert a controlled failing child process returns nonzero with redacted diagnostics.
- [ ] 4.4 Update the integration command's phase summaries and operating notes to distinguish expected negative cases from unexpected failures, application replay from technical replay, and completed checks from remaining TLS-negative/pool-fault checks. Verify any unexpected assertion or cleanup failure makes the root command return nonzero.

## 5. Integrated acceptance and evidence

- [ ] 5.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, and `npm run test:smoke`; require exit 0 and verify these gates still run without PostgreSQL. Record exact results without treating them as live persistence coverage.
- [ ] 5.2 Confirm the operator has supplied the isolated target, trust configuration, applicable comparison connections, and restricted privileges without publishing secrets. Run `npm run test:integration` successfully with verified TLS; record date, platform, runtime/PostgreSQL versions, actual history coverage, rollback/replay results, and both sentinel cases. Leave this task incomplete if configuration or a passing live result is absent.
- [ ] 5.3 Run `openspec validate enable-account-persistence-validation --strict` and `openspec validate --specs --strict`; require exit 0. Review the complete implementation diff against every scenario, confirm no application/auth/schema feature, unrelated refactor, new dependency, CI/deploy edit, archived-history rewrite, TLS weakening, or unowned cleanup was introduced, and report any unverified checks explicitly.

## Workflow follow-up

- Stop after presenting the implementation for review; archiving and any shared Git actions follow the user's applicable approval rules.
- Continue with separate proposals in order: `add-account-registration`, `add-account-sessions`, then `add-account-web-flow`.
- Keep `add-email-verification` and `add-password-recovery` as separate required pre-launch follow-ups. No artifacts or implementation for those changes are part of this checklist.
