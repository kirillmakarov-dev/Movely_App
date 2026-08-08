# Movely Open Questions

This file now contains only decisions that can safely wait until UI implementation or post-MVP.

## 1. MUST DECIDE BEFORE UI IMPLEMENTATION

### D-029 — Wizard step behavior and draft persistence

- Question: How should the customer wizard save progress, validate steps, and recover drafts across devices?
- Why this matters: This affects UX, abandonment recovery, and draft clarity.
- Recommended default: Persist drafts automatically after each step and clearly show step completion state.
- Alternative options: Save only on step submit; session-only drafts; manual save; resumable email link.
- Risks/tradeoffs: Auto-save is user-friendly but requires careful draft state management.
- Affected areas: request wizard, draft state, customer onboarding, review page.

### D-030 — Request review page contents

- Question: What exactly should appear on the review screen before publish?
- Why this matters: This is the final customer confirmation point and should reduce mistakes.
- Recommended default: Show a complete summary of all material fields, privacy-sensitive warnings, and edit links by section.
- Alternative options: Show only key fields; show a compact summary; show a preview identical to the marketplace card.
- Risks/tradeoffs: Too little information causes mistakes; too much can overwhelm mobile users.
- Affected areas: request review page, wizard, publish CTA, validation states.

### D-031 — Account confirmation UX

- Question: How should customers confirm or create an account before publishing, and which methods are shown first?
- Why this matters: This is a core conversion step and affects trust.
- Recommended default: Keep Google and phone/SMS as clear options, with the least-friction option visually prioritized.
- Alternative options: Google-first; phone-first; email plus phone; skip account creation until after publish.
- Risks/tradeoffs: Different methods have different friction and verification strength.
- Affected areas: account confirmation page, publish flow, authentication screens.

### D-032 — Customer dashboard states and actions

- Question: What exact states and actions should the customer dashboard show for draft, published, active, closed, expired, and cancelled requests?
- Why this matters: The dashboard is the customer’s main control center after publishing.
- Recommended default: Use strong status badges plus context-specific action buttons with disabled states explained.
- Alternative options: Show only current request; split active and archived requests; hide some states from the customer.
- Risks/tradeoffs: Too many states can confuse users; too few can hide important operational details.
- Affected areas: customer dashboard, My Move page, request details page.

### D-033 — Marketplace filter UI and defaults

- Question: How should marketplace filters and default sorting be presented on desktop and mobile?
- Why this matters: This directly affects mover findability and usability.
- Recommended default: Keep newest-first default, with compact mobile filter sheets and visible active filter chips.
- Alternative options: Advanced filters by default; saved filter focus; location-first sorting; photo-first sorting.
- Risks/tradeoffs: Too many controls on mobile can overwhelm users; too few reduce discovery power.
- Affected areas: marketplace page, filter sheet, sort controls, saved searches.

### D-034 — “Closest to mover” display and service-area filtering

- Question: How should distance from a mover’s service area be displayed and interacted with in the UI?
- Why this matters: It affects relevance, filtering, and perceived matching quality.
- Recommended default: Present it as a simple relevance/filter concept rather than exposing overly technical geographic detail.
- Alternative options: Exact distance; service-area badge only; map visualization; city-only approximation.
- Risks/tradeoffs: Too much precision can be noisy or privacy-sensitive; too little can feel arbitrary.
- Affected areas: marketplace cards, filters, search results, mover profile.

### D-035 — Request details page information hierarchy

- Question: What should be emphasized on the request details page before purchase versus after purchase?
- Why this matters: It is the main decision page for movers.
- Recommended default: Show route, date, access, inventory, photos, and budget clearly, with locked contact data visually separate.
- Alternative options: Show less pre-purchase detail; show a compact quick-view panel; show more structured tabs.
- Risks/tradeoffs: Too much unlocked detail can harm privacy; too little reduces mover confidence.
- Affected areas: request details page, lead purchase CTA, locked/unlocked data blocks.

### D-036 — Lead purchase confirmation UI and sold-out states

