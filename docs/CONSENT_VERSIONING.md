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

The current customer web editor still edits Draft only. Its ordinary saves do not send a contact-sharing choice for active requests. A later active-request editor must collect that explicit choice. Existing legacy versions missing matching consent are not automatically repaired: an authorized complete update with a new explicit choice creates a new version and consent. A dedicated confirmation-only recovery screen remains future work.

## Migration and rollback

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

Real Google/SMS setup, final legal documents, the marketplace read model, mover verification and purchases remain separate release requirements.
