# Email verification handoff

The owner requested finalization and archive on 2026-10-30. Email verification and
real Gmail delivery are implemented and accepted. No next feature is approved.
Fetch and inspect Git/PR state before new work; branch from refreshed `origin/main`,
preserve retained branches, and leave local `main` alone.

## Completed delivery

- Initial verification implementation: [PR #14](https://github.com/Reza-HM/Commerce_App/pull/14),
  merged as `74434aff234273fba10e4fb9dcc8b5532e271d18`.
- Real Gmail delivery: [PR #15](https://github.com/Reza-HM/Commerce_App/pull/15), head
  `67fdb1762880ceaebc1d24d061b2904fc6639d15`, merged as
  `894f2fbd9224a18a5d4dce4d35f0a8c879b6f926` after successful required CI.
- Finalization: [PR #16](https://github.com/Reza-HM/Commerce_App/pull/16) on
  `docs/record-real-email-delivery`; query its current full head, checks and merge
  state instead of assuming an earlier head is current.

All 25 tasks are complete. The change is archived at
`openspec/changes/archive/2026-10-30-add-email-verification/`, preserving all eight
planning files byte for byte. Current registration, session and web-flow specs were
updated, and the email-verification spec was added. Existing Purpose sections and
unmentioned requirements/scenarios were preserved. No active changes remain.

## Runtime and evidence

Read [the verification guide](email-verification.md) for contracts, limits and dated
proof. Real Gmail Inbox receipt, intact received-link confirmation, no automatic
session, explicit sign-in/sign-out and exact guarded-test cleanup passed. Local gates
passed 305 unit tests, 31 main plus two localhost browser checks, six process smoke
cases, three unchanged migration replays, formatting/lint/types/build, API docs and
strict OpenSpec validation. PR #15 passed hosted `quality` and `database` checks.

Gmail is the default provider; capture requires explicit `MAIL_PROVIDER=capture`.
Use `npm run dev:api:gmail` for masked startup. Credentials stay in process memory;
never put them in chat, files, browser bundles or CI. A separately launched local API
was configured on port 3001; the web uses port 3000. Recheck readiness because local
processes can stop. Restarts require the private App Password again.

The development verification migration was explicitly applied after a private backup
under ignored `.local/`. Accounts/passwords and eight unverified-session rows were
preserved; the sessions were revoked as designed, with none usable before rollout.
Startup never migrates or resets data. Automated suites use only guarded test targets.
Keep generated `apps/web/next-env.d.ts` ignored and untracked.

Password recovery, secure public deployment, shared abuse protection, general session
retention and measured scale remain deferred. Loopback email links work only on the
computer serving the app. Wait for the owner's next instruction.