- Question: How should the UI communicate successful purchase, failed purchase, and sold-out state?
- Why this matters: This is the payment and access handoff point.
- Recommended default: Use a dedicated confirmation state, clear buyer count feedback, and a visible sold-out label if capacity is exhausted.
- Alternative options: Inline toast only; modal confirmation; redirect to contact screen; hide sold-out state from the card.
- Risks/tradeoffs: Weak feedback causes uncertainty and support requests.
- Affected areas: buy lead page, request details page, wallet page, marketplace cards.

### D-037 — Premium offer composer UI

- Question: How should the premium offer form guide movers to include more than price?
- Why this matters: Offer quality depends on structured inputs and clarity.
- Recommended default: Use a guided form with required sections for workers, timing, included/excluded services, and message.
- Alternative options: Freeform text; template-driven offer; collapsible advanced sections.
- Risks/tradeoffs: Freeform is faster but harder to compare; structured forms are better for customers.
- Affected areas: premium offer composer, mover dashboard, customer offer inbox.

### D-038 — Notification behavior for offers and interest

- Question: Which events should notify customers and movers, and how visible should those notifications be in the UI?
- Why this matters: Notification timing shapes engagement and perceived responsiveness.
- Recommended default: Notify on offer received, interest marked, lead purchased, and refund-related admin actions.
- Alternative options: Email only; in-app only; SMS/WhatsApp later; batched digest notifications.
- Risks/tradeoffs: Too many notifications become spam; too few reduce responsiveness.
- Affected areas: offer inbox, request dashboard, future notification center, admin review.

### D-039 — Locked data presentation and CTA wording

- Question: How should the UI present hidden customer data and the purchase CTA without implying leaked information?
- Why this matters: It affects trust and security perception.
- Recommended default: Use explicit locked-state labels and avoid showing placeholder data that resembles real contact details.
- Alternative options: Blur cards; reveal partial masked values; omit locked sections entirely.
- Risks/tradeoffs: Masked placeholders can create accidental leakage or false impressions.
- Affected areas: request details page, marketplace cards, contact section, CSS/state handling.

### D-040 — Mobile navigation and action placement

- Question: Where should primary actions, filters, and wizard controls live on mobile?
- Why this matters: Mobile is a first-class target and needs predictable navigation.
- Recommended default: Use sticky primary actions and bottom-sheet filters with large touch targets.
- Alternative options: Top-only controls; tab bar navigation; floating action button; condensed icon navigation.
- Risks/tradeoffs: Poor mobile action placement increases abandonment and errors.
- Affected areas: landing page, wizard, marketplace, request details page, dashboard.

## 2. CAN DEFER AFTER MVP

### D-041 — Internal messaging implementation details

- Question: When and how should internal messaging be introduced?
- Why this matters: Messaging increases engagement but also moderation and support burden.
- Recommended default: Defer full messaging until the core lead flow is stable.
- Alternative options: Basic chat; threaded messages; template replies; no messaging ever.
- Risks/tradeoffs: Adding chat early can distract from validating the core marketplace.
- Affected areas: future contact flows, notifications, moderation, request details page.

### D-042 — Wallet top-up mechanics and payment provider choice

- Question: Which payment methods, providers, and recharge behaviors should be supported later?
- Why this matters: This affects finance operations but not the initial core marketplace architecture.
- Recommended default: Defer provider selection and auto-recharge details until wallet MVP scope is approved.
- Alternative options: Card only; bank transfer; manual admin top-ups; automatic recharge.
- Risks/tradeoffs: Deferring keeps scope smaller, but finance integration work may later require a dedicated project.
- Affected areas: wallet page, payment flows, admin finance tools, transaction history.

### D-043 — Reviews, ratings, and reputation mechanics

- Question: What is the full review and rating model?
- Why this matters: Trust features matter, but they can be added after core supply/demand behavior is proven.
- Recommended default: Defer the full review system until after marketplace fundamentals are validated.
- Alternative options: Post-completion reviews only; lead-based feedback; mover-only ratings; mutual reviews.
- Risks/tradeoffs: Early reviews can introduce moderation and retaliation problems.
- Affected areas: mover profile, customer dashboard, admin moderation, ranking systems.

