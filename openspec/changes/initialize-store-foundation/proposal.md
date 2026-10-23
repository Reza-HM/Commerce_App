# Proposal

## Why

The repository contains Git and OpenSpec setup but no application runtime, development tooling, or database foundation. A small, reproducible technical baseline is needed before marketplace features can be implemented without mixing infrastructure decisions into business changes.

## What Changes

- Establish an npm workspace using TypeScript, a Next.js web application, a NestJS modular backend, and a server-only PostgreSQL/Drizzle package.
- Provide a minimal English web shell with localization structure, strict configuration validation, bounded database access, separate liveness/readiness probes, structured operational logs, and graceful API shutdown.
- Define dependency boundaries, root validation commands, local setup instructions, and a database migration workflow without creating business tables.
- Establish measurable security and scale prerequisites: server/client configuration separation, safe HTTP defaults, finite resource limits, independent API replicas, and documented connection budgeting and future capacity validation.
- Record the agreed future worker, pg-boss, search, storage, and PWA direction without installing or implementing those deferred capabilities.

This change proposes the foundation only. It does not add authentication, user roles or panels, seller approval, catalogs, inventory, search, cart, checkout, payments, messaging, auctions, shipping, subscriptions, or other business features. It does not provision hosting, add CI/CD or deployment pipelines, or claim support for a particular production user count. PWA installation, offline caching, additional translations, queue processing, and object-storage integration are deferred.

## Capabilities

### New Capabilities

- `development-workspace`: Reproducible TypeScript workspace, dependency boundaries, localized web bootstrap, and executable quality checks.
- `service-runtime`: Validated runtime configuration, safe HTTP behavior, operational probes, structured logs, and bounded shutdown.
- `database-foundation`: Server-only PostgreSQL/Drizzle access, bounded connections, and an explicit migration workflow without business schemas.

### Modified Capabilities

None. The project has no existing capability specifications.

## Impact

Implementation would introduce root package/tooling files, `apps/web`, `apps/api`, `packages/database`, tests, and foundation documentation. It would preserve the existing OpenSpec configuration and installed skills.

Expected runtime dependencies are limited to the selected frameworks and their required integrations, PostgreSQL access/Drizzle, localization, and configuration/logging/security support needed by the acceptance criteria. Development dependencies cover compilation, linting, migrations, and meaningful tests. PostgreSQL is the only external runtime service required by this change; an existing local or remote development instance is sufficient.

The present workflow creates planning artifacts only. Application implementation requires a subsequent explicit approval. Capacity beyond one million registered users remains a design objective to validate against a defined workload, infrastructure, and service-level targets in later changes.
