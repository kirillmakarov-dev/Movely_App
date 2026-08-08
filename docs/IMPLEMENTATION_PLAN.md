# Movely Implementation Plan

This plan is dependency-first. It intentionally starts with backend and security foundations before broad frontend work.

## Phase 0 — Repository foundation

Goal: Establish the repository layout, tooling conventions, and documentation anchors before any product code.

Dependencies: Approved product docs and architecture docs.

Backend tasks:

- create the backend solution skeleton
- define module boundaries at a folder/project level
- add baseline configuration and environment templates

Frontend tasks:

- create the web app skeleton
- define route groups and feature folder boundaries
- create a minimal design-system placeholder

Database tasks:

- define migration strategy and environment separation
- prepare initial database connection conventions

Security tasks:

- define secret handling and local development rules
- define linting / code review gates for security-sensitive changes

Tests required:

- repo-level smoke build checks
- configuration validation
- folder/solution structure verification

Definition of Done:

- repository has a stable layout
- no application features are implemented yet
- team can identify where each module will live

What should NOT be implemented yet:

- business logic
- user flows
- API endpoints
- UI screens beyond skeleton routes

## Phase 1 — Backend foundation

Goal: Build the backend host, shared primitives, persistence wiring, and API contract conventions.

Dependencies: Phase 0.

Backend tasks:

- create ASP.NET Core API host
- add shared error model
- add request pipeline conventions
- add module registration pattern
- add persistence and transaction abstractions
- add audit logging infrastructure

Frontend tasks:

- keep frontend limited to shell routes and placeholder pages

Database tasks:

- create the first database connection, DbContext pattern, and migration baseline
- add conventions for IDs, timestamps, audit columns, and soft-delete rules where needed

Security tasks:

- establish session/cookie conventions
- establish authorization policy layout
- establish logging redaction conventions

Tests required:

- backend host boots successfully
- database connection smoke test
- error response contract test
- authorization pipeline smoke test

Definition of Done:

- backend can start cleanly
- core infrastructure services are wired
- no domain features yet

What should NOT be implemented yet:

- request creation
- marketplace read models
- wallet logic
- lead purchases
- premium offers

## Phase 2 — Identity and authorization foundation

Goal: Implement authentication, role assignment, and resource-level authorization skeletons.

Dependencies: Phase 1.

Backend tasks:

- implement user identity and role model
- implement Google auth integration boundary
- implement phone OTP verification abstraction
- implement customer/mover/admin authorization policies
- implement admin authentication boundary

Frontend tasks:

- build minimal auth entry pages and account state UI
- add auth/session-aware route guards

Database tasks:

- create identity and verification tables/entities
- add uniqueness constraints for auth identities and phone verification records

Security tasks:

- secure session cookie behavior
- CSRF protections for mutating routes
- rate limit auth and OTP endpoints
- redacted auth logging

Tests required:

- auth login/logout tests
- phone verification tests
- role and policy authorization tests
- OTP rate-limit tests

Definition of Done:

- customers, movers, and admins can be identified and authorized
- phone verification is enforced in backend policy

What should NOT be implemented yet:

- request publishing
- marketplace browsing
- lead purchase
- premium offers

## Phase 3 — MoveRequest domain foundation

Goal: Implement the customer request aggregate, request versioning, and draft-to-publish lifecycle.

Dependencies: Phases 1–2.

Backend tasks:

- implement `MoveRequest`
- implement `MoveRequestVersion`
- implement locations, items, photos metadata, and request status rules
- implement duplicate-risk detection hooks
- implement material vs minor edit logic
- implement publish and close/cancel command handlers

Frontend tasks:

- wire the request wizard shell to real draft state models
- keep the UI simple and form-driven, but not yet polished

Database tasks:

- create request, version, location, item, and photo metadata tables
- add version immutability constraints
- add active-request limit support

Security tasks:

- ensure request ownership checks are enforced server-side
- ensure no protected contact data exists in request DTOs before purchase

Tests required:

- draft creation tests
- publish validation tests
- phone verification gate tests
- material edit creates new version tests
- version immutability tests
- duplicate-risk flag tests

Definition of Done:

