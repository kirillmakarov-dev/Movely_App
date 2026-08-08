# Phase 2.1 PostgreSQL Integration Testing

This note documents the persistence-sensitive Phase 2.1 test path. It does not introduce Phase 3 behavior.

## Purpose

Fast API tests continue to run without an external database. PostgreSQL integration tests are separated behind the `PostgreSqlIntegration` category so persistence-sensitive behavior can be verified against the same relational engine expected in production.

These tests cover:

- applying Entity Framework migrations to a clean PostgreSQL database
- `UserAuthIdentity` uniqueness for `Provider + ProviderSubject`
- user/auth identity foreign-key constraints
- `BusinessStatus` persistence across contexts
- `PhoneVerified` persistence across contexts
- OTP persistence
- OTP single-use persistence
- session persistence
- current phone-number uniqueness behavior
- database cleanup/isolation between tests

## Local configuration

Set this environment variable to an admin-capable PostgreSQL connection string:

```powershell
$env:MOVELY_TEST_POSTGRES_CONNECTION_STRING = "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres"
```

The fixture creates an isolated test database per run, applies migrations, truncates data between tests, and drops the database after the suite completes.

## Run command

```powershell
dotnet test .\Movely.slnx --filter Category=PostgreSqlIntegration
```

If the environment variable is not set, the PostgreSQL integration tests are skipped intentionally.

## Future concurrency support path

The same PostgreSQL fixture should be used for future lead-purchase and wallet concurrency tests. Those tests should open multiple real database contexts/connections against the isolated PostgreSQL database and verify transaction behavior for final-slot purchase races, atomic wallet debit, and contact-unlock consistency.

Concurrency-sensitive behavior must not be validated only with the fast in-memory test path.
