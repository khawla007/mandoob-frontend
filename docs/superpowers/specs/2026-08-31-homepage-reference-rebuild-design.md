# Homepage reference rebuild design

Date: 2026-08-31

## Goal

Rebuild the public homepage body to follow the composition and visual rhythm of `updated design mandoop/homee.png`. Preserve Mandoob's identity instead of copying the reference brand.

## Fixed boundaries

- Keep the existing Mandoob hero visual and content unchanged; remove the legacy stats band that followed it.
- Keep `07 · Get started` unchanged as the final numbered section.
- Do not change the public shell, dashboard, API, Supabase, provider or deployment contracts.
- Continue using the website's current colors, typography, theme behavior and localization architecture.
- Do not reproduce unsupported metrics, guarantees or contact details shown in the reference.

## Chosen approach

Use a faithful structural recreation of the supplied reference, not a loose interpretation and not a pixel copy of its brand. The middle of the homepage will use the reference's compact, information-rich sequencing and visual proportions while retaining Mandoob content and controls.

## Page composition

Between the protected hero and final section, render:

1. A compact horizontal trust and capability strip.
2. A centered setup-choice introduction with Mainland, Free Zone and Offshore cards.
3. A four-step horizontal journey that becomes a vertical sequence on small screens.
4. A dark navy estimator banner with copy and CTA on one side and an illustrative cost summary on the other.
5. A six-item service row with distinct restrained color accents.
6. A compact `Why Mandoob` capability row without unsupported performance claims.
7. A three-card testimonial row matching the supplied reference, with localized supplied-reference identities and restrained quotes.
8. An image-led knowledge and insights row using suitable local project imagery and real routes.
9. A two-column native FAQ layout that collapses to one column on mobile.
10. The protected final `07 · Get started` section.

## Visual direction

- Follow the reference's disciplined white-space, thin rules, compact cards and navy information band.
- Use existing Mandoob orange and blue tokens, existing fonts, border radii and theme variables.
- Keep cards flatter and denser than the rejected implementation, with clear icon, heading and supporting-copy hierarchy.
- Use local imagery for the knowledge row where available. Images must have meaningful alternative text and stable aspect ratios.
- Preserve light and dark themes without introducing decorative gradients, glass effects or new font dependencies.

## Responsive and RTL behavior

- Desktop mirrors the reference's horizontal composition.
- Tablet reduces column counts without horizontal page overflow.
- Mobile stacks content in reading order and keeps controls at least 44 pixels high.
- Arabic uses logical properties, mirrored directional details and natural text alignment.
- Motion remains restrained and respects reduced-motion preferences.

## Content and interaction

- Reuse the existing approved English and Arabic homepage catalogs where they fit; adjust only what the new structure requires.
- Every CTA must resolve to an existing internal route or estimator query.
- The estimator uses the reference's static sample-breakdown card instead of interactive controls, and its values remain explicitly illustrative.
- FAQ uses keyboard-accessible native disclosure controls.

## Verification

- Add or update composition, localization, route, overflow and accessibility contracts.
- Run focused tests, TypeScript, lint, formatting, diff checking and production build.
- Visually compare the exact candidate on port 3001 with the reference at desktop, tablet and mobile widths in English and Arabic, light and dark themes.
- Confirm the protected hero and final section have not changed.
- Replace the previous P1.03 screenshots and verification evidence only after acceptance passes.
