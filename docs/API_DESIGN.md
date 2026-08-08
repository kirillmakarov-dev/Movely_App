# Movely API Design

Base convention:

- REST-style JSON API
- Versioned under `/api/v1`
- All authorization is enforced server-side
- Marketplace-safe DTOs and purchased-contact DTOs are separate contracts

## 1. Auth

### POST `/api/v1/auth/google/start`

- Role: Anonymous
- Purpose: Begin Google sign-in or account linking
- Validation: provider configuration exists, return URL is allowed
- Response: sign-in redirect or authorization URL

### POST `/api/v1/auth/google/complete`

- Role: Anonymous
- Purpose: Finish Google sign-in and create/link user identity
- Validation: provider callback token is valid
- Response: session established, user profile summary

### POST `/api/v1/auth/phone/request-otp`

- Role: Anonymous or authenticated
- Purpose: Send SMS OTP for phone verification
- Validation: rate-limited, phone format valid, abuse checks pass
- Response: challenge created

### POST `/api/v1/auth/phone/verify-otp`

- Role: Anonymous or authenticated
- Purpose: Verify OTP and mark phone as verified
- Validation: OTP matches, challenge not expired, attempt limit not exceeded
- Response: phone verification result, session remains valid

### POST `/api/v1/auth/logout`

- Role: Authenticated
- Purpose: End browser session
- Response: session cleared

### GET `/api/v1/auth/me`

- Role: Authenticated
- Purpose: Return current user, roles, verification flags, and safe account summary

## 2. Users and profile

### GET `/api/v1/users/me`

- Role: Authenticated
- Purpose: Current user profile and role summary

### PATCH `/api/v1/users/me`

- Role: Authenticated
- Purpose: Update profile basics
- Validation: only safe profile fields, no protected identity bypass

## 3. Businesses

### POST `/api/v1/businesses`

- Role: Authenticated mover
- Purpose: Create business profile
- Validation: no conflicting ownership rules, required business fields present

### GET `/api/v1/businesses/me`

- Role: Authenticated mover
- Purpose: Return business profile, verification state, subscription state

### PATCH `/api/v1/businesses/me`

- Role: Authenticated mover
- Purpose: Update business profile
- Validation: limited to profile fields allowed in current verification state

## 4. Move requests

### POST `/api/v1/move-requests`

- Role: Authenticated customer
- Purpose: Create a draft request shell
- Validation: customer request count limit, rate limiting, required base type
- Response: draft request id and initial draft state

### GET `/api/v1/move-requests/{requestId}`

- Role: Authenticated owner customer or admin
- Purpose: Return full editable request aggregate, including draft/version state
- Validation: ownership or admin access
- Response: full request DTO for owner/admin

### PATCH `/api/v1/move-requests/{requestId}`

- Role: Authenticated owner customer
- Purpose: Update request content
- Validation: ownership, state eligibility, versioning rules, rate limits
- Response: updated draft or new version summary

### POST `/api/v1/move-requests/{requestId}/publish`

- Role: Authenticated owner customer
- Purpose: Publish a request
- Validation: request complete, phone verified, customer within active-request limit, not blocked, duplicate/risk warning acknowledged if applicable
- Response: published request summary

### POST `/api/v1/move-requests/{requestId}/close`

- Role: Authenticated owner customer
- Purpose: Close search
- Validation: ownership, current state allows closing
- Response: closed request summary

### POST `/api/v1/move-requests/{requestId}/cancel`

- Role: Authenticated owner customer
- Purpose: Cancel request
- Validation: ownership, current state allows cancellation
- Response: cancelled request summary

### GET `/api/v1/move-requests/{requestId}/versions`

- Role: Authenticated owner customer or admin
- Purpose: Inspect version history

### GET `/api/v1/move-requests/{requestId}/versions/{versionId}`

- Role: Authenticated owner customer or admin
- Purpose: Inspect a specific historical version

## 5. Marketplace

### GET `/api/v1/marketplace/requests`

- Role: Authenticated verified mover
- Purpose: Marketplace search and filters
- Validation: mover verification status, role, rate limits
- Response: marketplace-safe request cards only

### GET `/api/v1/marketplace/requests/{requestId}`

- Role: Authenticated verified mover
- Purpose: Marketplace-safe request detail view
- Validation: mover eligible to browse marketplace, request active or sold-out and visible
- Response: marketplace DTO only, never protected contact fields

## 6. Premium offers

### POST `/api/v1/move-requests/{requestId}/offers`

- Role: Authenticated Premium verified mover
- Purpose: Create or update current premium offer
- Validation: mover verified, active premium subscription, request available for new offers, mover not rejected/blocked, one active offer per mover/request, offer includes required fields
- Response: offer summary

### PATCH `/api/v1/offers/{offerId}`

- Role: Authenticated Premium verified mover
- Purpose: Edit current premium offer
- Validation: ownership, offer not withdrawn, request version compatibility rules
- Response: updated offer summary or stale-state result

### POST `/api/v1/offers/{offerId}/withdraw`

- Role: Authenticated Premium verified mover
- Purpose: Withdraw an offer
- Validation: ownership, current state allows withdrawal
- Response: withdrawn offer summary

### POST `/api/v1/offers/{offerId}/interest`

- Role: Authenticated owner customer
- Purpose: Mark interest in a premium offer
- Validation: customer owns request, offer belongs to request, offer not stale/withdrawn/rejected
- Response: updated offer reaction

### POST `/api/v1/offers/{offerId}/reject`

