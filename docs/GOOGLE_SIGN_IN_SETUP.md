# Google sign-in configuration and release checks

The API validates Google ID tokens using Google.Apis.Auth, and the account page and request wizard share an official Google Identity Services (GIS) button. An operator-owned OAuth client, authorized origins and an end-to-end staging check are still required; the implementation alone does not prove a live Google login. SMS delivery is a separate, unfinished integration.

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

Both `/auth` and the final request-wizard stage use `AccountSignIn`. The capability check has loading, unavailable, error and retry states. Unavailable authentication does not display consent checkboxes or load GIS. It explains that the customer can continue preparing a draft and links to help. The browser rejects malformed capability responses and limits the capability lookup to ten seconds.

New registration displays two initially unselected choices: confirmation of age 18+ and acceptance of the terms after reading the privacy notice. GIS loads only after both choices. Returning login loads the button without collecting acceptance again; if the server requires current acceptance, the UI returns to the explicit consent step. The Google token is not retained for later automatic submission after a policy choice.

The GIS loader shares one script and initializer, disables automatic account selection, uses popup mode and routes responses to the corresponding mounted button. The button adapts to its container width. Loading failures offer a retry; callbacks from removed buttons are ignored. No One Tap prompt is enabled. The credential goes through the existing JSON sign-in endpoint with the Movely antiforgery token; the direct Google redirect/form-post flow is not implemented. Neither account UI contains a synthetic credential input, fixed demonstration account or development OTP display.

In production, an unset or blank `NEXT_PUBLIC_API_BASE_URL` makes API requests relative to the web origin. Deploy a reverse proxy for `/api/v1`, or explicitly set `NEXT_PUBLIC_API_BASE_URL` at web build time to the intended API origin. This repository change does not provision that proxy. Only development falls back to `http://localhost:5000`; production no longer probes the visitor's localhost.

Keep frontend and API on the same origin through a proxy, or deliberately configure a supported same-site deployment with explicit `Cors:AllowedOrigins`. The API allows credentialed requests only from that origin allowlist; never use a wildcard. Cross-site third-party-cookie behavior is not a supported deployment assumption. Live deployment cookie and proxy checks remain required.

The web API client clears its cached antiforgery token after sign-in, logout (including a lost response), or an expired-session response. The next mutation retrieves a token bound to the current identity.

## Phone verification readiness

`PhoneVerification` is shared by the account page and request wizard. Until a real SMS provider is implemented and advertised by the API, it displays an unavailable notice instead of phone/code inputs or a false delivery confirmation.

The component is prepared for a real send/verify flow: the phone starts empty unless supplied by the signed-in account; the code field appears after a successful send; changing the phone clears the previous challenge and code. It supports whole-code input and `one-time-code` autofill. Development `debugCode` is neither displayed nor copied into the input. Expired codes cannot be submitted from the UI, and delivery failures preserve the entered phone with a retry path.

The request-code response now includes `resendAvailableAt`, alongside `expiresAt`. The browser shows the resend countdown from that timestamp; a missing timestamp falls back to sixty seconds for compatibility. The existing server cooldown and verification limits remain authoritative. Completing this interface does not enable or verify SMS delivery.

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

Automated tests cover provider selection, failure handling, consent/CSRF/session behavior with a substituted Google validation boundary, subject-based account isolation, frontend consent/login transitions, stale callbacks, retries and phone-code states. Final verification of this frontend stage is recorded separately in the implementation log. These tests do not attest that an operator-owned OAuth project or live Google login is configured.

Official references: [Google server-side token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference) and [Google .NET validation settings](https://docs.cloud.google.com/dotnet/docs/reference/Google.Apis/latest/Google.Apis.Auth.GoogleJsonWebSignature.ValidationSettings).
