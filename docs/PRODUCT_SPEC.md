# Movely Product Specification

## 1. Product summary

Movely is a responsive marketplace web application for moving and transportation services in Israel.

The platform connects:

- Customers who need items or homes transported
- Movers who want to discover and purchase relevant requests
- Admins who govern verification, pricing, moderation, and support

This is a web application for desktop, tablet, and mobile browsers. It is not a native mobile app.

## 2. Product goals

Movely should:

- Let customers create and publish moving requests with a guided wizard
- Let movers browse published requests and decide whether to pursue them
- Protect customer identity and contact details until a mover is authorized
- Support lead monetization as the initial business model
- Leave room for premium mover offers, wallet balances, refunds, subscriptions, messaging, and admin tooling later

## 3. Primary roles

### Customer

Creates a moving request, confirms an account before publishing, manages the request after publishing, and may review premium offers.

### Mover

A moving company or independent transportation provider. Registers before using business functionality, browses the marketplace, and may purchase leads or send premium offers.

### Admin

Separately protected platform role responsible for governance, review, configuration, and support workflows.

## 4. Authentication and access model

### Customer authentication

Customers must not be forced to register immediately on landing.

Expected flow:

Landing page → start request → complete request → review → create/confirm account → enter phone number → SMS OTP → phone verified → publish request

Google authentication may help with account creation, but it does not replace phone verification.

The platform should also include basic anti-abuse safeguards for customer requests, including server-side rate limiting, duplicate request detection, a configurable maximum number of active requests per customer, and admin suspension support for abusive accounts.

The request must remain associated with the customer account once confirmed.

### Mover authentication

Movers must register before accessing marketplace or business functionality.

Mover onboarding should eventually support:

- Google sign-in
- phone verification
- business profile
- verification status

### Admin authentication

Admins are separate protected users with elevated access.

## 5. Core domain model

The primary business entity is named `MoveRequest`.

Draft requests must never appear in the public marketplace.

`MoveRequestStatus` is separate from `LeadSalesStatus`.

### MoveRequestStatus

- Draft
- Published
- Active
- Closed
- Cancelled
- Expired

### LeadSalesStatus

- Available
- SoldOut
- Closed

A `MoveRequest` may therefore be `Active` while its lead sales are `SoldOut`.

The architecture should also preserve relationship state between a specific mover and a specific request/customer, such as:

- no interaction
- active Premium offer
- customer interested
- rejected by customer
- lead purchased
- blocked

## 6. Request types

Movely supports two main request categories:

### Apartment Move

For a full apartment or home move.

### Small Move / Item Transportation

For one or several items such as:

- sofa
- refrigerator
- television
- electronics
- equipment
- boxes
- furniture
- other items

The request form must adapt dynamically to the selected request type.

## 7. Apartment move data

For apartment moves, the request should collect:

### Pickup

- city
- address
- floor
- elevator yes/no
- whether the elevator fits large furniture
- stairs
- truck access / parking distance from entrance

### Destination

- city
- address
- floor
- elevator yes/no
- whether the elevator fits large furniture
- stairs
- truck access / parking distance from entrance

### Apartment

- number of rooms

### Boxes

- small boxes count
- medium boxes count
- large boxes count

### Large item inventory

Examples:

- sofa
- bed
- mattress
- wardrobe
- dresser
- table
- chairs
- refrigerator
- washing machine
- dryer
- oven
- television
- desk
- bookshelf
- custom item

### Additional services

- furniture disassembly
- furniture assembly
- packing help
- packing materials

### Special items

- piano
- safe
- oversized refrigerator
- glass
- artwork
- antiques
- heavy objects
- fragile equipment
- other

### Photos

Customers may upload photos of rooms, furniture, boxes, and important items.

Photos are optional but strongly recommended.

## 8. Small move data

For small moves, the request should collect:

### Item category

- furniture
- electronics
- appliance
- boxes
- equipment
- other

### Item details

- item name / description
- quantity
- optional dimensions: length, width, height
- optional approximate weight

### Photos

Photos should be strongly encouraged.

### Pickup

- city
- address
- floor
- elevator
- stairs
- truck access

### Destination

- city
- address
- floor
- elevator
- stairs
- truck access

## 9. Date and time preference

Customers specify:

- moving date
- preferred time: morning, afternoon, evening, or flexible
- date flexibility: exact date, ±1 day, ±3 days, or within one week

## 10. Customer budget

Customers may select a budget band:

- up to ₪1,000
- ₪1,000–1,500
- ₪1,500–2,000
- ₪2,000–3,000
- ₪3,000–5,000
- ₪5,000+
- I don't know

