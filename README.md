# Commerce_App

Marketplace application foundation using Next.js, NestJS, PostgreSQL and Drizzle.
See [foundation setup and operating instructions](docs/foundation.md) for supported
versions, commands, configuration, validation limits and deferred functionality.

See [GitHub delivery](docs/github-delivery.md) for CI, tool prerequisites, and the
owner-authorized PR opening and merge commands.

See the [API reference](docs/api/README.md) for all current HTTP services,
request/response examples, and the version-controlled OpenAPI contract. Run
`npm run docs:api:build` to generate a browsable local HTML reference.

See [account registration](docs/account-registration.md) for the API-only
email/password contract, password policy, local resource limits, and live
persistence evidence. The [browser account flow](docs/account-web-flow.md) includes
[verified-only sessions](docs/account-sessions.md) and
[email verification with Gmail delivery](docs/email-verification.md) and
[password recovery](docs/password-recovery.md). Public deployment remains deferred.
Use `npm run dev:api:gmail` for masked sender
setup; real inbox acceptance is required separately from automated capture tests.
