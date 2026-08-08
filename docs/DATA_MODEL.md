# Movely Data Model

This is a conceptual production-ready model, not a migration script.

## 1. Modeling principles

- `MoveRequest` is the aggregate root for a customer request
- `MoveRequestVersion` is an immutable snapshot of request content
- Lead purchases and premium offers must reference the request version they were based on
- Wallet state is ledger-based, not balance-only
- Protected customer contact data must not be copied into marketplace-facing projections
- Files/photos are stored externally; the database stores references and metadata

## 2. Entity overview

| Entity | Purpose |
|---|---|
| User | Core identity for customers, movers, and admins |
| UserAuthIdentity | Links a user to Google or phone-based authentication identity |
| PhoneVerification | Tracks phone OTP challenges and verification status |
| Business | Mover business profile and operational identity |
| BusinessVerification | Tracks verification state and review history |
| BusinessSubscription | Tracks Premium subscription state |
| MoveRequest | Root request record and lifecycle state |
| MoveRequestVersion | Immutable content snapshot for a request version |
| MoveLocation | Pickup/destination location snapshot for a request version |
| MoveItem | Inventory / item snapshot for a request version |
| MovePhoto | Photo metadata and object references |
| PremiumOffer | Offer aggregate per mover/request |
| PremiumOfferVersion | Immutable offer snapshot and edits |
| LeadPurchase | Paid purchase of access to a request |
| ContactAccess | Grant of protected contact access derived from a purchase |
| Wallet | Ledger container for a mover business |
| WalletTransaction | Immutable wallet ledger entries |
| RefundClaim | Claim and review record for invalid leads |
| CustomerMoverInteraction | Relationship state between a mover and a request |
| AdminAuditLog | Administrative and security audit trail |

Future entities:

- Notification
- Review
- Message

## 3. User

### Purpose

Represents a person account that may act as customer, mover, admin, or more than one role over time.

### Key fields

- UserId
- DisplayName
- PrimaryEmail, optional
- PhoneNumber, optional
- AccountStatus
- CreatedAt
- UpdatedAt

### Relationships

- One user can have many auth identities
- One user can own customer requests
- One user can own or manage a business
- One user can be assigned admin role

### Constraints

- User identity must be unique
- Role assignments should be separate from base identity

### Sensitive data

- Email and phone are sensitive

## 4. UserAuthIdentity

### Purpose

Maps a user to an authentication source such as Google or phone-based login.

### Key fields

- UserAuthIdentityId
- UserId
- ProviderType
- ProviderSubject
- NormalizedEmail, optional
- CreatedAt
- LastUsedAt

### Relationships

- Many identities belong to one user

### Constraints

- Unique `(ProviderType, ProviderSubject)`

### Sensitive data

- Provider subject and linked identifiers are sensitive operational data

## 5. PhoneVerification

### Purpose

Tracks OTP challenge state for phone verification.

### Key fields

- PhoneVerificationId
- UserId
- PhoneNumber
- Purpose
- OtpHash
- ExpiresAt
- AttemptCount
- VerifiedAt, nullable
- CreatedAt

### Relationships

- Many verification attempts can belong to one user or phone number over time

### Constraints

- Only one active verification challenge should exist per user-purpose pair at a time

### Sensitive data

- Phone number and OTP state are sensitive

## 6. Business

### Purpose

Represents a mover business profile, operational identity, and service footprint.

### Key fields

- BusinessId
- OwnerUserId
- BusinessName
- OwnerContactName
- Description
- ServiceAreas
- SupportedMoveTypes
- BusinessStatus
- CreatedAt
- UpdatedAt

### Relationships

- One business belongs to one owner user for MVP
- One business has verification state
- One business has one wallet
- One business may have many lead purchases and offers

### Constraints

- Business should be uniquely owned per MVP account model

### Sensitive data

- Business contact information may be sensitive

## 7. BusinessVerification

### Purpose

Tracks mover verification lifecycle and review history.

### Key fields

- BusinessVerificationId
- BusinessId
- Status
- ReviewedByAdminUserId, nullable
- ReviewedAt, nullable
- RejectionReason, nullable
- SuspensionReason, nullable
- CreatedAt
- UpdatedAt

### Relationships

- One business can have one current verification record, with history captured via audit

### Constraints

- Status values: PendingVerification, Verified, Suspended, Rejected

### Sensitive data

- Review notes and reasons are operationally sensitive

## 8. BusinessSubscription

### Purpose

Tracks Premium subscription state for a business.

### Key fields

- BusinessSubscriptionId
- BusinessId
- Status
- StartAt
- EndsAt
- CancelledAt, nullable
- PastDueAt, nullable
- CreatedAt