Budget must be stored structurally so the display rules can change later without changing the underlying data model.

## 11. Customer wizard experience

Movely must not use one giant form.

### Apartment move wizard

1. Move type
2. Pickup and destination
3. Apartment details
4. Boxes and inventory
5. Additional services
6. Date and budget
7. Photos and review
8. Account confirmation
9. Publish

### Small move wizard

1. Move type / item
2. Item details and photos
3. Pickup and destination
4. Access / floor / elevator
5. Date and budget
6. Review
7. Account confirmation
8. Publish

Before publishing, the customer must see a review screen containing all important information.

## 12. Marketplace experience

Movers access a marketplace page containing published requests.

Marketplace supports:

- Apartment Moves
- Small Moves

Movers can search and filter requests by:

- request type
- pickup city
- destination city
- moving date / date range
- customer budget
- number of rooms
- elevator
- photos available
- boxes
- special/heavy items
- distance from mover’s service area

Sorting options:

- newest first
- moving date
- closest to mover
- highest budget
- requests with photos

Default sorting is newest first.

Marketplace cards must show enough information for movers to judge relevance, but must not expose locked customer identity or exact address data.

When a request reaches `LeadSalesStatus = SoldOut`, the marketplace may still display it with a sold-out state.

If a customer rejects or blocks a mover, the marketplace and request details experience must respect that relationship state for that specific mover.

## 13. Request details experience

Movers may open a full request page and see:

- route at city/area level
- move date
- access/floors/elevators
- apartment or item information
- inventory
- boxes
- special items
- additional services
- photos
- customer budget
- customer comments

Customer contact remains locked until authorization is granted through lead purchase.

## 14. Lead monetization

Lead purchase is the primary monetization model at this stage.

Movers can browse requests for free.

If a request is relevant, the mover can purchase access to the lead.

The system must support per-request configurable lead pricing.

Each `MoveRequest` stores its own `LeadPrice`, and each `LeadPurchase` stores the actual `PricePaid` as a snapshot.

Expected early examples are approximately ₪5–₪10, but the exact price must not be hard-coded.

Admin must eventually be able to configure lead pricing.

## 15. Lead purchase and contact unlock

Buying a lead is one atomic backend business operation.

The operation conceptually includes:

1. Validate mover authorization
2. Validate mover verification state
3. Validate request state
4. Validate lead availability
5. Validate mover has not already purchased the same `MoveRequest`
6. Validate wallet balance
7. Debit wallet
8. Create `LeadPurchase`
9. Grant `ContactAccess`
10. Consume one buyer slot

The business result must be all-or-nothing.

Before purchase, movers may see only marketplace-safe request information.

Do not expose through frontend or API before authorization:

- customer full name
- phone number
- email if stored
- exact pickup address
- exact destination address
- any other protected contact information

Before purchase, route information is shown at city/area level.

After valid `LeadPurchase`, unlock:

- customer name
- customer phone number
- Call or WhatsApp as contact actions
- exact pickup address
- exact destination address
- complete request information

Email is not required as a primary contact field for MVP.

The backend response itself must exclude protected fields when access is not authorized.

No additional customer approval is required after purchase before the mover may use the unlocked contact information.

## 16. Lead purchase limits

A `MoveRequest` may be purchased by a limited number of movers.

Default maximum buyers per request:

- 3

This value must be configurable rather than embedded as fixed UI behavior.

When purchases reach the maximum:

- `LeadSalesStatus = SoldOut`
- no additional mover may buy the lead
- no new Premium mover may submit a new offer
- existing purchases remain valid
- existing Premium offers and interactions remain visible

## 17. Premium mover subscription

Movely will eventually offer a Premium subscription for movers.

Premium advantage:

- a Premium mover can submit an offer before purchasing lead/contact information
- the Premium mover still cannot see customer contact details
- the Premium mover may also purchase the lead immediately without sending an offer

Premium status does not provide free customer contact data.

The primary Premium advantage is the ability to test customer interest before buying the lead.

## 18. Premium offer data

An offer must support:

- proposed price
- expected arrival time or time window
- number of workers
- included services
- excluded services
- possible extra charges
- message to customer

An offer cannot consist only of a price.

If the customer explicitly marks an offer as “Not suitable,” that mover is rejected for that request and may not bypass the rejection by purchasing the lead or initiating further contact for the same request.

## 19. Customer dashboard

After publishing a request, the customer should see:

- route
- date
- request status
- number of views
- premium offers received

The customer can:

- view the request
- edit the request when allowed
- cancel the request

If important request information changes after movers have interacted with the request, the system must handle stale offers and purchases safely.