- customers can create draft requests
- versioned request state is reliable
- publish/close/cancel rules work end-to-end

What should NOT be implemented yet:

- marketplace search UI
- lead purchase
- premium offers
- wallet operations

## Phase 4 — Customer request wizard

Goal: Build the customer-facing request creation flows against real APIs.

Dependencies: Phase 3.

Backend tasks:

- finalize request draft/publish endpoints used by the wizard
- support step-level validation responses

Frontend tasks:

- implement apartment move wizard
- implement small move wizard
- implement review screen
- implement account-confirmation and phone-verification steps
- implement duplicate-warning UX

Database tasks:

- support draft persistence and version saving behavior

Security tasks:

- rate limit request creation and publish attempts
- protect upload and form submission paths

Tests required:

- wizard step validation tests
- review-to-publish tests
- draft persistence tests
- mobile component tests for wizard flow

Definition of Done:

- a customer can complete and publish a request through the UI

What should NOT be implemented yet:

- marketplace browsing
- mover accounts
- lead purchase
- premium offers

## Phase 5 — Marketplace read model

Goal: Build the mover-facing marketplace search and request detail views using marketplace-safe DTOs only.

Dependencies: Phases 2–4.

Backend tasks:

- implement marketplace query endpoints
- implement marketplace-safe DTO shaping
- implement request detail read model
- implement sold-out visibility behavior

Frontend tasks:

- build marketplace list page
- build filters UI
- build request details page shell
- build sold-out / rejected / blocked / locked states

Database tasks:

- add query indexes for city, date, budget, request type, status, and other common filters

Security tasks:

- validate marketplace DTOs never include protected fields
- validate IDOR resistance on detail endpoints

Tests required:

- marketplace filter tests
- protected-field exclusion tests
- role-gated browse tests

Definition of Done:

- movers can browse live request listings safely
- no protected contact data appears in marketplace responses

What should NOT be implemented yet:

- buying leads
- premium offer submission
- wallet deduction

## Phase 6 — Mover and business accounts

Goal: Implement mover business profiles and verification states.

Dependencies: Phases 2–5.

Backend tasks:

- implement business profile management
- implement business verification state transitions
- implement pending/verified/suspended/rejected policy enforcement

Frontend tasks:

- build mover onboarding and business profile pages
- show verification state in the dashboard

Database tasks:

- create business and business verification tables

Security tasks:

- enforce verified-only access for lead purchases and premium offers
- audit business verification changes

Tests required:

- business verification state tests
- verified-only access tests
- suspension/rejection tests

Definition of Done:

- mover accounts can exist independently of lead purchase
- verification gates business actions correctly

What should NOT be implemented yet:

- wallet transactions
- lead purchase
- premium offer transactions

## Phase 7 — Wallet foundation

Goal: Build the ledger-based wallet before any purchase flow depends on it.

Dependencies: Phases 1–2 and 6.

Backend tasks:

- implement wallet aggregate
- implement wallet transaction ledger
- implement derived/cached balance behavior
- implement idempotency keys for balance-changing operations

Frontend tasks:

- build wallet summary and transaction history screens
- keep top-up UI stubbed if payments are still deferred

Database tasks:

- create wallet and wallet transaction tables
- add uniqueness constraints and ledger integrity rules

Security tasks:

- ensure wallet transactions are audit-logged
- ensure balance changes are transactional

Tests required:

- wallet ledger tests
- balance derivation tests
- idempotency tests

Definition of Done:

- wallet balance can be trusted as a ledger-backed financial state

What should NOT be implemented yet:

- actual payment provider integration
- lead purchase command
- refund approvals

## Phase 8 — Lead purchase

Goal: Implement the highest-risk money-and-access transaction as a fully transactional command.

Dependencies: Phases 2, 5, 6, and 7.

Backend tasks:

- implement buy-lead command
- implement `LeadPurchase`
- implement `ContactAccess`
- implement request slot consumption
- implement rejected/blocked checks
- implement duplicate-purchase check
- implement concurrency handling for the final slot

Frontend tasks:

- build buy lead confirmation state
- build post-purchase success state
- build contact-unlocked state

Database tasks:

- create lead purchase and contact access tables
- add uniqueness constraints and concurrency-safe row locking strategy