### Relationships

- One business can have one current subscription state record

### Constraints

- Status values: Inactive, Active, PastDue, Cancelled, Expired

### Sensitive data

- Subscription state is commercial data

## 9. MoveRequest

### Purpose

The request aggregate root. Holds lifecycle, current version pointer, publishing state, lead-sales state, and customer ownership.

### Key fields

- MoveRequestId
- CustomerUserId
- CurrentVersionId
- MoveRequestStatus
- LeadSalesStatus
- LeadPriceCurrent
- BuyerLimit
- ActiveBuyerCount
- DuplicateRiskFlag
- PublishedAt, nullable
- ClosedAt, nullable
- CancelledAt, nullable
- ExpiredAt, nullable
- CreatedAt
- UpdatedAt

### Relationships

- One request has many versions
- One request has many lead purchases
- One request has many premium offers
- One request may have many interaction records

### Constraints

- Only the owner customer may edit or close it
- `LeadSalesStatus` is independent from `MoveRequestStatus`
- `ActiveBuyerCount` must never exceed `BuyerLimit`

### Sensitive data

- Root request may contain pointers to protected data through versions

## 10. MoveRequestVersion

### Purpose

Immutable snapshot of a request at a point in time. This is the commercial truth for offers and lead purchases.

### Key fields

- MoveRequestVersionId
- MoveRequestId
- VersionNumber
- BasedOnVersionId, nullable
- IsMaterialVersion
- CreatedByUserId
- CreatedAt
- Snapshot of request content

Snapshot content should include:

- move type
- request title / summary
- date and time preference
- budget band
- customer comments
- pickup and destination location references
- apartment or item details
- services and special items
- active flags relevant to the version

### Relationships

- Many versions belong to one request
- One version may be the basis for many offers or purchases

### Constraints

- Unique `(MoveRequestId, VersionNumber)`
- Immutable after creation

### Sensitive data

- Version content may include protected contact/address fields in the authoritative backend record

## 11. MoveLocation

### Purpose

Stores pickup or destination location snapshot for a request version.

### Key fields

- MoveLocationId
- MoveRequestVersionId
- LocationType (`Pickup` or `Destination`)
- City
- Area, optional
- ExactAddress
- Floor, optional
- ElevatorAvailable
- ElevatorFitsLargeFurniture
- HasStairs
- TruckAccessNotes
- ParkingDistanceFromEntrance, optional

### Relationships

- Each request version has zero, one, or two location records depending on request type and step completion

### Constraints

- Unique `(MoveRequestVersionId, LocationType)`

### Sensitive data

- ExactAddress is protected data

## 12. MoveItem

### Purpose

Stores apartment inventory and small-move item details for a request version.

### Key fields

- MoveItemId
- MoveRequestVersionId
- ItemType
- Category
- Description
- Quantity
- Length, optional
- Width, optional
- Height, optional
- ApproximateWeight, optional
- IsSpecialItem
- IsLargeItem

### Relationships

- Many items belong to one request version

### Constraints

- Item type and category depend on request category

### Sensitive data

- Usually not highly sensitive, but may reveal move complexity

## 13. MovePhoto

### Purpose

Metadata for photos attached to a request version.

### Key fields

- MovePhotoId
- MoveRequestVersionId
- ObjectKey
- FileName
- ContentType
- SizeBytes
- Width, optional
- Height, optional
- SortOrder
- Caption, optional
- CreatedAt

### Relationships

- Many photos belong to one request version

### Constraints

- ObjectKey must be unique in storage

### Sensitive data

- Photos can contain personal and location-sensitive content

## 14. PremiumOffer

### Purpose

Offer aggregate for a mover business on a specific move request.

### Key fields

- PremiumOfferId
- MoveRequestId
- MoveRequestVersionId
- BusinessId
- CurrentOfferVersionId
- OfferStatus
- CustomerReactionStatus
- CreatedAt
- UpdatedAt

### Relationships

- One mover business may have at most one active offer per request
- One offer has many versions

### Constraints

- Unique `(MoveRequestId, BusinessId)`
- Only verified Premium businesses may create one

### Sensitive data

- Offer content is commercial data

## 15. PremiumOfferVersion

### Purpose

Immutable snapshot of a premium offer revision.

### Key fields

- PremiumOfferVersionId
- PremiumOfferId
- MoveRequestVersionId
- VersionNumber
- ProposedPrice
- ArrivalWindow
- WorkerCount
- IncludedServices
- ExcludedServices
- ExtraCharges
- MessageToCustomer
- CreatedAt

### Relationships

- Many versions belong to one premium offer
- Each version ties to one request version

### Constraints

- Unique `(PremiumOfferId, VersionNumber)`
- Immutable after creation

