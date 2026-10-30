# Movely localization

The user interface supports Hebrew at the original URLs, English at `/en`, and Russian at `/ru`. Locale is explicit in the URL. Switching languages preserves the page, query and fragment; no language cookie, profile field or additional personal data is collected. Switching reloads the page, and edited inputs or wizard selections trigger a warning before leaving. Private support/business drafts are not silently persisted by the language selector.

## Source and dictionaries

Hebrew source components remain the single implementation of business behavior. `apps/web/src/translations/part-*.json` contains manually authored English and Russian messages keyed by their exact source text. `heReviewed` records editorial corrections; the corrected Hebrew is also present in the actual source. The source inventory contains 1,429 original messages, supplemented by four historical paragraphs and additional operational copy.

`scripts/generate-locales.mjs` parses TypeScript and JSX to generate locale-specific modules in ignored `src/localized/{en,ru}` and route exports in ignored `src/app/{en,ru}`. It translates literal UI copy, accessibility attributes, validation and error messages, template fragments and legal text. It never searches or replaces browser DOM text, translates runtime user content, changes API enums or creates mutable process-wide locale state. Reusing the same behavior avoids maintaining three versions of the forms and security checks. Files are written only when their generated contents change.

Generation runs from Next, Vite and Vitest configuration, including clean CI checkouts. Missing messages fail the build. Do not edit generated files. Add new exact source keys with both `en` and `ru` translations, then run `node scripts/generate-locales.mjs`. `extract-messages.mjs` is an editorial inventory helper, not an automatic translation service. Numeric inventory IDs are editorial references, not runtime keys.

Shared root metadata, language controls and the not-found screen have small explicit three-language dictionaries. `proxy.ts` overwrites internal locale/path headers from the requested URL. The root HTML is rendered with the correct `lang` and `dir` before hydration. English and Russian use LTR layout; Hebrew uses RTL. Google sign-in requests the selected language, and dates use language-appropriate formatting with existing Israel/UTC date semantics preserved.

Internal navigation must use `SafeLink` or `localeHref`; native GET form actions and redirects also need `localeHref`. External URLs, API paths, anchors, asset paths, enum values, identifiers and stored draft formats stay unchanged. Official Israeli locality names remain as supplied by the registry rather than being replaced with guessed translations.

## Copy and legal boundaries

Use everyday wording and consistent moving-service terminology. Avoid em/en dashes in authored interface copy. User-entered punctuation is preserved. Review complete rendered sentences when translating template fragments or text surrounding a count. Use count-neutral formulations where a single label must support all numbers.

Translations preserve the legal draft status, age 18 confirmation, separate contact-sharing consent, service availability limitations and absence of automatic data deletion. They do not constitute legal approval or open disabled services. The original historical Hebrew JSON and its canonical hash are unchanged. Generated English/Russian historical views are explicitly marked as reference translations that do not change previous consent. Original archival evidence is not rewritten to satisfy stylistic preferences.

Unknown backend messages are not displayed verbatim: specific known error codes receive localized guidance and unknown errors receive a localized fallback. Error codes remain diagnostic references. Names, addresses, request subjects, notes and staff/user messages remain in the language entered by their authors.

## Validation

The localization tests cover full dictionary coverage, absence of mixed-language literal fallback, SSR language-switch URLs, preserved queries/fragments, cancelling language changes with unsent text, proxy header spoofing, internal/external/API links, localized legal drafts, translated validation, preservation of user content, and safe backend error fallback. Existing account, CSRF, consent, support and request tests also run. Production smoke testing checks representative routes in all three languages, including HTML language/direction, internal links and current/archive documents.

Browser screenshots and device interaction require an enabled browser connection. Passing HTTP/render tests does not establish visual or real-device QA. The Sites publication updates the web Worker; the separate .NET API remains a separate deployment.
