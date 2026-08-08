# Movely Repository Structure

This layout is intentionally simple and modular. It avoids unnecessary Clean Architecture ceremony while still keeping the backend maintainable as a modular monolith.

## 1. Top-level layout

```text
Movely_app/
  apps/
    web/
    api/
  docs/
  tests/
  infra/
  .github/
  README.md
```

## 2. Frontend structure — `apps/web`

Recommended Next.js app structure:

```text
apps/web/
  src/
    app/
      (public)/
      (customer)/
      (mover)/
      (admin)/
      api/                # only if the frontend needs local route handlers
      layout.tsx
      page.tsx
    features/
      auth/
      requests/
      marketplace/
      offers/
      wallet/
      dashboard/
      admin/
    components/
      ui/
      layout/
      feedback/
      forms/
    lib/
      api/
      auth/
      errors/
      formatters/
      guards/
    design-system/
      tokens/
      typography/
      colors/
      icons/
    styles/
    types/
  public/
  next.config.js
```

### Frontend organization principles

- routes live under `src/app`
- feature-specific logic lives under `src/features`
- shared UI primitives live under `src/components/ui`
- API calls are isolated in `src/lib/api`
- auth/session helpers are isolated in `src/lib/auth`
- do not mix marketplace DTO assumptions into UI components

## 3. Backend structure — `apps/api`

Recommended ASP.NET Core modular-monolith structure:

```text
apps/api/
  src/
    Movely.Api/
      Program.cs
      appsettings.json
      appsettings.Development.json
      Modules/
        Identity/
        Users/
        Businesses/
        MoveRequests/
        Marketplace/
        Offers/
        LeadPurchases/
        Wallet/
        Refunds/
        Files/
        Admin/
      Shared/
        Errors/
        Authorization/
        Time/
        Results/
        Validation/
      Infrastructure/
        Persistence/
        Security/
        Storage/
        Integrations/
        BackgroundJobs/
      Configuration/
      Contracts/
      Migrations/
```

### Backend organization principles

- keep the application in one deployable API
- keep logical features inside `Modules`
- keep cross-cutting concerns in `Shared`
- keep technical adapters in `Infrastructure`
- keep DTOs/contracts separate from domain models
- keep migration files in one obvious place

### Conceptual module responsibilities

- `Identity`: login, session, role, OTP, auth identities
- `Users`: shared user profile data and account status
- `Businesses`: mover profile, verification, subscription state
- `MoveRequests`: request aggregate, versioning, lifecycle
- `Marketplace`: search and read-model projections
- `Offers`: premium offer aggregate and reactions
- `LeadPurchases`: purchase command, contact access, concurrency logic
- `Wallet`: ledger, balance, transactions
- `Refunds`: refund claims and wallet credits
- `Files`: object storage metadata and upload flow
- `Admin`: moderation, pricing, suspension, audit tools

## 4. Tests structure

```text
tests/
  api/
  integration/
  concurrency/
  security/
  web/
  e2e/
```

Recommended split:

- `tests/api`: endpoint and command tests
- `tests/integration`: database and module integration tests
- `tests/concurrency`: purchase-slot and wallet race tests
- `tests/security`: protected-data and authorization contract tests
- `tests/web`: frontend component and state tests
- `tests/e2e`: critical user journeys across browser and backend

## 5. Infrastructure and tooling structure

```text
infra/
  docker/
  deployment/
  scripts/
  monitoring/
  backups/
```

Use this for:

- local development containers if needed
- deployment manifests
- backup scripts
- monitoring notes
- environment bootstrap helpers

## 6. Documentation structure

```text
docs/
  PRODUCT_SPEC.md
  USER_FLOWS.md
  BUSINESS_RULES.md
  UI_PAGES.md
  OPEN_QUESTIONS.md
  DECISION_LOG.md
  ARCHITECTURE.md
  DATA_MODEL.md
  API_DESIGN.md
  AUTH_AUTHORIZATION.md
  SECURITY_ARCHITECTURE.md
  INFRASTRUCTURE.md
  IMPLEMENTATION_PLAN.md
  REPOSITORY_STRUCTURE.md
  TEST_STRATEGY.md
```

## 7. Files that should exist early

The first code-bearing repository milestone should include:

- solution and project skeletons
- module folder placeholders
- test project placeholders
- CI workflow placeholders
- environment example files
- migration placeholder directory

## 8. Avoided complexity

Do not add these unless a later phase proves a need:

- separate microservice repositories
- separate search cluster
- separate event bus infrastructure for MVP
- deep Clean Architecture layers for every module
- duplicated business entities in multiple project layers

