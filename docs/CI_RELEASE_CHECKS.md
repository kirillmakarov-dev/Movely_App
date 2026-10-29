# Release checks

`.github/workflows/release-checks.yml` runs on pushes, pull requests and manual dispatch. It does not deploy the site or API.

## Web job

- Node from `apps/web/.nvmrc` (24.22.2), npm 11.21.1.
- Clean dependency install from the lockfile, npm audit (high/critical fail), lint, all Vitest tests, Next production build and Sites build.
- Generated `dist` is not a source artifact. Build it from the exact commit being released.

## API and PostgreSQL job

- .NET SDK 10.0.402 selected by a CI-local global.json; this does not change the developer machine SDK.
- NuGet audits direct and transitive dependencies. Known vulnerability warnings are errors via Directory.Build.props.
- Ordinary API tests and PostgreSQL tests run in separate steps. PostgreSQL 17 is an isolated service container using a disposable test-only password, without production secrets.
- Each PostgreSQL fixture creates a randomly named test database, applies all EF migrations, and removes only that database at teardown. Tests cover persisted identity data, relational constraints, versioned consents and transaction rollback when saving consent fails.
- `MOVELY_REQUIRE_POSTGRES_TESTS=true` makes a missing connection fail initialization instead of silently skipping the database suite.
- The last step publishes the API into the runner temporary directory. Passing CI is not deployment proof.

## Local checks

Use Node 24.15+ (recommended version in .nvmrc) and npm 11.21.1 for web commands in apps/web: `npm ci`, `npm audit --audit-level=high`, `npm run lint`, `npm test`, `npm run build`, `npm run build:sites`.

For API tests without PostgreSQL, run `dotnet test tests/api/Movely.Api.Tests/Movely.Api.Tests.csproj --filter "Category!=PostgreSqlIntegration"` from the repository root.

For the database suite, set `MOVELY_TEST_POSTGRES_CONNECTION_STRING` to a dedicated local/test PostgreSQL instance whose user can create databases, and set `MOVELY_REQUIRE_POSTGRES_TESTS=true`. Then run the same project with filter `Category=PostgreSqlIntegration`. Never use production credentials. Do not treat skipped database tests as a passing migration check.

Actions are pinned to verified commit SHAs, checkout does not persist credentials, and workflow permissions are read-only. Branch protection is not enabled by this file; configuring required checks remains a repository-owner release decision.

Initial local limitation on 2026-10-29: Docker Desktop failed during Inference Manager initialization. No factory reset or data deletion was attempted. PostgreSQL execution is therefore to be verified through the isolated GitHub service container.
