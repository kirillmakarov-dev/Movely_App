# Movely Test Strategy

This strategy is designed for a transactional marketplace with protected data, versioned requests, and atomic lead purchase.

## 1. Testing philosophy

Movely should be tested in layers:

- unit tests for domain rules
- integration tests for database and module wiring
- API tests for request/response contracts
- authorization tests for ownership and entitlement
- database transaction tests for atomic operations
- concurrency tests for race conditions
- frontend component tests for UI state
- end-to-end tests for critical journeys

The highest-risk areas should be tested early, not left for the end:

- authentication
- authorization
- request versioning
- protected-data separation
- wallet ledger integrity
- atomic lead purchase
- concurrency on the final slot

## 2. Unit tests

Use unit tests for:

- status transition rules
- request versioning rules
- offer state transitions
- wallet transaction math
- duplicate-request detection logic
- refund reason classification
- anti-abuse rule helpers
- error-code mapping helpers

Unit tests should not mock away every important rule to the point that behavior is meaningless. Keep them close to real domain logic.

## 3. Integration tests

Use integration tests for:

- API host bootstrapping
- database persistence
- transaction boundaries
- identity and authorization wiring
- read/write consistency across modules
- upload metadata persistence

Integration tests should use a real PostgreSQL test database where practical.

## 4. API tests

Use API tests for:

- request and response contracts
- status codes
- validation errors
- business error codes
- role-gated access
- marketplace-safe DTO shaping
- purchased-contact DTO shaping

Important API test rule:

- one test suite for marketplace responses
- one test suite for purchased-contact responses

Those contracts must never blur together.

## 5. Authorization tests

Authorization tests should verify:

- ownership checks
- verified mover gating
- Premium gating
- rejected/blocked mover gating
- customer-only actions
- admin-only actions
- resource-level checks on every sensitive endpoint

These tests should prove that backend authorization does not depend on frontend visibility.

## 6. Database transaction tests

Use transaction tests for:

- wallet debit plus purchase commit
- rollback on any failure
- unique purchase by mover/request
- immutable request version writes
- version-linked offer writes
- refund credit creation

These tests should confirm that partial states cannot survive an error.

## 7. Concurrency tests

Concurrency tests are mandatory for:

- final buyer slot purchase
- simultaneous wallet-dependent purchases
- duplicate purchase attempts from the same mover

Run tests where:

- two movers try to buy the last slot at the same time
- one transaction must win
- the loser must not be charged
- the buyer count must not exceed the configured maximum

## 8. Frontend component tests

Use component tests for:

- wizard step validation
- review screen summaries
- marketplace card states
- sold-out badges
- rejected/blocked mover states
- contact-locked vs contact-unlocked UI
- stale-offer banners
- cancellation confirmation
- error-state rendering

Frontend tests should verify UI state only, not security.

## 9. End-to-end tests

Use end-to-end tests for the most important user journeys:

- customer creates draft request and publishes it
- mover browses marketplace and sees safe data only
- mover buys a lead and sees contact data
- rejected mover cannot buy
- blocked mover cannot buy
- unverified mover cannot buy
- customer closes the request
- refund claim is created and reviewed

## 10. Critical test scenarios

At minimum, the following scenarios must be covered:

1. Marketplace API never returns protected fields.
2. Unpurchased mover cannot access contact.
3. Purchased mover can access contact.
4. Rejected mover cannot purchase.
5. Blocked mover cannot purchase.
6. Unverified mover cannot purchase.
7. Mover cannot buy same lead twice.
8. Final buyer slot cannot be double-sold under concurrency.
9. Insufficient balance does not create partial purchase.
10. Wallet debit + LeadPurchase + ContactAccess are atomic.
11. Material MoveRequest edit creates a new version.
12. Existing Premium offers become Stale after material edit.
13. SoldOut blocks new purchases.
14. Customer phone must be verified before publish.
15. Cancelled/closed request cannot be purchased.
16. Refund claim preserves purchase history.

## 11. Additional high-value scenarios

Add these as soon as the relevant module exists:

- duplicate request warning appears before publish
- customer active-request limit blocks excessive publishing
- rejected mover cannot bypass rejection by buying the lead
- blocked mover cannot submit new offers
- customer “I'm interested” is a soft signal only
- customer “Not suitable” rejects that mover for that request
- request edit after purchase does not silently rewrite historical truth
- admin approval creates wallet credit and preserves purchase history
- wallet transaction history always matches derived balance

## 12. Suggested test ownership by phase

### Phase 1–2

- auth tests
- OTP tests
- role/policy tests
- redaction tests

### Phase 3–5

- request versioning tests
- publish/close/cancel tests
- marketplace DTO tests
- protected-field tests

### Phase 6–8

- business verification tests
- wallet ledger tests
- lead purchase transaction tests
- concurrency tests

### Phase 9–12

- Premium offer tests
- customer dashboard tests
- refund claim tests
- admin tests

### Phase 13–14

- security regression tests
- e2e smoke tests
- backup/restore rehearsal tests

## 13. Automation guidance

Recommended CI gates:

- unit tests on every pull request
- integration and API tests on every pull request
- concurrency tests on affected backend changes
- frontend component tests on UI changes
- end-to-end tests on release candidates

Recommended release gate:

- all critical scenarios above pass
- no protected-field leakage tests fail
- no wallet atomicity tests fail
- no concurrency tests fail

