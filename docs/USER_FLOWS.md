# Movely User Flows

## 1. Customer onboarding and request creation

### Flow

Landing page → start request → choose request type → complete request details → review → create/confirm account → phone verification → publish

### Notes

- Customers must be able to begin without immediate registration
- The request remains a draft until the customer confirms the account and phone number
- After publish, the request remains associated with the customer account
- Duplicate detection may warn the customer before publish and offer either to open an existing request or continue anyway
- If the customer already has the configured maximum number of active requests, they must close or cancel one before publishing another

## 2. Apartment move wizard

### Steps

1. Select move type
2. Enter pickup and destination details
3. Enter apartment details
4. Add boxes and large-item inventory
5. Add additional services
6. Select moving date and budget
7. Upload photos and review request
8. Confirm account and verify phone
9. Publish request

### Expected behavior

- Each step should feel focused and lightweight
- The form should adapt based on prior answers
- The review screen must summarize the full request before publish

## 3. Small move wizard

### Steps

1. Select move type / item
2. Enter item details and photos
3. Enter pickup and destination details
4. Confirm access / floor / elevator details
5. Select moving date and budget
6. Review request
7. Confirm account and verify phone
8. Publish request

### Expected behavior

- Item-specific fields should appear only when needed
- Photos should be strongly encouraged
- The review screen must clearly show the transport path and item summary

## 4. Published request lifecycle

### Flow

Published request → Active marketplace visibility → customer continues search or closes search → request may become Closed or later Expired

### Notes

- `Published` is a transitional/system state
- `Active` is the marketplace-visible state
- Closing is a deliberate customer action
- Expiration is time-based or future-rule-based
- If the customer chooses another mover, the request still closes normally and all participating movers are informed

## 5. Customer post-publish dashboard

### Flow

Published request → dashboard view → view status, views, and offers → edit or cancel when allowed

### Notes

- Customers should see the status of their current request
- Premium offers should be visible in a customer-friendly format
- The dashboard should explain when edits are allowed versus restricted

## 6. Premium offer review by customer

### Flow

Customer receives offer → opens offer card → reviews included services and proposed terms → chooses “I'm interested” or “Not suitable”

### Notes

- Selecting “I'm interested” notifies the mover
- The action is a soft signal only
- The mover still does not receive contact details until lead purchase
- The customer should be able to compare offers, not just react to one
- Choosing “Not suitable” rejects that mover for the request and prevents further activity for that mover on that request

## 7. Regular mover marketplace browsing

### Flow

Mover signs in → opens marketplace → filters requests → opens request details → buys lead → contact unlocks

### Notes

- Marketplace browsing is free
- Contact details remain locked until purchase succeeds
- Request cards should expose enough data for fit assessment without revealing protected details
- Once the request is sold out, it remains visible but not purchasable
- If a mover has already been rejected for the request, the UI must not offer a buy or offer action for that mover on that request

## 8. Premium mover offer flow

### Flow A

Mover signs in → opens marketplace → opens request details → sends offer → customer becomes interested → mover buys lead → contact unlocks

### Flow B

Mover signs in → opens request details → buys lead directly → contact unlocks

### Notes

- The offer form must include more than price
- Premium status changes what the mover can do before purchase, not what contact data they can see
- Only one active offer is allowed per mover per request

## 9. Lead purchase and contact access

### Flow

Request details page → Buy Lead → atomic wallet debit / validation / purchase / contact unlock → success state

### Notes

- Authorization must be enforced by the backend
- The frontend should not receive protected customer data before authorization
- Lead purchase should reflect remaining buyer capacity for the request
- If purchase fails, no wallet debit should remain
- After purchase, the mover may immediately call or WhatsApp using the unlocked contact information

## 10. Lead limit and sold-out behavior

### Flow

Mover purchases lead → buyer count increases → request remains available until maximum buyer count is reached → request becomes sold out to additional purchases

### Notes

- Sold out is a separate lead-sales state
- Existing purchases remain valid
- Existing premium offers remain visible
- The request itself may still be Active
- Sold out does not automatically revoke previously granted contact access

## 11. Wallet and balance flow

### Flow

Mover adds funds → wallet balance updates → mover buys lead → balance decreases → transaction history records the event

### Notes

- Wallet top-ups are part of the future monetization model
- Refunds should prefer wallet credit
- Auto-recharge is a future enhancement
- If a move request is later found to be a duplicate and the purchase was for the duplicate lead, refund review may be possible

## 12. Invalid lead refund flow

### Flow

Mover reports invalid lead → selects reason → adds optional evidence → admin review → refund approved or rejected → wallet credit is adjusted if approved

### Notes

- Refund rules distinguish invalid lead issues from buyer preference or competitive outcomes
- Duplicate and closed-before-purchase cases are explicitly valid review reasons

## 13. Request editing and stale interactions

### Flow

Customer edits request after publication → system checks whether edits are minor or material → versioning rules apply when required → movers are notified if their data is stale

### Notes

- Minor edits may be allowed freely when no one has interacted yet
- Material edits create a new request version once lead purchases or offers already exist
- Purchased movers should be notified about material changes
- After a mover is rejected by the customer, the request should no longer present that mover with a path to re-enter for the same request

## 14. Cancellation flow

### Flow

Customer chooses “I found a mover” or “Close search” → confirms action → request becomes Closed → lead sales close

### Notes

- Cancellation is allowed even after lead purchases
- Existing purchasers keep historical records
- Cancellation after a valid purchase does not automatically mean refund
- Choosing another mover is not itself a refund event

## 15. Account and role boundaries

### Flow

- Customer can begin without immediate signup, then confirm before publish
- Mover must register before business actions
- Admin access is separate and protected

### Notes

- The app should not mix customer and mover permissions
- Contact access, marketplace browsing, and publishing must be role-aware