### Sensitive data

- Commercial details are sensitive

## 16. LeadPurchase

### Purpose

Represents one successful paid lead purchase.

### Key fields

- LeadPurchaseId
- MoveRequestId
- MoveRequestVersionId
- BusinessId
- PurchasedByUserId
- WalletTransactionId
- PricePaid
- PurchasedAt
- PurchaseStatus
- CreatedAt

### Relationships

- One request can have many lead purchases, limited by buyer limit
- One business can purchase a request at most once
- One lead purchase grants one contact access record

### Constraints

- Unique `(MoveRequestId, BusinessId)`
- Must reference the request version used for the commercial decision

### Sensitive data

- Purchase history is commercially sensitive

## 17. ContactAccess

### Purpose

Represents the authorization grant that allows a mover to see protected customer contact data after purchase.

### Key fields

- ContactAccessId
- LeadPurchaseId
- GrantedAt
- AccessStatus
- AccessScope

### Relationships

- One contact access corresponds to one successful lead purchase

### Constraints

- One-to-one with LeadPurchase for MVP

### Sensitive data

- This entity directly controls protected data exposure

## 18. Wallet

### Purpose

Ledger container and cached balance for a mover business.

### Key fields

- WalletId
- BusinessId
- Currency
- CachedBalance
- LedgerVersion
- CreatedAt
- UpdatedAt

### Relationships

- One wallet belongs to one business
- One wallet has many transactions

### Constraints

- Currency should be ILS for MVP
- Balance must not drift from ledger state

### Sensitive data

- Financial state is sensitive

## 19. WalletTransaction

### Purpose

Immutable ledger entry for wallet changes.

### Key fields

- WalletTransactionId
- WalletId
- TransactionType
- Amount
- Direction
- RelatedLeadPurchaseId, nullable
- RelatedRefundClaimId, nullable
- RelatedAdminUserId, nullable
- IdempotencyKey
- BalanceAfter
- CreatedAt

### Relationships

- Many transactions belong to one wallet

### Constraints

- Idempotency key should be unique per business operation
- A lead purchase debit must reference the related purchase

### Sensitive data

- Financial transaction details are sensitive

## 20. RefundClaim

### Purpose

Tracks an invalid-lead claim and the review outcome.

### Key fields

- RefundClaimId
- LeadPurchaseId
- ReasonCode
- ReasonText
- EvidenceObjectKey, nullable
- Status
- ReviewedByAdminUserId, nullable
- ReviewedAt, nullable
- ResolutionNotes, nullable
- ResultingWalletTransactionId, nullable
- CreatedAt

### Relationships

- One lead purchase can have many claims over time, though policy may limit that later

### Constraints

- Status values: Pending, Approved, Rejected

### Sensitive data

- May contain evidence and dispute details

## 21. CustomerMoverInteraction

### Purpose

Materialized relationship state between a customer request and a mover business.

### Key fields

- CustomerMoverInteractionId
- MoveRequestId
- BusinessId
- State
- ActiveOfferId, nullable
- LeadPurchaseId, nullable
- RejectedAt, nullable
- BlockedAt, nullable
- CustomerInterestedAt, nullable
- CreatedAt
- UpdatedAt

### Relationships

- One row per mover/request pair

### Constraints

- Unique `(MoveRequestId, BusinessId)`

### Sensitive data

- Contains business interaction state and moderation-sensitive history

### Notes

This entity can be materialized for fast authorization checks and clean UI state rendering.

## 22. AdminAuditLog

### Purpose

Immutable record of important administrative and security actions.

### Key fields

- AdminAuditLogId
- ActorUserId
- ActionType
- EntityType
- EntityId
- BeforeSnapshotRedacted
- AfterSnapshotRedacted
- IpAddress
- UserAgent
- CreatedAt

### Relationships

- One admin action can produce one audit record or many, depending on implementation

### Constraints

- Audit records should be append-only

### Sensitive data

- Must be redacted; should never contain raw secrets or full protected contact payloads

## 23. Future entities

### Notification

Will represent in-app and out-of-band events later.

### Review

Will represent customer or mover reviews once the product decides to enable ratings.

### Message

Will represent future internal messaging if added post-MVP.

## 24. Request versioning model

Recommended behavior:

- `MoveRequest` is the mutable aggregate root for status and current version pointer
- `MoveRequestVersion` is immutable once created
- Every commercial interaction references a version
- A material edit after interaction creates a new version
- Old versions remain readable for audit and support
- `LeadPurchase` stores the exact version purchased
- `PremiumOfferVersion` stores the exact request version it was priced against

This preserves historical truth and supports stale-offer detection cleanly.

