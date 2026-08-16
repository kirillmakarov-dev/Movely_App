# Movely Decision Log

## D-001 — Move request lifecycle

- Status: Accepted
- Decision: `MoveRequestStatus` is separate from `LeadSalesStatus`. `MoveRequestStatus` values are Draft, Published, Active, Closed, Cancelled, and Expired. `LeadSalesStatus` values are Available, SoldOut, and Closed.
- Rationale: Lead availability and request lifecycle are related but not the same business concept, so they must not be collapsed into one status.
- Affected areas: `MoveRequest`, marketplace visibility, customer dashboard, admin tools, request lifecycle logic.

## D-003 — Sold out after maximum lead buyers

- Status: Accepted
- Decision: The default maximum number of lead buyers per request is 3, the value is configurable, and sold out blocks additional purchases and new Premium offers while the request may remain Active.
- Rationale: Capacity needs to be enforced without closing the whole request prematurely.
- Affected areas: lead purchase logic, marketplace cards, request details page, Premium offer flow.

## D-005 — Final slot purchase race condition

- Status: Accepted
- Decision: The backend must enforce the final available lead slot atomically so only one of two simultaneous purchases can succeed.
- Rationale: Frontend checks alone cannot prevent overselling.
- Affected areas: lead purchase API, wallet debit, `LeadPurchase`, `ContactAccess`, audit trail.

## D-006 + D-009 — Purchase, wallet debit, and contact access atomicity

- Status: Accepted
- Decision: Buying a lead is one atomic backend operation that validates authorization, verification, request state, availability, duplicate purchase, and wallet balance, then debits the wallet, creates the lead purchase, grants contact access, and consumes one slot. The result must be all-or-nothing.
- Rationale: Payment and access must never diverge into a partially completed state.
- Affected areas: wallet, lead purchase API, contact access, transaction history, error recovery.

## D-014 — Duplicate requests

- Status: Accepted
- Decision: Movely must detect likely duplicate `MoveRequest`s using signals such as same customer, same move type, similar pickup and destination locations, and nearby move dates. Before publication, the customer should be warned and offered the choice to open an existing request or continue anyway. If the customer continues, the request may be published with an internal duplicate-risk flag.
- Rationale: Legitimate customers may need similar requests, so duplicates should be flagged rather than hard-blocked.
- Affected areas: request creation, duplicate detection, moderation, admin review, refund review.

## D-007 — Data unlocked after lead purchase

- Status: Accepted
- Decision: Before purchase, only marketplace-safe city/area level data may be shown. After purchase, unlock customer name, phone number, WhatsApp action, exact pickup address, exact destination address, and complete request information. Email is not required for MVP.
- Rationale: The marketplace must protect personal data until authorization is granted.
- Affected areas: API authorization, request details page, contact actions, frontend payloads.

## D-010 — Invalid lead refunds

- Status: Accepted
- Decision: Valid refund review reasons include invalid phone number, customer denying the request, duplicate request, and request already closed/cancelled before purchase. Non-refund reasons include slow response, price disagreement, customer changing their mind, choosing another mover, or mover failure to close the deal. MVP refund flow is Report Lead → reason → optional evidence → Admin Review → Approved/Rejected. Approved refunds should return wallet credit when practical.
- Rationale: Refunds must protect honest movers without opening an abuse loop.
- Affected areas: refund workflow, wallet credit, admin review, dispute handling.

## D-011 — Editing a published request

- Status: Accepted
- Decision: Minor changes may be made freely before commercial interaction. Material changes after lead purchases or Premium offers must create a new request version. Existing purchasers keep their historical access and movers with purchases must be notified of material changes.
- Rationale: Buyers need a stable record of the commercial request they acted on.
- Affected areas: `MoveRequest`, versioning, offers, lead purchases, notifications, customer dashboard.

## D-016 — Customer rejecting or blocking a mover

- Status: Accepted
- Decision: “Not suitable” sets the Premium offer to Rejected and prevents that mover from submitting another active offer for the request, purchasing the lead for that request, or initiating new contact through Movely for that request. Blocking is a stronger action that prevents further interaction with that customer/request through Movely. The architecture must preserve the distinction between rejected by customer and blocked.
- Rationale: A customer rejection must not be bypassable by simply buying the contact later.
- Affected areas: offer lifecycle, contact access, mover access rules, moderation, future reporting features.

## D-013 — Premium offers after material edits

- Status: Accepted
- Decision: If a material change creates a new request version, older Premium offers become Stale. Movers may review the changes, update the offer, or withdraw it.
- Rationale: Offers must track the version of the request they were priced against.
- Affected areas: offer lifecycle, customer offer inbox, mover offer composer, request versioning.

## D-015 — When a request is closed

- Status: Accepted
- Decision: A request is not closed merely because a mover purchased the lead, a Premium offer was submitted, or the customer clicked “I'm interested.” The customer explicitly closes the search by choosing “I found a mover” or “Close search,” which sets `MoveRequestStatus = Closed` and `LeadSalesStatus = Closed`.
- Rationale: The customer should control the explicit closing action.
- Affected areas: request lifecycle, customer dashboard, marketplace visibility, lead sales, Premium offers.

## D-017 — Contact after lead purchase

- Status: Accepted
- Decision: After a successful `LeadPurchase`, the mover may immediately use the unlocked contact information. No additional customer approval is required after purchase.
- Rationale: The purpose of lead purchase is to grant immediate authorized contact access.
- Affected areas: `LeadPurchase`, `ContactAccess`, contact actions, request details page, authorization flow.

