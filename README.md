# Movely

Movely is a responsive moving-services marketplace for Israel. The product connects customers who need a move with verified moving companies that can buy qualified leads and submit Premium offers.

The repository currently contains the approved product and architecture documentation, the phased implementation plan, and the Phase 0-2 application foundation.

## Current status

Implemented foundation:

- responsive Next.js web application scaffold
- ASP.NET Core API scaffold
- PostgreSQL-oriented Entity Framework Core data layer
- Phase 2 identity/authentication foundation
- backend auth/security regression tests
- gated PostgreSQL integration test path for persistence-sensitive identity behavior

Not implemented yet:

- MoveRequest creation and lifecycle
- mover marketplace browsing
- lead purchase and wallet logic
- Premium offers
- internal messaging
- reviews
- payments

These later features must be implemented only when their approved implementation phase begins.

## Repository structure

```text
Movely_app/
  apps/
    api/
      src/Movely.Api/          ASP.NET Core backend
    web/                       Next.js frontend
  docs/                        Product, architecture, security, API, and test docs
  tests/
    api/Movely.Api.Tests/      Backend automated tests
  Movely.slnx                  .NET solution
```

Key documentation:

- `docs/PRODUCT_SPEC.md` - approved product specification
- `docs/ARCHITECTURE.md` - approved architecture specification
- `docs/DATA_MODEL.md` - approved entity model decisions
- `docs/API_DESIGN.md` - API boundaries and conventions
- `docs/AUTH_AUTHORIZATION.md` - authentication and authorization model
- `docs/SECURITY_ARCHITECTURE.md` - security/privacy rules
- `docs/IMPLEMENTATION_PLAN.md` - phased delivery plan
- `docs/TEST_STRATEGY.md` - testing strategy
- `docs/PHASE_2_1_POSTGRESQL_TESTING.md` - PostgreSQL integration test instructions

## Tech stack

Frontend:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS

Backend:

- ASP.NET Core
- .NET 10
- Entity Framework Core
- PostgreSQL via Npgsql
- xUnit test suite

## Prerequisites

- Node.js 22+
- npm
- .NET SDK 10.0
- PostgreSQL for real database/integration testing

## Install frontend dependencies

```powershell
cd apps/web
npm install
```

## Run the frontend

```powershell
cd apps/web
npm run dev
```

The frontend runs with the default Next.js development server.

## Run the API

```powershell
cd apps/api/src/Movely.Api
dotnet run
```

The API uses the `MovelyDb` connection string. If no connection string is configured, the local development fallback is:

```text
Host=localhost;Port=5432;Database=movely_dev;Username=postgres;Password=postgres
```

## Build and test

From the repository root:

```powershell
dotnet build .\Movely.slnx
dotnet test .\Movely.slnx
```

Frontend production build:

```powershell
cd apps/web
npm run build
```

## PostgreSQL integration tests

Fast backend tests do not require PostgreSQL. Persistence-sensitive tests are separated with the `PostgreSqlIntegration` category.

To run them, configure an admin-capable PostgreSQL connection string:

```powershell
$env:MOVELY_TEST_POSTGRES_CONNECTION_STRING = "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres"
dotnet test .\Movely.slnx --filter Category=PostgreSqlIntegration
```

The integration fixture creates an isolated test database, applies migrations, truncates data between tests, and drops the database at the end of the suite.

## Phase discipline

Movely is being built in approved phases. Do not implement later-phase marketplace behavior before the relevant phase is approved.

Current gate before Phase 3:

- backend build passes
- auth/security regression tests pass
- frontend build passes
- PostgreSQL integration tests are available but still need a real PostgreSQL runner to prove migrations and constraints against the production-compatible database provider

## Git hygiene

Keep generated build artifacts, local dependency folders, local database files, and machine-specific secrets out of Git. Environment-specific configuration belongs in local environment variables or ignored local files.
