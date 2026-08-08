# Movely Authentication and Authorization

## 1. Identity model

Movely should treat authentication and authorization as separate concerns.

- Authentication proves who the user is
- Authorization proves what that user may do on a specific resource

A single user account may eventually hold multiple roles:

- Customer
- Mover
- Admin

Role assignment alone is not sufficient for access decisions.

## 2. Authentication approach

Recommended browser authentication model:

- backend-issued secure session cookie
- Google sign-in for account creation or login
- phone OTP verification for customers before publish
- phone verification for movers as part of business readiness

The browser should not store access tokens in localStorage.

Use:

- HttpOnly
- Secure
- SameSite cookies

## 3. Customer authentication

Customer flow:

1. Start request anonymously
2. Create or confirm account
3. Verify phone via SMS OTP
4. Publish request

Rules:

- phone verification is mandatory before publish
- Google login may assist account creation but does not replace phone verification
- customer request drafts may exist before authentication is complete

## 4. Mover authentication

Mover flow:

1. Create account or sign in
2. Create business profile
3. Enter verification pipeline
4. Gain verified business access

Rules:

- PendingVerification may allow limited preview only
- Verified is required for buying leads and sending Premium offers
- Suspended and Rejected movers cannot purchase leads or contact customers

## 5. Admin authentication

Admin users are separate protected operational accounts.

Recommended admin hardening:

- dedicated admin role assignment
- stronger session TTL
- MFA if supported in the chosen identity system
- separate admin routes and UI boundary

## 6. Resource-level authorization rules

Authorization must be checked on the backend for every sensitive action.

### Customer-owned resources

- customer may edit only their own `MoveRequest`
- customer may close or cancel only their own `MoveRequest`
- customer may inspect only their own requests and offers

### Marketplace browsing

- mover may see only marketplace-safe request fields before purchase
- sold-out requests remain visible but not purchasable
- rejected or blocked movers must not be able to buy or offer on that request

### Premium offers

- only a verified Premium mover may send pre-purchase offers
- only the request owner customer may mark interest or reject a mover
- `Not suitable` creates a rejected-by-customer state for that mover/request pair

### Lead purchases

- only a verified mover with sufficient wallet balance may buy a lead
- mover may purchase a request at most once
- purchase must be blocked if the mover is rejected or blocked
- purchase must be blocked if lead sales are sold out or closed

### Contact access

- only a mover with valid `ContactAccess` may retrieve protected contact data
- contact access is granted by a successful lead purchase
- no extra customer approval is required after purchase

### Admin permissions

- admins may moderate requests, users, businesses, refund claims, prices, and audit logs
- all admin actions should be audited

## 7. Relationship-state authorization

Authorization should consider the `CustomerMoverInteraction` state in addition to role:

- no interaction
- active Premium offer
- customer interested
- rejected by customer
- lead purchased
- blocked

The state should be checked whenever the system decides whether a mover may:

- buy a lead
- send an offer
- view protected contact data
- continue interacting with the request

## 8. Backend-first authorization

The backend must be the only source of truth for authorization.

The frontend must not:

- hide an action and assume security
- infer unlock state from masked values
- trust client-side role checks

All sensitive endpoints must validate:

- current user identity
- role or business state
- resource ownership
- request lifecycle state
- relationship state
- purchase state
- subscription state

## 9. Specific authorization examples

### Publish request

Customer must own the request, have verified phone, and be within the configured active-request limit.

### Edit request

Customer must own the request and edits must respect versioning rules.

### View marketplace-safe request

Mover must be signed in and eligible to browse the marketplace.

### View protected contact

Mover must have a valid purchase-generated `ContactAccess`.

### Send Premium offer

Mover must be verified, Premium-active, and not rejected or blocked for that request.

### Reject or express interest

Only the owner customer may perform those actions.

### Admin actions

Only admin role holders may perform administrative moderation or configuration.

## 10. Recommended implementation pattern

Use backend authorization policies and resource checks together:

- role-based policy for coarse gate
- ownership/resource check for fine gate
- business state check for eligibility
- transaction-level check for purchase and wallet operations

That combination is safer than using role checks alone.

