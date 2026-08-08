# Movely Architecture Specification

## 1. Architecture recommendation

Recommended stack:

- Frontend: Next.js + React + TypeScript + Tailwind CSS
- Backend: ASP.NET Core + C#
- Database: PostgreSQL
- File storage: private object storage for photos

Recommendation:

Use a separate Next.js frontend and a separate ASP.NET Core backend API, with the backend implemented as a modular monolith.

This is the best fit for Movely because it keeps the browser experience fast and SEO-friendly, keeps backend business rules centralized, and avoids the operational complexity of microservices before the product has proven volume.

## 2. Why this architecture fits Movely

Movely needs:

- a responsive public marketplace
- protected customer data
- atomic lead purchase and wallet updates
- versioned requests and offers
- admin workflows
- future messaging, notifications, and ratings without rework

That combination strongly favors:

- a rich web frontend for responsive UI
- a single authoritative backend for business rules and authorization
- a relational database for transactional integrity
- private blob storage for images

ASP.NET Core is a strong match for:

- transactional business logic
- authorization policy enforcement
- background jobs
- clean domain modularity
- PostgreSQL integration

Next.js is a strong match for:

- mobile-first marketplace UI
- wizard-style forms
- SEO-friendly public pages
- server rendering where useful
- future localization and RTL support

PostgreSQL is a strong match for:

- transactional consistency
- versioned records
- wallet ledger integrity
- flexible marketplace filtering
- relational authorization checks

## 3. System context

Movely has four major runtime zones:

1. Browser UI for customers, movers, and admins
2. Application backend for business rules and authorization
3. Database and storage layer for records and photos
4. External providers for Google auth, SMS OTP, and future payments

### Text architecture diagram

```text
Customer / Mover / Admin Browser
    |
    v
Next.js Web App
    |
    v
ASP.NET Core API (modular monolith)
    |
    +--> PostgreSQL
    |
    +--> Private Object Storage
    |
    +--> SMS Provider Adapter
    |
    +--> Google Authentication Adapter
    |
    +--> Future Payment Provider Adapter
```

## 4. Frontend responsibility

The Next.js app is responsible for:

- responsive customer, mover, and admin UI
- request wizard and review flow
- marketplace browsing and filters
- customer dashboard
- mover dashboard and lead-purchase UX
- premium offer forms
- error-state presentation
- route-based rendering
- optimistic UX only where safe

The frontend must never be the source of truth for:

- authorization decisions
- contact unlock
- wallet balance integrity
- sold-out state
- duplicate-request decisions
- rejection/blocking rules

## 5. Backend responsibility

The ASP.NET Core API is responsible for:

- authentication session establishment
- authorization and resource ownership checks
- request lifecycle and versioning
- marketplace-safe DTO shaping
- lead purchase transaction
- wallet ledger updates
- premium offer lifecycle
- refund claims
- admin moderation and configuration
- business audit logging
- future notification orchestration

The backend is the source of truth for:

- which request data may be exposed
- whether a mover may buy a lead
- whether a mover may send an offer
- whether a lead purchase is valid
- whether a customer may publish
- whether a mover is verified

## 6. Database responsibility

PostgreSQL is responsible for:

- durable transactional storage
- request versions
- purchase records
- wallet ledger entries
- business verification state
- audit trail records
- relational authorization checks
- marketplace filtering queries

The database should use:

- foreign keys
- uniqueness constraints
- check constraints
- transactional row locking where needed
- indexes for marketplace search and ownership checks

## 7. File and photo storage responsibility

Photos and other large binary assets must live in private object storage, not in PostgreSQL.

The database stores:

- object key
- bucket/container reference
- file metadata
- ownership
- version linkage
- moderation state

The storage layer should support:

- direct upload via signed or authorized URL
- access only through authorized read URLs
- deletion or soft-deletion for removed request versions
- auditability for file access if needed later

## 8. Authentication boundary

Authentication identifies the user and establishes a session.

Expected browser auth approach:

- backend-issued secure session cookie
- Google sign-in for account creation / login
- phone OTP verification for customers before publish
- phone verification for movers as part of business readiness

The browser should not store bearer tokens in localStorage.

## 9. Authorization boundary

Authorization is enforced only by the backend.

Frontend hiding is not security.

Authorization depends on:

- role
- ownership
- business verification status
- request lifecycle status
- lead purchase history
- relationship state
- premium subscription state
- rejection/block state

Examples:

- customer may edit only their own request
- mover may see only marketplace-safe fields before purchase
- mover with valid ContactAccess may see protected contact data
- rejected or blocked mover cannot buy the request or send another offer for it
- only verified Premium mover may send pre-purchase offers

## 10. Payment and wallet boundary

Lead purchase is the first monetized transaction.

For MVP:

- wallet operations are internal ledger operations
- payment provider integration is deferred

The wallet boundary must guarantee:

- no double spend
- no partial debit without purchase
- no purchase without recorded balance impact
- transaction history for audit and refund handling

## 11. External integrations

External integrations are intentionally narrow at MVP:

- Google authentication
- SMS OTP provider
- future payment provider
- future email/notification provider

The architecture should isolate each provider behind an adapter interface so the provider can change without rewriting business logic.

## 12. Admin boundary

Admin is a separate protected operational surface.

Admin capabilities should include:

- mover verification review
- request moderation support
- refund claim review
- pricing/configuration changes
- abuse suspension
- audit inspection

Admin actions must always be audit-logged.

## 13. Logical backend modules

Recommended internal modules for the modular monolith:

- Identity
- Customers
- Movers / Businesses
- MoveRequests
- RequestVersioning
- Marketplace
- Offers
- LeadPurchases
- Wallet
- Refunds
- Files
- Admin
- Audit
- Notifications

These are logical modules, not microservices.

## 14. Monolith principles

Movely should remain a modular monolith for MVP.

That means:

- one backend deployable
- one database
- one transactional boundary
- clear module boundaries in code
- internal APIs between modules kept simple

Why not microservices:

- the product does not yet justify distributed consistency
- lead purchase must be atomic
- wallet and contact access must be tightly coordinated
- verification and moderation are easier in one transaction space

## 15. How the system can grow later

The proposed structure can later extract modules if needed:

- Notifications can become a worker service
- Search can later use a specialized index if PostgreSQL becomes insufficient
- Payments can later be split into a billing service
- Messaging can later become its own module or service
- Analytics can later become a read-optimized pipeline

None of those extractions are needed for MVP.

## 16. Deliberately monolithic choices

The following should remain in one backend for now:

- request publication and versioning
- lead purchase and wallet debit
- contact access authorization
- refund claims and audit trail
- mover verification and marketplace eligibility

These are tightly coupled domain rules and should be kept together until the product proves scale.

