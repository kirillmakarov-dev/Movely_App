# Movely design system

Updated: 2026-10-29. Implemented source: `src/app/globals.css`.

## Product direction

A clear Hebrew-first moving-services website for adults with varying digital confidence. Calm navy and sky colors, warm everyday imagery, plain language, visible next actions. The current site is a preview; do not imply a live marketplace, actual customer activity, verified movers, payment processing, or bookings until those features exist.

## Tokens

| Role | Value |
| --- | --- |
| Text / secondary text | #0f172a / #475569 |
| Primary / primary hover | #075985 / #0c4a6e |
| Canvas / surface | #f6f8fa / #ffffff |
| Hero | #eef5f6 |
| Warm card | #faf5ed |
| Reassurance panel | #eaf1ee |
| Border | #dce3e9 |

Typography: Noto Sans Hebrew, variable, Hebrew + Latin, self-hosted through Next font. Body text 16px minimum; hero copy 18px. Avoid all-caps Hebrew and letter-spacing that reduces readability. Line-height 1.7–1.85 for explanatory text. Headings fluid, never clipped.

## Layout and interactions

- Mobile first. Verify 320, 390, 768, 1024 and desktop widths; no hidden horizontal overflow as a workaround.
- Containers max 1180px, gutters 16px mobile / 24px wider screens.
- Hero: one column on mobile, text first; two columns from 1024px. Image reserves space with aspect-ratio.
- Cards: one column mobile, two from 768px. Plain labels, icon plus text, no emoji or fake statistics.
- Primary controls at least 48px high; prominent calls to action 56px. Keep visible keyboard focus and native zoom.
- Inline expandable mobile navigation with labelled toggle, aria-expanded, Escape closing and focus return. Skip link leads to main content.
- Native details/summary for FAQs; no motion needed for comprehension. Respect reduced motion.
- Use logical CSS properties for RTL. Arrow icons point left for forward navigation in Hebrew.
- Hebrew is the supported interface in this iteration. The incomplete EN/HE switch is hidden until translations can change the whole application consistently; this is not a claim of completed localization.

## Media

`public/images/moving-day.png`: AI-generated conceptual scene, not a photograph of an actual Movely team. Display its illustration disclosure. Use Next Image with fill, sizes, reserved aspect-ratio and preload for the hero. See `docs/VISUAL_ASSETS.md` at repository root for provenance.

## Outstanding release work

This is a visual foundation, not accessibility certification. Form simplification, persistent drafts, legal pages, account consent, real device checks, keyboard/screen-reader audit, and production flows remain tracked in the release plan. Do not mark them complete based on a homepage screenshot.


## Request flow refinement (2026-10-29)

Six form stages with a separate publication result. Related access fields belong with each address; comments belong with date/budget. Additional services use a native optional disclosure with selected count. Mobile inventory uses two columns, room choices four compact columns. Keep one publication action in the footer. Label navigation by current stage rather than claiming percentage completion. Existing anonymous drafts migrate to the matching stage without losing content; new draft storage excludes publication confirmation.
