# Business onboarding and manual review

Implemented stage 17, 2026-10-29. This is an application workflow, not proof that a production operator, official-registry integration or verification service is operating.

## Account and access

A Customer can submit one owned business without changing `Users.Role`. The session keeps the primary role in `movely_primary_role` and adds a Mover role claim when that Customer actually owns a business. No browser field assigns a role or a verification status. Customer request ownership, publishing and history remain intact. Legacy primary Mover accounts can verify their phone without receiving customer permissions. Admin accounts cannot submit business applications or review their own business.

`MoverOnly` means business context, not approval. Access to marketplace data requires `VerifiedMover`: mover capability, Verified business, verified phone, current site policies and the existing legal release gate. The database-backed session reloads business and phone state on every request. Changing a phone removes catalog access until the new phone is verified. A stable `ClaimTypes.NameIdentifier` binds antiforgery to the account rather than its mutable business/phone claims; tokens remain invalid for another user. See the [ASP.NET Core 10 identity extraction implementation](https://raw.githubusercontent.com/dotnet/aspnetcore/v10.0.0/src/Antiforgery/src/Internal/DefaultClaimUidExtractor.cs). Deployment can invalidate tokens held by older open pages; obtain a fresh page/token before retrying a rejected form, never automatically replay a mutation.

## Application data and disclosure

Submission requires current policies, a verified phone, an available legal gate and an unchecked representative-authority confirmation. Fields are business name, nine-digit registration number, registered address, representative name and 1–20 official locality codes for service areas. Nine digits are only a format check: the application does not prove registration, licensing, insurance, identity or authority from that number.

The registration number can identify an individual business owner. Treat it, the registered address and representative name as private verification information. The owner sees their own profile and messages intended for them. Only administrators see the account contact details and internal review notes. None of these fields are added to marketplace cards. Do not upload or solicit identity-document images through this workflow; no secure document-upload service is implemented here.

Every admin decision stores the reviewer, server timestamp, previous/new status, reviewed profile revision, review checks, owner-facing message, internal notes and a private JSON snapshot of the submitted business fields. The snapshot contains no session tokens or authentication headers. The current API does not return it to owners or the admin browser; it remains evidence in protected storage. The interface returns the latest 100 reviews and explicitly indicates when older records exist; the database retains the complete history. Older-record inspection/export requires an authorized operational process until a paginated audit interface is added.

Final privacy documents must cover these categories, review purposes, authorized recipients, corrections, retention and lawful deletion/redaction. Retention is not implemented or justified merely by making records append-only. Foreign-key restrictions and rollback guards prevent accidental loss; they are not a legal basis for indefinite storage. Operator identity, final documents, retention jobs and data-rights handling remain release requirements. Draft policies still prevent production submissions/approval.

## State transitions

| Actor/action | Required state | Result |
|---|---|---|
| Owner creates | No owned business | PendingVerification |
| Owner updates | PendingVerification or Rejected | PendingVerification, new revision |
| Owner changes verified profile | Verified plus explicit acknowledgement of rechecking | PendingVerification, catalog access stops |
| Owner edits suspended profile | Suspended | Rejected by server; administrative hold remains |
| Admin verifies | PendingVerification, complete profile, eligible owner, both manual checks, meaningful internal evidence note | Verified |
| Admin requests corrections | PendingVerification, owner-facing reason | Rejected |
| Admin suspends | Verified, owner-facing reason | Suspended |
| Admin reopens | Rejected or Suspended, owner-facing reason | PendingVerification |

Admin approval requires checking registration and representative authority outside the application and recording the sources/results. The checkboxes record a human assertion, not an automated lookup. No purchase, payment or contact entitlement is granted by the review endpoint.

Profile updates and decisions require the displayed `expectedRevisionId`. Revision, status and owner are concurrency tokens; a conflicting update returns 409. Decisions atomically update the business, its current verification record and append-only review history. Old reviews are not overwritten. Reload and review a conflict before making a fresh decision. After an uncertain network outcome, read current state before another explicit submission; never automatically replay a write.

## Operator setup and daily procedure

There is no public admin-registration or role-promotion endpoint, default admin password, or email-based promotion rule. Production operator provisioning is deliberately out of band:

1. An authorized operator creates a dedicated ordinary account through the configured Google flow and confirms its phone. Use a separate account with no customer requests or owned business; do not repurpose an active customer's account.
2. The deployment administrator verifies the exact existing user UUID and linked Google subject against the authorized person's identity. Record the approver, target UUID, reason and change ticket in protected operational records. An email suffix alone is insufficient.
3. Through the approved production database administration process, change only that active, verified, Google-linked account's primary role to Admin, update its modification timestamp and revoke its existing sessions in one transaction. Check that exactly the intended user was changed. No account has been promoted by this coding task.
4. Require a fresh sign-in, verify `/auth/me` returns Admin, and check `/admin/businesses` access. Use strong Google-account security/MFA and appropriate workstation controls. Application-enforced admin MFA and a shorter admin session lifetime remain hardening work; this workflow does not claim they exist.
5. For revocation, remove the Admin role through the same audited process and revoke all sessions. Validate that existing browser access is rejected and no customer/business identity was reassigned.

For each application, inspect current profile and contact state, perform the external checks, record evidence without unnecessary personal documents, choose the permitted decision, review the owner-facing message, and explicitly confirm. Never approve your own business. Return to current data after a revision conflict. The owner reads the result in their profile; automatic notification delivery is not implemented.

## Migration and deployment

`20261029172609_AddBusinessOnboardingAndReviewHistory` adds private profile fields, a nonempty revision per legacy business, current-review metadata and review history. Legacy statuses remain unchanged; an incomplete legacy profile cannot receive a new approval until completed. The migration does not create an administrator or fabricate past review evidence.

Test on a staging copy, verify backup/restore and stop incompatible writers before changing schemas. `Down` refuses to remove review history or submitted application data, including an unreviewed Pending profile. Use a reviewed forward repair after real applications exist. Do not delete evidence merely to force a downgrade. A blank legacy-only database can exercise the rollback path in PostgreSQL tests.

Read limits are 60 requests/minute/account/instance. Owner writes allow 10 per 5 minutes and admin decisions 30/minute. These instance-local limits do not replace coordinated production protection. All API responses remain no-store; admin/owner pages use generic noindex metadata. Neither noindex nor frontend gating substitutes for API authorization.
