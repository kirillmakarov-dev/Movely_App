# Support and privacy requests

Implemented workflow: account-bound requests, plain-text replies, status history and manual administration. It records and communicates requests; it does not automatically export, correct or delete personal data. A resolved ticket is not evidence that a deletion or export happened.

## Enablement and operator responsibilities

`Support:RequestsEnabled` defaults to `false` (`Support__RequestsEnabled` in environment configuration). Enable intake only after an operator is assigned, access is checked and the response process is tested. This switch is not legal approval or proof of production readiness. No email/SMS notifications, attachments or promised response deadline are implemented.

When disabled, existing owner/admin reads, owner cancellation and admin marking a request InReview remain available. Fresh requests and fresh owner/admin replies are rejected. Receipts for an already-saved identical operation can still be recovered. Do not delete records or disable history as a way of closing intake.

Operators use `/admin/support`; customers and movers use `/account/support`. Every operator reply is visible to the request owner. There is no internal-note field. Never request passwords, OTP codes or identity documents in a reply. For a privacy request, explain what was actually checked or performed and any remaining steps; changing a ticket status does not perform those steps.

An external staffed channel for people without an account or with a locked-out/suspended account is still required before public launch. Existing session authentication deliberately rejects unavailable accounts. Retention schedules, fulfillment of access/correction/deletion requests, provider/gateway processes and removal from historical copies/backups remain separate release work.

## Access and data

Owner operations require an active authenticated Customer or Mover and exact ownership. Admin operations require Admin. Support does not require phone verification, current policy acceptance or the publication legal gate. An already linked active Google account can sign in without accepting new policies; this creates no consent record. New registration and explicitly supplied acceptance retain all existing legal/age checks.

The request stores topic, subject, original message, owner, submission key, revision and timestamps. Append-only events retain the actor identity privately, operation identity, previous/resulting status and revision, text and time. Owner history exposes only Owner/Support actor labels, not staff IDs or other account details. Admin details include the associated owner's ID and name for investigation. Messages are not marketplace content and grant movers no access to another person's request.

Subjects are 2–160 characters and messages 2–4000 characters after normalization. Unsupported controls are rejected; ordinary multiline text remains supported. HTTP bodies are bounded to 32 KiB before JSON deserialization, including bodies without Content-Length. Plain text is rendered as text, not HTML. History is paged newest first; lists have topic/status filters and bounded pagination.

## Routes and write contract

All routes are under `/api/v1`; responses use no-store and mutations use the existing cookie/CSRF protection.

| Route | Purpose |
|---|---|
| `GET /support/capabilities` | Public intake availability only |
| `GET/POST /support/requests` | Owner list / new request |
| `GET /support/requests/by-client-mutation/{id}` | Recover an owner's submission by its stable UUID |
| `GET /support/requests/{id}` | Owner detail and paged history |
| `POST /support/requests/{id}/replies` | Owner reply |
| `POST /support/requests/{id}/cancel` | Owner cancellation of a nonterminal request |
| `GET /admin/support/requests` | Admin list |
| `GET /admin/support/requests/{id}` | Admin detail/history and associated owner |
| `POST /admin/support/requests/{id}/replies` | Owner-visible admin reply and chosen status |
| `POST /admin/support/requests/{id}/status` | Mark InReview without inventing a reply |

Topics are General, PrivacyAccess, PrivacyCorrection and PrivacyDeletion. States are Open, InReview, WaitingForUser, Resolved and Cancelled. Owner replies reopen WaitingForUser/Resolved as Open; replies to Open/InReview keep their state. Cancelled requests cannot receive replies. Only Open/InReview/WaitingForUser can be cancelled. Resolving requires an actual operator reply.

Create carries `clientMutationId`, `expectedActorUserId`, `type`, `subject` and `message`. Other commands carry `clientMutationId`, `expectedActorUserId` and `expectedRevisionId`, plus body/status where applicable. The expected actor must match the authenticated account before processing: a cross-tab account switch must not upload one person's message under another account. Mismatches return `SUPPORT_ACCOUNT_CHANGED` without a write.

The same actor/key and identical normalized command returns the saved receipt; reusing a key for a different command is a conflict. An event append and parent revision update are transactional and use optimistic concurrency. A stale revision never silently overwrites another response. Idempotency keys are scoped by actor: a similar-looking row or matching UUID from someone else is not proof that the current command succeeded.

A lost response is uncertain. Keep the exact command/key, inspect server state and explicitly retry the same command if needed; do not create a new key or replay automatically. A lookup returning 404 does not prove an earlier in-flight write cannot still commit. The frontend preserves same-account unsent text in page memory, hides private content during foreground/BFcache access checks and clears it after identity/access loss. Browser storage is not used. Read deadlines are 10 seconds; write deadlines include CSRF and are 20 seconds.

Per-account, per-instance limits are 60 reads/minute, 5 creations/5 minutes, 10 owner commands/5 minutes and 30 admin commands/minute. Idempotent retries also consume endpoint limits. Multi-instance deployment needs coordinated infrastructure protection.

## Legal bundle and deployment

The current draft bundle is `draft-2026-10-29-v2`; the exact previous privacy/terms bundle is preserved under `/legal/versions`. The update documents support data, staff access, history and limitations. Existing acceptance records are not rewritten. Publication/marketplace still require current policies and current-version contact-sharing consent. The draft legal release gate remains in force for registration, policy acceptance and publication.

Apply `20261029185555_AddSupportRequestsAndImmutableHistory` with the matching application and model snapshot, and verify it on staging. A production rollback should normally disable intake and retain the tables/history. Migration Down is guarded against dropping populated support tables; do not bypass that protection. Verify backups and the operator's actual workflow before opening intake to real users.