If the customer chooses another mover, historical lead purchases remain valid and unlocked contact access is not automatically revoked.

## 20. Premium offers for customers

Customers may receive premium mover offers such as:

- mover name
- rating
- proposed price
- included services

Customer actions:

- I'm interested
- Not suitable

If the customer selects “I'm interested,” the premium mover is notified.

This is a soft signal only:

- it does not reserve the request
- it does not reserve a lead buyer slot
- it does not reveal contact information
- it does not automatically charge the mover
- it does not block other movers
- it does not close the request

If the customer selects “Not suitable,” the offer becomes rejected for that mover and that mover may not submit another active offer for the same request, purchase the lead for that request, or initiate new contact through Movely for that request.

## 21. Regular mover flow

Regular movers cannot submit an offer before buying the lead.

Flow:

Marketplace → Request Details → Buy Lead → Contact unlocked → negotiate with customer directly

## 22. Premium mover flow

Premium movers may use either of these flows:

### Flow A

Marketplace → Request Details → Send Premium Offer → Customer clicks "I'm interested" → Mover may Buy Lead → Contact unlocked

### Flow B

Marketplace → Request Details → Buy Lead directly → Contact unlocked

## 23. Wallet model

Movely should eventually support a mover wallet / credit balance so movers do not need to process a card payment for every low-value lead.

Expected behavior:

- mover adds money to wallet
- wallet balance decreases on lead purchase
- wallet maintains transaction history

Wallet transaction types should include:

- lead purchase
- top-up
- refund credit
- admin adjustment

Future auto-recharge may be supported.

Payments are not implemented yet.

## 24. Lead protection and refunds

Movers should be able to report an invalid lead.

Potentially valid refund reasons:

- invalid / non-working phone number
- customer states that they never created the request
- duplicate request
- request was already closed / cancelled before purchase

These are not automatic refund reasons:

- customer does not answer immediately
- customer considers the mover too expensive
- customer changes their mind
- customer selects another mover
- mover fails to close the deal

Refunds should preferably return wallet credit rather than reversing an external payment whenever practical.

Admin review workflow is required.

Choosing another mover is not itself a refund reason.

## 25. Request lifecycle

The customer controls the clear closing action.

Customer may explicitly choose:

- I found a mover
- Close search

After confirmation:

- `MoveRequestStatus = Closed`
- `LeadSalesStatus = Closed`

Then:

- no new lead purchases
- no new Premium offers

If the customer does not close the request and the relevant move date passes, the request may later become `Expired` according to expiration rules.

If the customer closes the request because they found a mover, all participating movers should be informed that the request has closed. Historical purchases remain valid and previously granted contact access must not automatically be revoked.

Cancellation is distinct from closing the search. If the customer cancels the transportation request/search, the request becomes:

- `MoveRequestStatus = Cancelled`
- `LeadSalesStatus = Closed`

## 26. Mover profile

Mover profiles should eventually contain:

- company name
- owner / contact person
- logo
- description
- service areas
- move types
- business verification
- rating
- review count
- completed jobs
- photos / portfolio
- Premium subscription state

Premium must never artificially improve rating.

Premium status may have its own badge.

## 27. Saved searches

Movers should eventually be able to save frequently used searches, for example:

“Central Israel Apartments”

Premium may have enhanced saved filters and faster notifications.

## 28. Responsive UX expectations

The application must be mobile-first and responsive.

Desktop should support full marketplace and dashboard layouts.

Mobile should use:

- cards
- bottom sheets for filters
- simple wizard steps
- large touch targets
- sticky primary actions where useful

The product must not be designed as desktop-only.

## 29. Privacy and security principles

Personal customer information is protected data.

Never expose locked customer data through:

- API payloads
- HTML
- frontend state
- hidden DOM
- CSS masking

before mover authorization.

Backend authorization is the source of truth for whether the current mover can access contact data.

Exact pickup and destination address should also remain protected until the appropriate stage.

The architecture must preserve the distinction between rejected by customer and blocked, because blocking is a stronger interaction state and may later connect to moderation or reporting.

## 30. Future scope

The architecture should leave room for, but not implement yet:

- internal messaging
- SMS notifications
- WhatsApp integration
- email notifications
- mover analytics
- recommendation or matching engine
- dynamic lead pricing
- subscription billing
- admin dashboard
- payment provider integration
- booking through Movely
- commission model
- PWA support
- multilingual support
- Hebrew RTL
- English
- Russian

Initial market:

- Israel

Currency:

- ILS / ₪

Full reviews and ratings are deferred until after core marketplace validation.
