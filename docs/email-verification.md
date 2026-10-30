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

## Real Gmail delivery

Normal API mail delivery defaults to Gmail SMTP. No owned domain or Mailpit is needed.
Use a dedicated ordinary Gmail sender account where possible: recipients see that
address under the Commerce display name. Enable 2-Step Verification and create an
App Password named for this application through [Google App Passwords](https://myaccount.google.com/apppasswords).
Use that application credential, never your normal Google password. Some managed,
Advanced Protection or security-key-only accounts do not offer App Passwords;
follow [Google's eligibility guidance](https://support.google.com/accounts/answer/185833).
Do not disable account protections to bypass that restriction.

In a terminal at the repository root, run:

```text
npm run dev:api:gmail
```

The command prompts for the sender address and hides the App Password input. It
supplies credentials only to its API child process, never saves them to a file or
shell history, and leaves the parent environment unchanged. Start `npm run dev:web`
in another terminal. Existing explicit database setup/migration is still required;
this command neither migrates nor resets any database. The root `.env` loader remains
database-only. Do not paste credentials into chat or add them to a tracked file.

For operators supplying their own process environment:

| Setting                   | Policy                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MAIL_PROVIDER`           | `gmail` by default; `capture` only when explicitly selected                                                |
| `GMAIL_SMTP_USER`         | Sender's ordinary `gmail.com` account; outer whitespace/case normalized                                    |
| `GMAIL_SMTP_APP_PASSWORD` | Dedicated 16-letter Google App Password; display spaces accepted                                           |
| `VERIFICATION_WEB_ORIGIN` | Exact allowed `WEB_ORIGINS` entry: HTTPS or loopback HTTP; development defaults to `http://127.0.0.1:3000` |

Gmail uses only `smtp.gmail.com:465`, certificate/hostname verification and TLS 1.2
or newer. Credentials are sent only after the TLS handshake. From/envelope identity
is the configured sender, never the submitted recipient or request headers. Missing
Gmail credentials fail configuration before listening; there is no silent capture
fallback. Runtime auth/quota/network failures keep the existing generic acknowledgment
and fixed safe delivery-failure event. API startup does not contact Gmail or make mail
availability a readiness dependency. The two slots and canceling five-second total
deadline cover DNS/TCP/TLS/authentication and message transfer, without retries.

This is a small-volume sender. [Google's sending limits](https://support.google.com/mail/answer/22839)
and account restrictions apply; acceptance by Google's SMTP server does not guarantee
inbox placement. Check the recipient Inbox/Spam and use explicit resend after resolving
auth, quota or connectivity problems. A custom-domain transactional provider can replace
this transport when volume and branding justify it. No domain purchase, paid plan,
public hosting, CI secret or deployment change is included here.

Google and the recipient mailbox process the address and message, including its
short-lived verification link. Gmail may retain a Sent copy; mailbox security scanning
can inspect the link. Password-bound explicit confirmation prevents a GET/preview from
verifying the account. Application logs do not contain recipients, credentials, message
bodies, tokens, digests or raw provider errors. Passwords and session material are
never emailed. No application-authored tracking or third-party artwork is added.

A loopback link works only on the computer serving the app; receiving real email does
not publish the web app. For a remotely accessible app, configure its exact trusted
HTTPS web origin after separately arranging secure deployment. Do not replace a loopback
URL with an arbitrary Host/forwarded value or expose the development database/API.

## Explicit local capture for tests

Only `MAIL_PROVIDER=capture` selects the following Mailpit configuration. It is
optional for operators and is not evidence of real inbox delivery. Ordinary unit,
browser, smoke and guarded integration commands use isolated fixtures, never Gmail.

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

Non-development capture startup requires all three explicitly. Sender is fixed to
`Commerce <no-reply@commerce.test>`. No remote SMTP, auth, provider credentials, DNS
transport hosts, relay, or transport URL is supported. Loopback plaintext capture
does not disable general TLS validation or weaken session-cookie attributes.

For localhost web use, explicitly set `VERIFICATION_WEB_ORIGIN` to
`http://localhost:3000`; root `npm run dev:api` already allows both standard local
web origins when `WEB_ORIGINS` is absent. Follow the browser/API hostname setup in
[account web flow](account-web-flow.md). Public web config contains only the API
origin. The root private `.env` loader remains database-only; do not put mail settings
or tokens into browser configuration. Restart after changing process settings.

Start Mailpit independently, set `MAIL_PROVIDER=capture` in the API process, then
use `npm run dev:api` and `npm run dev:web`.
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

## Real inbox acceptance gate

Prepare the guarded test database through `npm run test:integration`, run
`npm run build`, and leave ports 4310/3001 free. Then run this explicit operator-only
command from an interactive terminal:

```text
npm run mail:gmail:accept
```

It privately prompts for sender/App Password and the owner-authorized recipient,
asks before sending one real registration verification message, and uses an isolated
browser with the normal production web build and compiled account runtime. It creates
only an exactly owned account on the guarded test target, never development data.
After Google accepts the message, confirm it arrived in the designated recipient
Inbox (not merely Sent), then paste its link into the hidden prompt. Copy the email's
link destination, not the already-cleaned browser URL. The command completes password
confirmation, checks no automatic session, then performs explicit sign-in/sign-out.
Only its owned server/browser/account and exact dependent rows are cleaned up.

A successful sanitized `.local/gmail-acceptance-*.json` records operator-confirmed receipt
and observed browser results without addresses, credentials or links. This command is
never run by automated tests or CI. It needs the local compiled app, Chromium and guarded
test configuration; ordinary TLS fixture tests also need OpenSSL (provided by Git for
Windows, or the normal system binary on Linux). Test keys are generated temporarily
per run and removed by exact filename; no private key is committed.

Real delivery requires a successful run with actual inbox receipt. A mock, Mailpit
message, Gmail Sent copy or SMTP 250 response cannot complete that gate. The earlier
capture acceptance below is historical evidence.

## Gmail follow-up validation: 2026-10-30

On Windows with Node 24.20.0, npm 12.2.0 and PostgreSQL 18.6, the follow-up passed
305 unit/contract tests across 31 suites, 31 main browser cases plus both localhost
checks, all six process smoke tests, guarded replay of three unchanged migrations,
formatting/lint/types/production build, API documentation lint/build and strict
validation of all nine OpenSpec items. Guarded database rollback, rollout, concurrent
verification and independent sentinel/owned-cleanup checks remained successful.

Owned TLS fixtures exercised authenticated SMTP, certificate and hostname rejection,
bad authentication, rejected recipients and cancellation during TLS handshake,
authentication and message transfer. The private terminal prompt accepted synthetic
input without echo. A separate unauthenticated connectivity probe to Google's fixed
SMTP endpoint verified its certificate and negotiated TLS 1.3; it sent no email.

Separate real acceptance completed at 16:56:48 UTC using the owner-authorized ordinary
Gmail sender and the same owner's recipient Inbox. The operator observed the message
under Gmail's Inbox label, captured its intact fragment link and completed the actual
password-bound confirmation, no-automatic-session check, explicit sign-in and sign-out.
The acceptance entry point used its owned production web server on port 4310 and API
on port 3001, the guarded test database, and exactly owned cleanup. The existing port-3000
development server was preserved. This proves real Gmail delivery to the designated
recipient; it does not promise placement for every address or availability beyond
Google's account limits.

The owner's delegated browser operator supplied the credential and received link through
a one-run, nonce-protected loopback handoff to the same acceptance entry point. Neither
value was written to a file or command line. That temporary handoff was closed after
success and is not an application route or committed tool. Its sanitized local report
records `smtpAccepted`, `inboxReceipt: operator-confirmed`, `receivedLinkConfirmed`,
`noAutomaticSession`, `explicitSignIn`, `signOut` and `ownedCleanup` as successful.
The credential is not persisted by the app: future API starts use the masked prompt
or an operator-supplied private process environment.

Existing migrations, policy assets, archives, skills, CI, delivery helpers and
database-only environment loading are unchanged.

## Initial capture acceptance: 2026-10-30 (PR #14)

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
