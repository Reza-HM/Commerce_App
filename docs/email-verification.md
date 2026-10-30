# Email verification

Registration creates an unverified account and makes a bounded initial email attempt.
Its 202 acknowledgment stays generic and never confirms account creation or delivery.
Duplicate registration preserves the original password and sends no new message.
Use `/verify-email/request` to request a message for an existing unverified account.
Unknown, verified, cooldown-limited and cap-limited addresses share the same response.

The message opens `/verify-email#token=...`. The browser removes the fragment before
interaction, keeps the token in transient memory, and asks for the registered password.
Only explicit confirmation changes account state. Opening, previewing or prefetching
the link cannot verify the account. Confirmation never changes the password or signs
the user in; use the separate sign-in action after success. If someone registered an
address with a password its owner does not know, this milestone cannot recover it.
Password recovery remains a separate prerequisite before public launch.

## Local captured email

Use Mailpit v1.32.0 from its
[official installation instructions](https://mailpit.axllent.org/docs/install/).
Run the Windows binary or container with SMTP bound only to `127.0.0.1:1025` and
the inbox UI only to `127.0.0.1:8025`. Do not use its default all-interface binding,
enable relays/releases, or point automated tests at a developer inbox. Use temporary,
bounded message storage and synthetic addresses. Mailpit capture proves local
delivery only; no external email service or deliverability is implemented.

After installing that pinned binary, run it with these explicit options (use its
full executable path if it is not on PATH):

```text
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --allowed-hosts localhost,127.0.0.1 --max 100 --max-age 1h --disable-version-check --block-remote-css-and-fonts
```

With no database option, Mailpit uses temporary local storage. Never add SMTP relay,
forwarding, webhook or release configuration; isolate inherited `MP_` settings too.

Supply these server-only settings in the API process environment:

| Setting                   | Development default     | Accepted value                                         |
| ------------------------- | ----------------------- | ------------------------------------------------------ |
| `MAIL_SMTP_HOST`          | `127.0.0.1`             | Literal loopback IPv4 or `::1`                         |
| `MAIL_SMTP_PORT`          | `1025`                  | Integer port 1-65535                                   |
| `VERIFICATION_WEB_ORIGIN` | `http://127.0.0.1:3000` | Exact loopback HTTP(S) origin present in `WEB_ORIGINS` |

Non-development API startup requires all three explicitly. Sender is fixed to
`Commerce <no-reply@commerce.test>`. No remote SMTP, auth, provider credentials, DNS
transport hosts, relay, or transport URL is supported. Loopback plaintext capture
does not disable general TLS validation or weaken session-cookie attributes.

For localhost web use, explicitly set `VERIFICATION_WEB_ORIGIN` to
`http://localhost:3000`; root `npm run dev:api` already allows both standard local
web origins when `WEB_ORIGINS` is absent. Follow the browser/API hostname setup in
[account web flow](account-web-flow.md). Public web config contains only the API
origin. The root private `.env` loader remains database-only; do not put mail settings
or tokens into browser configuration. Restart after changing process settings.

Start Mailpit independently, then use `npm run dev:api` and `npm run dev:web`.
Inspect messages in the loopback inbox. The API does not connect to SMTP at startup;
mail failure does not change database readiness or independent public-shell rendering.
No inbox URL or developer transport information appears in the product interface.
The self-contained HTML email uses small embedded/inline styles because mail clients
cannot load the app's Tailwind bundle; it includes a dark-appearance fallback and
loads no external images, fonts, artwork or tracking resources.

## Contracts and resource limits

The portable HTTP contract is [OpenAPI](api/openapi.json); see
[API operations](api/README.md#email-verification) for method/body/header examples.
Both verification routes require `X-Commerce-Request: 1`, exact trusted Origin when
present, non-credentialed JSON requests, no-store responses and server correlation.
They use no browser session or cookie. Body/parser limits retain the existing
400/413/415 behavior. Safe application errors never echo submitted values.

Tokens contain 32 random bytes, are canonical base64url, and expire 30 minutes after
issue. Only SHA-256 digests are stored. Issuance locks the account and permits one
challenge per 60 seconds and at most three retained challenges; expired rows for that
account are pruned during issuance. New sends do not invalidate old live links.
Successful confirmation atomically rechecks the credential and live token, verifies
the account, revokes every existing account session and deletes all its challenges.
Wrong passwords do not consume live links; replay and stale credential proofs fail.

Request and confirmation each have a five-parsed-attempt direct-peer window of
60 seconds and at most 1024 live peer buckets. They ignore forwarded identity.
Confirmation shares the two-slot password-work budget with registration/sign-in.
Issuance and SMTP have two separate slots with no waiting queue; SMTP has a canceling
five-second total deadline. Saturation is generic 503/Retry-After 1; peer exhaustion
is generic 429/positive Retry-After. Per-account suppression remains generic 202.
These process controls are local limits, not shared public abuse protection.

Messages are best effort after challenge commit. HTTP acknowledgment does not await
SMTP, claim capture/arrival, or promise durability across process failure. Initial
preparation/delivery failure after account commit preserves registration 202; explicit
request database failures return safe 503/500 rather than claiming success. SMTP
failure is observed only as fixed operational events with no recipient, password,
body, secret, digest or link. In-flight tasks remain owned through disconnect and
shutdown, which stops admission and drains work before pool closure.

## Existing accounts and sessions

Stop old API processes before explicitly applying the new migration. Startup never
migrates. The migration creates the challenge relation and permanently revokes
sessions linked to unverified accounts, preserving accounts, credentials and all
verified-account sessions. It never silently verifies an account. Existing users
request email confirmation, supply their registered password, and sign in anew.

Sign-in returns `verification_required` 403 only after the password matches an
unverified account. Unknown/wrong credentials remain generic 401. Session creation
and inspection enforce verification at the database boundary; old sessions remain
invalid even after the account later verifies. Sign-out keeps its existing semantics.

Repair operational problems forward while preserving the verified-only boundary.
Do not un-revoke sessions, restore the unverified-sign-in runtime, delete account data,
or rewrite migration history as an automatic rollback. Destructive recovery needs
separate operator review. Automated validation never migrates development data.

## Browser privacy and validation

Only the verification token has the approved link-fragment exception to the no-URL
credential rule. The confirmation route uses `no-referrer`, fixed destinations and no
third-party resources. Token/password state clears on route exit or history restore;
password clears after every settled attempt. Reloading after fragment removal requires
reopening the email. A lost confirmation response can follow a commit: the interface
offers explicit retry/resend/sign-in without claiming rollback or successful sign-out.
Application code cannot erase the original email or outside browser/extension records.

Run the existing lint, typecheck, unit, build, browser, local-origin, smoke, guarded
integration and API-docs commands. Automated SMTP fixtures are separate owned loopback
servers using synthetic mail and no private environment in unit/browser suites. Live
tests retain exact ownership, bounded connections, migration replay/rollback, separate
prior-schema rollout fixtures and independent sentinel preservation. Record actual
Mailpit delivery separately from these fixtures, and distinguish fresh installation
from replay on an existing dedicated test database. Missing live evidence remains an
incomplete acceptance gate.

## Implementation acceptance: 2026-10-30

Local acceptance used Windows, Node 24.20.0, npm 12.2.0 and PostgreSQL 18.6.
All 296 unit/HTTP-contract tests across 30 suites passed. Chromium passed 31 main
browser cases plus both localhost/default-origin checks. All six API process smoke
tests passed, including the hard shutdown deadline for blocked mail after HTTP 202.
API documentation lint/build and strict validation of all nine OpenSpec items passed.
Root formatting/format-check, lint, typecheck and production build also passed.

The guarded live suite replayed all three application migrations on the existing
dedicated test database (`freshInstall: false`). It proved digest storage, cooldown,
cap, expiry, concurrent issuance/confirmation, sibling invalidation, stale credential
rejection, atomic rollback, legacy-session revocation, real HTTP/SMTP and exact owned
cleanup. Independent sentinels survived successful and deliberately failing workers.
A separate run-created fresh test database applied all three migrations with
`freshInstall: true`; that owned database was removed after successful verification.
The separate prior-schema rollout fixture preserved verified-account sessions and
credentials while permanently revoking unverified-account sessions. No development
database was migrated or reset.

An isolated actual Mailpit v1.32.0 inbox and the normal compiled API/production web
entrypoints passed synthetic journeys on both `127.0.0.1` and `localhost`. Each proved
generic acknowledgment with SMTP down, explicit resend recovery, captured HTML link
navigation, registered-password confirmation, rejection of a legacy cookie, and fresh
explicit sign-in/sign-out. This evidence is separate from the automated SMTP doubles.
Only run-owned test accounts and their exact dependent rows were removed afterward;
the temporary inbox and owned child processes were closed.

Browser review covered light/dark desktop and 375px mobile layouts, the request,
confirmation and success states, keyboard/visibility controls, paste-compatible input,
current-password autocomplete, announced errors, preference persistence/system changes,
blocked storage and reduced motion. The confirmation form also remained usable without
horizontal scrolling at 200% CSS zoom on the narrow viewport. Captured HTML email was
reviewed in light/dark desktop/mobile rendering; its text alternative, expiry and link
content were checked through the owned SMTP fixture. Screenshots and generated API HTML
remain ignored under `.local/`, without committing inbox contents or secrets.

Existing migrations/snapshots, password-policy assets, archived changes, reusable
skills, CI workflows and delivery helpers are unchanged. `next-env.d.ts` remains
generated, ignored and untracked. The dependency audit reported no advisory for the
new pinned Nodemailer package; the existing Nest/multer high-severity and Jest/deepmerge
low-severity findings remain separate dependency-maintenance work. Local capture does
not establish external delivery, public abuse protection or password recovery.