Security tasks:

- verify marketplace DTOs still exclude contact data
- verify purchased-contact DTOs are only returned after purchase

Tests required:

- atomic purchase tests
- concurrency tests for final slot
- duplicate-purchase tests
- insufficient-balance rollback tests
- protected-contact access tests

Definition of Done:

- lead purchase is safe, atomic, and auditable

What should NOT be implemented yet:

- premium offer submission
- refunds
- messaging

## Phase 9 — Premium offers

Goal: Implement Premium mover offer creation, edit, withdraw, and customer interest/reject flows.

Dependencies: Phases 5–8.

Backend tasks:

- implement premium offer aggregate and versioning
- implement interest and rejection actions
- implement stale-offer behavior after material request edits

Frontend tasks:

- build premium offer composer
- build customer offer inbox/section
- build stale/rejected state UI

Database tasks:

- create premium offer and premium offer version tables
- add uniqueness constraints for one active offer per mover/request

Security tasks:

- enforce Premium verified mover-only access
- enforce rejected/blocked mover restrictions

Tests required:

- offer lifecycle tests
- stale-offer tests
- customer interest/reject tests

Definition of Done:

- Premium movers can participate without exposing protected contact data

What should NOT be implemented yet:

- refunds
- admin moderation tools beyond minimal view
- messaging

## Phase 10 — Customer dashboard

Goal: Build the customer’s post-publish management surface.

Dependencies: Phases 3–5 and 9.

Backend tasks:

- build dashboard summary endpoints
- expose request status, views, and offer summaries
- expose edit/close/cancel behavior safely

Frontend tasks:

- build customer dashboard
- build request status cards
- build edit/cancel affordances

Database tasks:

- add any read-optimized summary fields needed for dashboard queries

Security tasks:

- confirm customers only see their own request data

Tests required:

- dashboard state tests
- ownership tests
- cancel/close tests

Definition of Done:

- customers can manage their request after publishing

What should NOT be implemented yet:

- advanced refund handling
- admin moderation depth

## Phase 11 — Refund claims

Goal: Implement mover refund claims and admin review workflow.

Dependencies: Phases 7–8.

Backend tasks:

- implement refund claim submission
- implement refund review state machine
- implement wallet credit issuance on approval

Frontend tasks:

- build refund claim entry and status views
- build admin refund review screens

Database tasks:

- create refund claim tables and status history

Security tasks:

- ensure claims are tied to valid purchases
- ensure claim evidence is stored safely

Tests required:

- refund claim submission tests
- admin approval/rejection tests
- purchase-history preservation tests

Definition of Done:

- refund claims can be reviewed without corrupting wallet or purchase history

What should NOT be implemented yet:

- full admin dashboard depth
- messaging

## Phase 12 — Minimal admin functionality

Goal: Add the smallest useful admin surface for verification, pricing, and moderation.

Dependencies: Phases 2–11.

Backend tasks:

- add admin request inspection endpoints
- add mover verification decision endpoints
- add pricing override endpoints
- add suspension endpoints
- add audit log browsing

Frontend tasks:

- build minimal admin screens for verification, refund review, and request inspection

Database tasks:

- add or finalize audit log indexes

Security tasks:

- enforce admin-only access
- log every sensitive admin action

Tests required:

- admin permission tests
- audit trail tests
- verification moderation tests

Definition of Done:

- admins can support the MVP without a separate complex admin product

What should NOT be implemented yet:

- advanced analytics
- rich moderation dashboards

## Phase 13 — Hardening and security

Goal: Fill in the security, observability, and abuse-hardening gaps before production.

Dependencies: Phases 1–12.

Backend tasks:

- tighten DTO reviews
- improve error codes and correlation IDs
- review logging redaction
- validate upload restrictions

Frontend tasks:

- refine error states and forbidden-state UX
- ensure no protected data is cached client-side

Database tasks:

- finalize indexes, constraints, and retention rules

Security tasks:

- penetration-style review of protected-data paths
- CSRF/XSS validation
- rate-limit tuning
- upload malware/file-type review

Tests required:

- security regression tests
- protected-data contract tests
- redaction tests
- upload validation tests

