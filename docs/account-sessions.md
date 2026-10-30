# Account sessions

The local API accepts email/password sign-in only for verified accounts. Correct
credentials for an unverified account return verification-required feedback without
creating a session. Each successful sign-in creates an independent opaque session; only a
SHA-256 digest is stored. See [the API guide](api/README.md#account-sessions) for
the endpoints, cookie attributes, origin policy and local browser setup.

The database checks a 30-minute inactivity deadline and a fixed 12-hour absolute
deadline. An atomic conditional update renews activity only while the session is
unexpired and unrevoked. Sign-out revokes the presented session only. A request
already authorized before revocation can still finish. Neither cookies nor logs
expose a stored digest. No startup migration or automatic session cleanup occurs.

Sign-in uses the existing scrypt v1 credential and canonical identity; it does not
reapply registration's password blocklist. A fixed-cost dummy credential avoids a
cheap unknown-account path, without a claim of identical database or network
timing. Registration and sign-in share the two-operation per-process password-work
budget. Sign-in has a separate local peer budget; neither is a distributed limit.

The [verification flow](email-verification.md) permanently revokes pre-verification
sessions and requires registered-password confirmation followed by explicit sign-in.
Password recovery, external email, secure deployment,
shared abuse protection and a bounded expired-session retention policy remain
necessary before public deployment.

## Local validation evidence

On 2026-10-27, the guarded PostgreSQL 18.6 integration target contained existing
application history. The unchanged two-migration history replayed with
`freshInstall=false`; it was not reset. The suite verified transaction and failed
migration rollback, application replay, account sentinels, real session HTTP with
production-cost hashing, session idle and absolute expiry, revocation/renewal race,
session rollback, and independent session
sentinel preservation after successful and failing workers. Exact fixture IDs were
used for cleanup; the development database was not an automated test target.

Chromium on Windows successfully exercised sign-in, inspection and sign-out with
the Secure cookie on loopback. This is local browser evidence, not a claim about
other browsers, HTTPS deployment, public protection, or production capacity.

Local gates passed: lint, typecheck, 265 unit tests, production build, two
Chromium tests, five API process smoke checks, API documentation lint/build,
strict OpenSpec validation, and the guarded database suite described above.
GitHub CI and fresh-install evidence for this revision are pending delivery.

## Browser account pages

The [account browser flow](account-web-flow.md) provides sign-in, a minimal
session-checked account page and sign-out. Inspection is triggered by account
entry, explicit retry, foreground return and history restoration, with no periodic
renewal. A 401 directs the visitor to sign-in; outages show an unavailable state.
The UI displays neither the internal account ID nor a verified-ownership claim.

Confirmed DELETE 204 leads to a signed-out acknowledgment, including with no
usable cookie. A failed/lost response hides signed-in content but warns that
revocation is unconfirmed, with direct DELETE retry. Foreground inspection cannot
erase that warning: the API may clear the cookie while revocation fails. A late
inspection result cannot restore signed-in presentation after navigation/sign-out.
This is current-session sign-out, not a claim that all sessions or a previously
uncertain server row have been revoked. Existing expiry still bounds such rows.
