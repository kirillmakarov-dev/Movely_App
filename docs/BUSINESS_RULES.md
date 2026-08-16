# Movely Business Rules

This file reflects accepted product decisions only.

## Request lifecycle

- `MoveRequestStatus` is separate from `LeadSalesStatus`
- `MoveRequestStatus` values: Draft, Published, Active, Closed, Cancelled, Expired
- `LeadSalesStatus` values: Available, SoldOut, Closed
- `Published` is a transitional/system state
- `Active` is the marketplace-visible state
- A request can be `Active` while lead sales are `SoldOut`

## Customer phone verification

- Phone verification is mandatory before publishing a `MoveRequest`
- Google authentication does not replace phone verification

## Anti-abuse and duplicate detection

- The system must detect likely duplicate requests using signals such as same customer, same move type, same or similar pickup location, same or similar destination, and same or nearby move date
- Duplicate detection should warn the customer and offer a choice to open the existing request or continue anyway
- Duplicate requests may still be published, but they should carry an internal duplicate-risk flag for moderation and admin review
- Server-side rate limiting should apply to abuse-sensitive actions such as OTP requests, publish attempts, authentication attempts where appropriate, image uploads, and account/request creation
- A customer may have a configurable maximum number of active requests
- If the configured active-request limit is reached, the customer must close or cancel an active request before publishing another
- Admins may suspend abusive customers

## Lead sales and purchase rules

- Default maximum lead buyers per request is 3
- The limit must be configurable
- When the limit is reached, `LeadSalesStatus = SoldOut`
- Sold out blocks additional lead purchases and new Premium offers
- Existing purchases and existing Premium interactions remain valid
- A mover may purchase a specific `MoveRequest` at most once
- The backend must enforce the purchase limit atomically
- Frontend checks are not sufficient

## Atomic purchase operation

Buying a lead is one atomic backend business operation.

The operation conceptually includes:

1. Validate mover authorization
2. Validate mover verification state
3. Validate request state
4. Validate lead availability
5. Validate that the mover has not already purchased the same `MoveRequest`
6. Validate wallet balance
7. Debit wallet
8. Create `LeadPurchase`
9. Grant `ContactAccess`
10. Consume one buyer slot

The operation must be all-or-nothing.

## Protected data

- Before authorization, do not expose customer name, phone number, email, exact pickup address, exact destination address, or other protected contact data
- Marketplace-safe route information may be shown at city/area level only
- The backend response itself must exclude protected fields when access is not authorized

## Lead pricing

- Each `MoveRequest` has its own `LeadPrice`
- Each `LeadPurchase` stores `PricePaid` as a snapshot
- Admin must eventually be able to override/configure pricing
- Price history should remain auditable

## Premium offers

- A mover may have at most one active Premium offer per `MoveRequest`
- Offer statuses: Draft, Active, Interested, Rejected, Stale, Withdrawn, Expired
- Mover may create, edit, and withdraw an offer
- Material request edits can make a Premium offer stale
- Stale offers must not be treated as current accepted pricing
- Customer “I'm interested” is a soft signal only
- It does not reserve the request or a buyer slot
- It does not reveal contact information
- It does not charge the mover
- It does not block other movers
- It does not close the request
- Customer “Not suitable” marks the offer as rejected for that mover and prevents that mover from bypassing the rejection by purchasing the lead or initiating further contact for the same request

## Request edits and versioning

- Minor changes include customer comments, added photos, text clarification, and minor descriptive information
- Material changes include pickup or destination changes, move date changes, request category changes, room count changes, major inventory changes, newly added heavy/special items, and significant budget changes
- If there are no `LeadPurchase`s and no Premium offers, the customer may edit freely
- If lead purchases or Premium offers already exist, material edits must create a new request version
- Existing purchasers keep their historical access
- Movers who already purchased the lead should be notified when material request details change

## Cancellation and closing

- The customer may explicitly close the request by choosing “I found a mover” or “Close search”
- Explicit close means the customer intentionally finished the search, for example because they found a mover
- After explicit close, `MoveRequestStatus = Closed` and `LeadSalesStatus = Closed`
- Cancellation is allowed even after movers already purchased the lead
- Cancellation means the customer cancelled the transportation request/search
- After cancellation, `MoveRequestStatus = Cancelled` and `LeadSalesStatus = Closed`
- Existing purchasers keep the historical purchase record
- Cancellation after a valid purchase does not automatically qualify for refund
- If the customer chooses another mover, historical purchases remain valid and contact access is not automatically revoked
- Choosing another mover is not itself a refund reason

## Refunds

- Movers may report invalid leads
- Potentially valid refund reasons include invalid phone number, customer denies submitting the request, duplicate request, and request already closed/cancelled before purchase
- Non-refund reasons include customer pricing preference, customer choosing another mover, lack of immediate answer, or mover failing to close the deal
- Refund flow for MVP: Report Lead → select reason → optional evidence → Admin Review → Approved/Rejected
- Approved refunds should return wallet credit whenever practical
- Duplicate request refunds may be reviewed if the same actual customer request was accidentally duplicated and a mover paid for the duplicate lead

## Mover verification

- `BusinessStatus = PendingVerification` allows limited marketplace preview and business profile setup
- `PendingVerification` does not allow Buy Lead, Send Premium Offer, or access to protected customer data
- Full business actions require `BusinessStatus = Verified`
- `Suspended` and `Rejected` movers must not be allowed to purchase leads or contact customers
- Approved movers may immediately use unlocked contact information after `LeadPurchase`
- Internal messaging is not required for MVP; MVP contact flow is LeadPurchase → ContactAccess → contact details → Call or WhatsApp
- ContactAccess is the core concept, not WhatsApp specifically

## Customer dashboard behavior

- The customer dashboard should show request status, route, date, views, and Premium offers received
- The customer can view, edit when allowed, or cancel the request
- Material edits must be version-aware when prior commercial interactions already exist

## Monetization v1

- MVP monetization is lead purchases plus Premium mover subscription
- There is no commission from the transportation transaction in MVP
- Premium subscription does not provide free customer contact data
- The Premium advantage is the ability to test customer interest by sending an offer before buying the lead

## Reviews

- Full reviews and ratings are deferred until after core marketplace validation
- The architecture should not prevent adding reviews later
- Fake ratings and fake review counts must not be displayed in the real product
