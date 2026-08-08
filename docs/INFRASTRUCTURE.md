# Movely Infrastructure

## 1. MVP deployment shape

Recommended deployment model:

- Frontend: managed Next.js hosting
- Backend: managed ASP.NET Core container or app-hosting service
- Database: managed PostgreSQL
- Photo storage: private object storage
- SMS: provider adapter behind a pluggable interface
- Payments: provider adapter behind a pluggable interface, deferred for MVP

This is intentionally simple and production-oriented.

## 2. Recommended hosting layout

### Frontend

Host the Next.js app on a managed platform that supports SSR and environment variables.

Examples:

- Vercel
- equivalent SSR-capable managed hosting

### Backend

Host the ASP.NET Core API as a single deployable service, ideally containerized.

Examples:

- Azure App Service
- Azure Container Apps
- equivalent managed container host

### Database

Use managed PostgreSQL with automated backups and point-in-time recovery.

### Object storage

Use private S3-compatible object storage for request photos and evidence attachments.

### Regional guidance

Choose a region close to the first market and appropriate for latency and compliance expectations for Israel.

## 3. Environment separation

Use separate environments:

- Development
- Staging
- Production

Each environment should have:

- its own backend deployment
- its own database
- its own storage bucket/container
- its own secrets
- its own SMS/payment sandbox or adapter config where relevant

## 4. Configuration and secrets

Use environment variables for non-secret settings and a secret store for credentials.

Examples:

- Google OAuth client secret
- SMS provider credentials
- storage access credentials
- future payment provider credentials
- session signing keys
- database connection strings

Never commit secrets into the repository.

## 5. Migrations and release flow

Use a migration-based release process:

1. merge approved changes
2. run tests
3. apply migrations in staging
4. validate staging
5. deploy backend
6. deploy frontend
7. apply production migration carefully

Prefer automated migration execution during deployment with a controlled rollback plan.

## 6. Backups and recovery

PostgreSQL:

- automated daily backups
- point-in-time recovery
- periodic restore drills

Object storage:

- lifecycle policy for old temporary uploads if needed
- backups for critical attachments if provider supports it

Operational goal:

- be able to restore data after accidental deletion or failed release

## 7. Logging, monitoring, and error tracking

Use:

- structured application logs
- metrics for request throughput, errors, lead purchases, OTP sends, refund claims
- error tracking for frontend and backend exceptions
- audit logs for business-sensitive actions

Important observability categories:

- API errors
- wallet failures
- OTP abuse signals
- lead purchase failures
- contact access failures
- admin actions

Recommended tools may vary, but the architecture should support them.

## 8. CI/CD concept

Keep CI/CD simple:

- lint / build / test on pull request
- build frontend artifact
- build backend artifact
- run database migrations in a controlled pipeline step
- deploy to staging
- manual or approved production promotion

Do not introduce complex multi-service release orchestration for MVP.

## 9. Health checks

Backend should expose:

- liveness check
- readiness check
- dependency-aware readiness where practical

Checks should confirm:

- app process is alive
- database connectivity is healthy
- object storage or other critical dependencies are reachable if needed for readiness

Frontend hosting should also have uptime monitoring and a basic synthetic check.

## 10. SMS provider abstraction

Do not bind the application architecture to one SMS vendor.

Define a provider interface around:

- send OTP
- resend OTP
- verify attempt metadata
- delivery status if available

The real vendor can be chosen later without changing the business model.

## 11. Payment provider abstraction

Do not choose the final payment provider yet.

Define an abstraction around:

- create top-up intent
- confirm payment
- receive webhook/event
- reconcile payment status
- issue refunds where applicable later

Wallet and lead purchase should not depend on a specific vendor implementation.

## 12. Wallet architecture in infrastructure terms

The wallet must be ledger-based.

Infrastructure should support:

- transactional PostgreSQL writes
- idempotency keys
- row locking or transaction isolation for debit commands
- ledger history queries

The cached balance field, if used, should be derived or updated only inside the same transaction as the ledger entry.

## 13. Search and filtering infrastructure

For MVP, PostgreSQL should be sufficient for marketplace filtering.

Recommended approach:

- relational filters for status, city, date, rooms, budget, photos, items
- indexed columns for common filters
- optional text search / trigram / GIN indexes if needed

Do not add a separate search engine unless actual scale forces it.

If distance/service-area logic becomes serious later, consider PostGIS or a dedicated geospatial layer then.

## 14. Photo upload workflow

Recommended flow:

1. frontend asks backend for an upload session or signed URL
2. backend validates permissions and file policy
3. client uploads directly to object storage
4. client notifies backend of completion
5. backend stores metadata and links file to request version

Benefits:

- avoids streaming large files through the API
- keeps storage private
- allows validation before final acceptance

## 15. Data lifecycle and deletion

Request data:

- drafts may be kept as long as needed for customer completion
- versions remain for audit and support
- deleted or cancelled requests should keep historical records according to business rules

Photo data:

- retain while referenced by live or historical versions unless deletion is requested and allowed
- remove or deactivate unused temporary uploads

Audit data:

- append-only and retained according to compliance/support needs

## 16. Operational safety

Important operational protections:

- separate staging and production secrets
- restricted admin access to production
- backups before risky migrations
- alerting on failed lead purchase or wallet anomalies
- alerting on OTP abuse spikes

## 17. Lean MVP choices

Avoid for MVP:

- microservices
- event streaming infrastructure
- separate search cluster
- separate analytics warehouse
- complex multi-region active/active
- custom payment infrastructure

Those options add cost without improving the core lead marketplace enough at this stage.

