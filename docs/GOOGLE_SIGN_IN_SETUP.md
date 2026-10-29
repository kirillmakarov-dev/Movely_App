# Google sign-in configuration and release checks

The API supports Google ID token validation using Google.Apis.Auth. This implementation is not evidence of a live Google login: the web sign-in control, an operator-owned OAuth client, authorized origins and an end-to-end staging check are still required. SMS delivery is a separate integration.

## Configuration

Create a Web application OAuth client in the operator's Google project. Register the exact web origins used by staging and production, and localhost only for local development. Complete the consent-screen configuration and test-user/publishing requirements applicable to that project. Use the same client ID in the Google Identity Services button and the API.

Configure the API through its environment:

```text
Auth__Google__Mode=Google
Auth__Google__ClientId=<web-client-id>.apps.googleusercontent.com
```

The client ID is public configuration, not a client secret. This ID-token flow does not need a client secret in the browser or this API configuration. Never put credentials or tokens in URLs, Web Storage, analytics or logs.

`Development` mode accepts synthetic credentials only in Development/Testing. Google mode never falls back to synthetic authentication when its client ID is missing. Production never selects the development verifier or development SMS sender. Unconfigured services return structured 503 errors.

The existing draft legal-policy gate still blocks sign-in and registration in Production. Configuring Google does not bypass it. Do not switch production to Development or change the policy version merely to make login work.

## Browser integration contract

`GET /api/v1/auth/capabilities` is anonymous and returns `Cache-Control: no-store`:

- `policyAcceptanceAvailable`: current legal policy can be accepted in this environment;
- `googleSignInAvailable`: Google is configured and the legal gate allows it;
- `googleClientId`: public ID only when Google sign-in is available;
- `phoneVerificationAvailable`: currently false, since development OTP logging is not real SMS delivery.

Load the official Google Identity Services button only when appropriate for the user's chosen account action. Send its credential through the existing JSON sign-in endpoint with the Movely antiforgery token; the direct Google redirect/form-post flow is not implemented. New accounts need the required current policy acceptance; returning accounts with current acceptance do not need to resubmit it.

Keep frontend and API on the same origin through a proxy, or deliberately configure a supported same-site deployment with explicit `Cors:AllowedOrigins`. The API allows credentialed requests only from that origin allowlist; never use a wildcard. Cross-site third-party-cookie behavior is not a supported deployment assumption. Live deployment cookie checks and the browser integration remain a separate release task.

The web API client clears its cached antiforgery token after sign-in, logout (including a lost response), or an expired-session response. The next mutation retrieves a token bound to the current identity.

## Security behavior

The official SDK verifies Google's signature, issuer, expiry and the explicitly configured audience. Unverified email or unusable identity claims are rejected. Names are bounded to storage limits without splitting a UTF-16 surrogate pair. Validation waits up to ten seconds; provider/network failures return a retryable 503 without exposing token details.

Only `(Google, sub)` identifies the account. A new subject with an email matching an existing user creates a separate ordinary customer; it cannot inherit that user's role, phone verification or data. Account linking/recovery needs a separate proof of ownership and is not implemented by email matching. Suspended accounts cannot obtain new sessions; existing sessions also fail authentication.

## Required verification before public release

1. Confirm authorized origins, real Google popup/button, cancellation and a valid login on staging.
2. Confirm wrong-audience, expired and tampered tokens are rejected; confirm no user/session is created by failed authentication or missing registration acceptance.
3. Confirm login works in Safari/iOS and Chrome/Android, including session persistence and logout.
4. Confirm no synthetic credentials or debug OTP controls remain in the public interface.
5. Configure real SMS and complete its delivery/failure tests independently.
6. Finalize legal documents and provider disclosures before enabling public registration.

Automated tests cover provider selection, failure handling, consent/CSRF/session behavior with a substituted Google validation boundary, and subject-based account isolation. They do not attest that an operator-owned OAuth project or live Google login is configured.

Official references: [Google server-side token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) and [Google .NET validation settings](https://docs.cloud.google.com/dotnet/docs/reference/Google.Apis/latest/Google.Apis.Auth.GoogleJsonWebSignature.ValidationSettings).