- Role: Authenticated owner customer
- Purpose: Reject a mover for this request
- Validation: customer owns request, offer belongs to request
- Response: rejected offer summary, interaction state updated to rejected

## 7. Lead purchases and contact access

### POST `/api/v1/move-requests/{requestId}/lead-purchases`

- Role: Authenticated verified mover
- Purpose: Buy lead
- Validation: mover authenticated, mover business verified, request active, lead sales available, mover not rejected/blocked, mover not already purchased, buyer slots available, wallet sufficient
- Response: purchase summary, wallet impact, contact access summary

### GET `/api/v1/lead-purchases/{leadPurchaseId}`

- Role: Authenticated purchasing mover or admin
- Purpose: View purchase summary and status

### GET `/api/v1/lead-purchases/{leadPurchaseId}/contact`

- Role: Authenticated mover with valid contact access or admin
- Purpose: Return protected contact payload
- Validation: access exists, not revoked, request and purchase identity match
- Response: protected contact DTO only

### GET `/api/v1/move-requests/{requestId}/contact`

- Role: Authenticated mover with valid contact access or admin
- Purpose: Convenience endpoint for request-linked contact access
- Validation: same as above
- Response: protected contact DTO only

## 8. Wallet

### GET `/api/v1/wallet`

- Role: Authenticated mover business owner
- Purpose: Return wallet balance and summary

### GET `/api/v1/wallet/transactions`

- Role: Authenticated mover business owner
- Purpose: Return wallet ledger entries

### POST `/api/v1/wallet/top-ups`

- Role: Authenticated mover business owner
- Purpose: Future top-up initiation
- Status: deferred behavior, endpoint may remain stubbed or internal-only in MVP

## 9. Refunds

### POST `/api/v1/refund-claims`

- Role: Authenticated mover with a qualifying lead purchase
- Purpose: Submit invalid lead claim
- Validation: valid purchase, allowed reason, optional evidence within size rules
- Response: pending claim summary

### GET `/api/v1/refund-claims/{refundClaimId}`

- Role: Authenticated mover owner or admin
- Purpose: Inspect refund claim

## 10. Admin

### GET `/api/v1/admin/requests/{requestId}`

- Role: Admin
- Purpose: Full administrative request inspection

### POST `/api/v1/admin/refund-claims/{refundClaimId}/approve`

- Role: Admin
- Purpose: Approve refund claim and issue wallet credit
- Validation: admin authorization, claim pending, evidence or rationale acceptable

### POST `/api/v1/admin/refund-claims/{refundClaimId}/reject`

- Role: Admin
- Purpose: Reject refund claim

### POST `/api/v1/admin/businesses/{businessId}/verify`

- Role: Admin
- Purpose: Mark business verified

### POST `/api/v1/admin/businesses/{businessId}/suspend`

- Role: Admin
- Purpose: Suspend abusive or unsafe mover

### POST `/api/v1/admin/businesses/{businessId}/reject`

- Role: Admin
- Purpose: Reject mover verification

### POST `/api/v1/admin/request-pricing/{requestId}`

- Role: Admin
- Purpose: Override or inspect request lead price configuration

### GET `/api/v1/admin/audit-logs`

- Role: Admin
- Purpose: Read audit trail

## 11. File uploads

### POST `/api/v1/files/uploads/request-photo`

- Role: Authenticated customer or mover, depending on context
- Purpose: Request a signed upload URL or upload session
- Validation: file type, size, and abuse limits
- Response: upload URL or upload session metadata

### POST `/api/v1/files/uploads/complete`

- Role: Authenticated user
- Purpose: Finalize uploaded object metadata

## 12. Critical buy-lead command

### POST `/api/v1/move-requests/{requestId}/lead-purchases`

This is a server-side transactional command, not a simple CRUD create.

Business transaction:

1. Validate mover authenticated
2. Validate mover business verified
3. Validate request active
4. Validate `LeadSalesStatus = Available`
5. Validate mover not rejected or blocked
6. Validate mover has not previously purchased this request
7. Validate buyer slots still available
8. Validate wallet balance
9. Capture current lead price snapshot
10. Debit wallet
11. Create `LeadPurchase`
12. Grant `ContactAccess`
13. Consume buyer slot
14. Commit

If any step fails, the transaction rolls back.

### PostgreSQL concurrency strategy

Use a single database transaction with row-level locking on the request aggregate and wallet row.

Recommended approach:

- load the request row `FOR UPDATE`
- load the wallet row `FOR UPDATE`
- validate state after the lock is held
- atomically decrement buyer availability and/or increment buyer count only while the row is locked
- enforce unique `(MoveRequestId, BusinessId)` on `LeadPurchase`
- on conflict or serialization failure, return `LEAD_SOLD_OUT` or `ALREADY_PURCHASED` as appropriate

This prevents two movers from buying the final slot at the same time.

## 13. Error response model

All business errors should return a consistent JSON shape such as:

```json
{
  "errorCode": "LEAD_SOLD_OUT",
  "message": "The lead is no longer available.",
  "details": {},
  "correlationId": "..."
}
```

Important error codes:

- REQUEST_NOT_ACTIVE
- LEAD_SOLD_OUT
- ALREADY_PURCHASED
- INSUFFICIENT_BALANCE
- BUSINESS_NOT_VERIFIED
- MOVER_REJECTED
- MOVER_BLOCKED
- OFFER_STALE
- REQUEST_VERSION_CHANGED
- PHONE_NOT_VERIFIED

Frontend maps these codes to UX states rather than guessing by HTTP status alone.

