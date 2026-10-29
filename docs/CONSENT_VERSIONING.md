# Contact-sharing consent and published request updates

Implemented 2026-10-29. This describes server behavior, not approval of the draft legal documents or readiness of the marketplace.

## Update contract

`PUT /api/v1/move-requests/{requestId}` remains an owner-customer endpoint. Drafts may be incomplete and do not require contact-sharing acceptance. An optional `expectedCurrentVersionId` detects a stale draft when supplied.

An Active or Published request requires:

- `expectedCurrentVersionId` equal to the current content version;
- an explicit `contactSharing` object with `shareContacts: true`, the current disclosure version and the actual request recipient limit;
- an active customer with verified phone and current policy acceptance;
- an available legal release gate and complete content suitable for publication.

The same transaction inserts the new immutable content version and its consent, then changes the request's current-version pointer. Rejected validation does not change the earlier version. The old consent is never moved to a new version or copied as a substitute for a new choice. Published date, buyer count, recipient limit and SoldOut state are preserved.

Current-version ID, request status, sales status, recipient limit and buyer count participate in optimistic concurrency checks. A stale expected version, a competing state change or the relevant unique-index race produces `REQUEST_VERSION_CONFLICT` (409). Read the current request and let the user review changes before a new submission; do not silently retry with a new version or acceptance. After a lost response, inspect the server state before repeating the action.

The current customer web editor still edits Draft only. Its ordinary saves do not send a contact-sharing choice for active requests. A later active-request editor must collect that explicit choice. Existing legacy versions missing matching consent are not automatically repaired. The confirmation-only recovery described below lets the owner explicitly accept disclosure for an otherwise eligible current version without inventing a new content version.

## Owner visibility and confirmation-only recovery

Stage 18 adds GET `/api/v1/move-requests/{requestId}/publication-status`. It is an owner-customer endpoint, not a public eligibility oracle. It returns request/version IDs, lifecycle and sales status, the actual recipient limit, disclosure version/test flag, check timestamp, current contact-sharing status/acceptance timestamp, eligibility and renewal flags, and explicit blockers. It does not return other owners' identifiers, contacts, addresses, acceptance records or private request text.

Owner diagnostics and marketplace reads use the same SQL eligibility definition, including the Israel-local date, active owner/phone/current policies, valid current content and current-version contact acceptance. The legal gate is also applied. `eligibleForMarketplace` describes eligibility when checked; it does not prove that anyone has viewed the request, purchased access, received contact details or will offer a service. A SoldOut card may remain eligible. An unrecognized canonical locality remains an anonymous locality in the catalog rather than a new eligibility failure.

POST `/api/v1/move-requests/{requestId}/contact-sharing` accepts `expectedCurrentVersionId` and the explicit `contactSharing` object. It returns `{ publicationStatus, alreadyAccepted }`. Renewal is available only for an otherwise eligible Active request: it does not publish a Draft, reopen a terminal request, repair incomplete content or extend a past move date. Legacy Published is not Active and cannot be made eligible merely by granting consent.

The server validates the current owner, account, phone, policies, legal gate, reviewed version, disclosure and actual recipient limit. It appends a matching consent while preserving all earlier consent records, the current content version, publication timestamp, buyer count, price and lifecycle. Parent concurrency checks and the consent insert participate in one transaction. A valid repeated acceptance is idempotent: it returns `alreadyAccepted: true` without replacing the original record or acceptance timestamp. Competing writes return a controlled conflict; the browser must read current state before another deliberate attempt.

The existing consent unique key does not contain UserId. A malformed/out-of-band ownership history can therefore contain a different owner's record with the same version/disclosure/limit/environment key. It must never count as the current owner's acceptance or be overwritten. `CONTACT_SHARING_HISTORY_CONFLICT` disables renewal and requires separate correction or a new request; ordinary older versions/disclosures do not block renewal.

The owner screen requires a fresh unchecked choice against the reviewed request version, actual recipient limit and disclosure text known to the current frontend. Unknown disclosure versions require refreshed software/documents instead of acceptance under old text. Account and policy completion can open in a separate tab; returning revalidates the private owner data. A changed version requires reviewing the current request. Lost/uncertain responses never automatically replay a write. Closing/cancelling remains available without agreeing to further sharing.

Read and renewal limits are respectively 60/minute and 10/5 minutes per account per application instance. No-store responses, CSRF, authentication and ownership checks apply; rate limits and noindex are not substitutes for those controls.

## Migration and rollback

`20261029175812_ProtectMoveRequestOwnerConcurrency` records `CustomerUserId` as an EF concurrency token. It has no schema or data statements; deploy it with the matching application/model snapshot. Renewal forces an aggregate update even with a fixed clock, so owner/version/status/limit changes participate in the same concurrency decision as the acceptance insert. The update preserves the existing UpdatedAt value. Downgrading this application code would remove that owner-concurrency protection even though the metadata migration itself does not drop data.

`20261029163209_BindContactSharingToRequestVersions` replaces the single-consent-per-request unique index with `IX_ContactSharingAcceptances_VersionDisclosure` over request ID, version ID, disclosure version, recipient limit and test-only flag. It preserves every existing row. Concurrency tokens change EF update predicates; they do not add database columns.

Apply and test the migration on staging before deploying the new API. Take the normal verified database backup first. The old unique index cannot be restored once a request has multiple historical consent records. Before considering a database downgrade, inspect:

```sql
SELECT "MoveRequestId", COUNT(*)
FROM "ContactSharingAcceptances"
GROUP BY "MoveRequestId"
HAVING COUNT(*) > 1;
```

Do not delete consent history to make a downgrade succeed. A rollback plan must preserve the newer schema/history and prevent old application code from accepting published edits without fresh consent, or use a separately reviewed forward repair. Restoring an old backup would discard later user actions and is not a routine substitute for rollback planning.

## Marketplace integration requirement

Before exposing a current version, check the actual owner, current policy/disclosure version, current request version, recipient limit and environment/test-only rules against the stored acceptance. The marketplace must not treat this migration or an old request-level acceptance as permission to expose arbitrary newer content. It must also use a separate safe DTO; consent does not make addresses, contacts, free text or photo metadata safe for a pre-purchase response.

The marketplace read model and manual business-review workflow are implemented in stages 16–17. Real Google/SMS setup, final legal documents, actual operator provisioning/checks, purchases and production acceptance remain separate release requirements.