Definition of Done:

- the system is ready for production hardening review

What should NOT be implemented yet:

- major new features

## Phase 14 — Production readiness

Goal: Prepare deployment, monitoring, backups, and release controls.

Dependencies: Phases 1–13.

Backend tasks:

- production configuration review
- health-check validation
- release checklist finalization

Frontend tasks:

- production build verification
- performance and accessibility pass

Database tasks:

- migration rehearsal
- backup and restore drill

Security tasks:

- secret review
- admin access review
- audit-log retention review

Tests required:

- end-to-end smoke tests
- staging-to-production release rehearsal
- backup restore test

Definition of Done:

- production deployment can be performed safely and repeatedly

What should NOT be implemented yet:

- scope beyond approved MVP

## Vertical slice guidance

Use vertical slices for the highest-risk user outcomes:

- Create MoveRequest: frontend wizard → API → domain logic → PostgreSQL → tests
- Buy Lead: frontend confirmation → API command → wallet transaction → `LeadPurchase` → `ContactAccess` → tests
- Request publish: phone verification → publish command → marketplace visibility → tests
- Premium offer flow: offer submit → customer interest/reject → stale handling → tests

Use infrastructure-first work for:

- repository foundation
- backend host and shared pipeline
- authentication and authorization
- wallet ledger
- audit logging
- security hardening

## Create Site / UI generation recommendation

Do not use Create Site for the full app before the domain model and API contracts are represented in the repository.

Recommended timing:

- early mock-data UI prototypes are safe after Phase 0 and Phase 1 scaffolding exists
- first meaningful Create Site use: after Phase 3 and Phase 5, when request versioning and marketplace-safe DTOs are real
- authentication should be connected before any customer publish or mover purchase flow is shown as real
- wallet/payment UI should be connected only after Phase 7 and Phase 8 are in place

Safe early mock-data pages:

- landing page
- request wizard shell
- marketplace card layout
- request details shell
- customer dashboard shell
- mover dashboard shell

Replace mock data with real API when:

- request creation is real
- marketplace read model is real
- authentication and authorization are wired

## Parallel Codex thread recommendations

Safe parallel threads after Phase 0:

- Thread A: backend foundation and API host
- Thread B: frontend route shell and design-system skeleton
- Thread C: test harness and security test scaffolding

After Phase 2:

- Thread D: MoveRequest domain and versioning
- Thread E: marketplace read model and DTOs
- Thread F: auth/authorization tests and security contracts

After Phase 7:

- Thread G: wallet ledger and transaction model
- Thread H: lead purchase transactional command
- Thread I: refund claim workflow

Dependency warnings:

- do not let one thread create DTOs that expose protected fields
- do not let a frontend-only thread invent business state
- do not let wallet and lead-purchase work diverge on the balance model

## Recommended phase order

1. Repository foundation
2. Backend foundation
3. Identity and authorization foundation
4. MoveRequest domain foundation
5. Customer request wizard
6. Marketplace read model
7. Mover and business accounts
8. Wallet foundation
9. Lead purchase
10. Premium offers
11. Customer dashboard
12. Refund claims
13. Minimal admin functionality
14. Hardening and security
15. Production readiness

## First phase that should actually write code

Phase 1 — Backend foundation.

Phase 0 is repository and scaffolding work. Phase 1 is the first phase where meaningful code should be written.

## MVP coverage check

Every approved MVP requirement has an implementation phase:

- responsive web → Phases 0, 4, 5, 10
- customer auth and phone verification → Phase 2
- mover verification → Phase 6
- Apartment Move / Small Move → Phases 3–4
- publishing and lifecycle → Phases 3–4
- marketplace filters and protected details → Phase 5
- verified mover concept → Phase 6
- LeadPrice → Phase 3 and 8
- wallet ledger → Phase 7
- LeadPurchase and ContactAccess → Phase 8
- max buyers and sold-out → Phase 8
- Premium subscription state → Phase 6 and 9
- Premium offers and reactions → Phase 9
- cancellation / close / expire → Phases 3, 10
- refund claims → Phase 11
- photo storage abstraction → Phases 3, 5, 13
- admin minimal role → Phases 2 and 12