## D-018 — Internal chat vs external contact

- Status: Accepted
- Decision: Internal messaging is not required for MVP. The MVP contact flow after `LeadPurchase` is `LeadPurchase` → `ContactAccess` → customer name / phone / exact locations → call or WhatsApp. The core concept is `ContactAccess`, not WhatsApp specifically.
- Rationale: The product should not depend on a specific external channel, and internal messaging can be added later.
- Affected areas: contact model, request details page, future messaging roadmap, contact actions.

## D-019 — Premium offer lifecycle

- Status: Accepted
- Decision: A mover may have at most one active Premium offer per request. Offers can be created, edited, and withdrawn. Offer statuses are Draft, Active, Interested, Rejected, Stale, Withdrawn, and Expired.
- Rationale: One active offer per mover keeps the customer experience understandable.
- Affected areas: offer entity, mover UI, customer UI, notifications, stale-state handling.

## D-020 — Meaning of “I'm interested”

- Status: Accepted
- Decision: Customer “I'm interested” is a soft signal only. It does not reserve the request, reserve a buyer slot, reveal contact information, auto-charge the mover, block other movers, or close the request.
- Rationale: Interest should be lightweight and not change ownership or availability.
- Affected areas: customer offer actions, mover notifications, request state, lead purchase logic.

## D-022 — Mover business verification

- Status: Accepted
- Decision: `PendingVerification` allows limited marketplace preview and business profile setup but does not allow Buy Lead, Send Premium Offer, or protected customer data access. Full business actions require `Verified`. `Suspended` and `Rejected` movers must not purchase leads or contact customers.
- Rationale: Business actions should be gated until verification reaches the required threshold.
- Affected areas: mover onboarding, marketplace access, verification workflow, authorization checks.

## D-024 — Customer phone verification

- Status: Accepted
- Decision: Customer phone verification is mandatory before publishing a request. Google authentication does not replace it.
- Rationale: Movely sells paid access to customer contacts and must not publish unverified leads.
- Affected areas: publish flow, customer onboarding, account confirmation, fraud controls.

## D-025 — Customer request spam prevention

- Status: Accepted
- Decision: MVP must include basic anti-abuse safeguards, including phone OTP verification before publishing, server-side rate limiting, duplicate request detection, a configurable maximum number of active requests per customer, and admin suspension support for abusive customers. The initial expected maximum active requests per customer is 3 and must be configurable.
- Rationale: The marketplace requires baseline protection against spam, abuse, and request flooding.
- Affected areas: request creation, OTP flow, publish attempts, account creation, image uploads, admin suspension, abuse controls.

## D-026 — Lead price configuration

- Status: Accepted
- Decision: Each request has its own `LeadPrice`. `LeadPurchase` stores `PricePaid` as a snapshot. Admins can eventually override/configure pricing, and price history should be auditable.
- Rationale: Pricing must be configurable without mutating historical purchases.
- Affected areas: `MoveRequest`, `LeadPurchase`, pricing configuration, admin tools, wallet history.

## D-028 — Reviews and ratings

- Status: Accepted
- Decision: Full reviews and ratings are deferred until after core marketplace validation, and fake ratings or fake review counts must not be displayed.
- Rationale: Reviews are not required to prove the core lead marketplace.
- Affected areas: mover profile, customer dashboard, ranking, future moderation.

## D-052 — Duplicate purchase by same mover

- Status: Accepted
- Decision: A mover may purchase a given request at most once. The backend must enforce the uniqueness of mover plus request.
- Rationale: Multiple purchases by the same mover add no value and create billing confusion.
- Affected areas: lead purchase API, request details page, wallet, access control, UI state.

## D-053 — Customer cancellation after purchase

- Status: Accepted
- Decision: A customer may cancel a request even after movers purchased the lead. Cancellation means the customer cancelled the transportation request/search and sets `MoveRequestStatus = Cancelled` and `LeadSalesStatus = Closed`. If movers already purchased, existing purchasers retain the historical purchase record. Cancellation after a valid purchase does not automatically qualify for a refund.
- Rationale: Customers must retain control of their request, but cancellation should not erase valid purchases.
- Affected areas: request lifecycle, customer dashboard, lead purchase records, refund policy, notifications.

## D-054 — Customer chooses another mover

- Status: Accepted
- Decision: Lead purchase does not guarantee that the mover wins the transportation job. If the customer closes the request because they found a mover, `MoveRequestStatus = Closed` and `LeadSalesStatus = Closed`. All participating movers should be informed that the request has closed. Existing successful `LeadPurchase`s remain historically valid and previously granted `ContactAccess` must not automatically be revoked. Choosing another mover is not itself a refund reason.
- Rationale: The lead purchase bought contact access, not a guaranteed booking outcome.
- Affected areas: request lifecycle, notifications, lead purchase records, contact access, refund policy, customer dashboard.

## Monetization V1 — Accepted

- Status: Accepted
- Decision: MVP monetization is lead purchases plus Premium mover subscription. There is no commission from the transportation transaction in MVP. Premium does not provide free contact data; it mainly allows movers to test customer interest before buying the lead.
- Rationale: This keeps the initial business model focused and legible.
- Affected areas: monetization strategy, premium subscription, lead purchase flow, product positioning.
