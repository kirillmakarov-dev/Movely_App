# Movely Security Architecture

## 1. Security goals

Movely protects:

- customer identity
- exact pickup and destination addresses
- mover wallet balance
- contact access
- business verification state
- refund and moderation data

The primary risk is data leakage through an insecure API contract or a broken authorization boundary.

## 2. Threat model

Key threats:

- IDOR / object reference abuse
- protected contact leakage through API payloads
- exact address leakage through marketplace DTOs
- wallet double spend
- lead purchase race conditions
- OTP abuse and brute force
- duplicate/spam request creation
- XSS in comments, messages, or notes
- SQL injection
- malicious file uploads
- leaked secrets or logs
- admin account abuse

## 3. Authentication security

Recommended browser auth pattern:

- server-issued secure session cookie
- HttpOnly
- Secure
- SameSite=Lax or stricter where compatible

Avoid:

- storing bearer tokens in localStorage
- exposing long-lived tokens to browser scripts

If a token-based path is ever introduced for non-browser clients, keep browser cookie auth separate.

## 4. Authorization security

Authorization must be checked on the backend for every sensitive request.

Requirements:

- no frontend-only gating
- no hidden DOM fields for protected data
- no masked values that still contain the real data in the response payload
- no authorization by guessable IDs
- no trust in client-provided role claims without backend verification

## 5. DTO separation

This is critical.

### Marketplace request DTO

Must contain only marketplace-safe fields, for example:

- request id
- route at city/area level
- dates
- budget band
- rooms/items summary
- photos availability
- sold-out state
- status badges

It must never contain:

- customer name
- phone
- email
- exact pickup address
- exact destination address

### Purchased contact DTO

Must only be returned after successful `ContactAccess`.

It may contain:

- customer name
- phone
- exact locations
- contact actions

The two DTOs must be different contracts, not a single DTO with hidden fields.

## 6. Object-level authorization / IDOR prevention

Every resource endpoint must verify ownership or entitlement.

Examples:

- customer can only read their own request and claims
- mover can only read contact data for a request they purchased
- mover can only edit their own business and offer objects
- admin-only endpoints must verify admin role and log the action

Use server-side resource lookups followed by authorization checks, not client-provided trust.

## 7. Contact-data leakage prevention

Protected customer data must never be:

- emitted in marketplace DTOs
- cached in frontend state before entitlement
- embedded in HTML with CSS hiding
- logged in plain text
- included in analytics events

When a user is not entitled, the backend should simply omit the protected fields.

## 8. Exact address protection

Exact addresses are protected until the lead is purchased.

Rules:

- marketplace views receive only city/area level location
- request detail views before purchase must not include exact addresses
- after purchase, exact addresses may be returned only to entitled movers

## 9. Session, CSRF, and browser defenses

If cookie-based auth is used, add anti-CSRF protection for state-changing requests.

Recommended browser defenses:

- SameSite cookies
- CSRF token on mutating routes
- strict CORS configuration
- CSP
- HSTS
- X-Content-Type-Options
- X-Frame-Options or frame-ancestors CSP

## 10. XSS defenses

Potential XSS sources:

- request comments
- offer messages
- admin notes
- file names
- user profile text

Controls:

- encode all output
- avoid raw HTML rendering
- sanitize any rich text if it is ever allowed
- use a strict Content Security Policy

## 11. SQL injection defenses

Use:

- EF Core or parameterized SQL
- no string concatenation for SQL
- strict input validation
- server-side query construction only

## 12. Rate limiting and abuse protection

Apply server-side rate limiting to:

- OTP requests
- OTP verification attempts
- publish attempts
- login attempts where appropriate
- account creation
- request creation
- image uploads

Additional anti-abuse measures:

- duplicate request detection
- maximum active requests per customer
- admin suspension for abusive customers

## 13. OTP abuse defenses

OTP endpoints should enforce:

- per phone number rate limits
- per IP rate limits
- attempt counters
- OTP expiry
- single active challenge preference

Do not reveal whether a phone number already belongs to a user account through error messages.

## 14. Duplicate and spam abuse

Duplicate detection should produce a warning, not a silent hard block.

Abuse handling should include:

- duplicate-risk flag
- rate limiting
- configurable active-request limits
- admin suspension

## 15. File and image upload security

Image uploads must be treated as untrusted input.

Controls:

- allowed MIME types and magic-byte validation
- maximum file size
- dimension limits
- strip metadata if possible
- private object storage
- scan for malware if available
- generate safe derivatives if needed

Avoid storing untrusted files in a publicly readable bucket.

Recommended upload flow:

1. Backend validates request and permissions
2. Backend issues signed or authorized upload URL
3. Client uploads directly to object storage
4. Client notifies backend of completion
5. Backend records metadata only after validation

## 16. Secrets management

Secrets must never be committed to source control.

Store in:

- environment variables in development
- managed secrets store in staging/production

Examples:

- Google OAuth secret
- SMS provider credentials
- future payment provider credentials
- object storage credentials
- session signing keys

## 17. Logging and privacy

Logging must be careful not to leak personal data.

Do log:

- correlation ids
- request ids
- error codes
- admin action ids
- wallet transaction ids

Do not log:

- OTP values
- raw phone numbers unless redacted
- exact addresses in plain text unless required and redacted
- contact payloads
- payment secrets

## 18. Audit trail

Separate application logs from business audit logs.

Business audit trail should record:

- request published
- material version created
- lead price changed
- lead purchased
- wallet debit
- refund approved/rejected
- contact access granted
- request cancelled
- request closed
- business verification changed
- customer/mover suspended

Audit logs should be append-only and redacted where appropriate.

## 19. Admin security

Admin routes need extra hardening:

- separate admin route prefix
- strong role checks
- stronger session expiry
- audit logging on every action
- optional MFA if supported
- limited access to sensitive operational tools

## 20. API contract safety

Never derive marketplace DTOs by taking a full object and hiding fields in the UI.

Instead:

- query the right projection in the backend
- return a marketplace-safe contract
- return a separate contact contract only after entitlement

This is the main defense against accidental leakage.