### D-044 — Multilingual rollout and RTL support

- Question: Which languages and text directions are required at MVP versus later?
- Why this matters: Internationalization touches nearly every page but is not needed to define the core business flow.
- Recommended default: Defer multilingual expansion until after the first market release is stable.
- Alternative options: Hebrew only; Hebrew and English; full RTL first; locale-based rollout.
- Risks/tradeoffs: Deferring simplifies the first build, but retrofitting RTL later still requires careful UI work.
- Affected areas: all pages, content model, layout system, localization pipeline.

### D-045 — Recommendation and matching engine

- Question: Should Movely eventually recommend movers or requests automatically?
- Why this matters: Matching can become a major product differentiator but is not necessary for the initial system.
- Recommended default: Defer to post-MVP once enough data exists to make matching meaningful.
- Alternative options: Rule-based matching; manual saved filters only; fully automated ranking.
- Risks/tradeoffs: Early matching is weak without data and can create misleading quality signals.
- Affected areas: marketplace ranking, saved searches, notifications, analytics.

### D-046 — PWA support

- Question: Should the web app be enhanced into a PWA later?
- Why this matters: PWA affects installability and offline behavior, but not the initial marketplace logic.
- Recommended default: Defer until after the responsive web experience is validated.
- Alternative options: MVP PWA; partial offline support; no PWA.
- Risks/tradeoffs: PWA adds complexity without helping define the business model.
- Affected areas: app shell, caching, install prompts, notifications.

### D-047 — Commission model and booking through Movely

- Question: Should the platform eventually support booking and commission-based transaction flows?
- Why this matters: This is a major business-model expansion beyond lead sales.
- Recommended default: Defer and keep the current scope centered on leads and offers.
- Alternative options: Hybrid lead plus booking; commission only; booking deposit only.
- Risks/tradeoffs: Booking requires more legal, payment, and support complexity.
- Affected areas: payments roadmap, booking flow, admin finance, future contract states.

### D-048 — Dynamic lead pricing strategy

- Question: How should lead prices change over time, by category, demand, or request quality?
- Why this matters: It can materially alter revenue mechanics but is not required for the first architecture pass.
- Recommended default: Defer dynamic pricing and begin with configurable per-request pricing.
- Alternative options: Category rules; demand-based pricing; mover-tier pricing; AI-assisted pricing.
- Risks/tradeoffs: Dynamic pricing adds experimentation complexity and can create perceived unfairness.
- Affected areas: pricing config, marketplace, admin tools, analytics, wallet.

### D-049 — Admin dashboard depth

- Question: How much admin tooling should be available in the first release?
- Why this matters: Admin features can grow into a large product on their own.
- Recommended default: Defer most admin depth and keep only the minimum review/configuration views needed later.
- Alternative options: Full moderation console; support-only console; pricing-only console; analytics dashboard.
- Risks/tradeoffs: Overbuilding admin slows the customer/mover core path.
- Affected areas: admin pages, moderation, pricing, verification, refunds.

### D-050 — Business profile richness

- Question: How detailed should mover profiles become at launch?
- Why this matters: Profile richness can be valuable, but it is not needed to define the core transaction flow.
- Recommended default: Defer rich portfolio and analytics features until the marketplace fundamentals are stable.
- Alternative options: Minimal profile only; full portfolio gallery; reviews plus badges; service-area map.
- Risks/tradeoffs: Rich profiles can help trust but increase content and moderation scope.
- Affected areas: mover profile page, marketplace cards, verification UI, future reputation model.

### D-051 — Saved searches and alert sophistication

- Question: How advanced should saved filters and future alerts be?
- Why this matters: This is useful for power users but not required to validate the marketplace.
- Recommended default: Defer advanced notifications and keep basic saved filters as a later enhancement.
- Alternative options: Basic saved search only; saved search plus alerts; premium-only enhanced alerts.
- Risks/tradeoffs: Alerting features can create notification overload if introduced too early.
- Affected areas: marketplace, saved searches, future notifications, mover dashboard.

