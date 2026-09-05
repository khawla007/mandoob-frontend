# Public Header Contact Bar Design

## Goal

Add a slim informational bar above the public navigation. It shows a short Mandoob tagline on the inline-start side and contact links on the inline-end side. As the visitor scrolls down, the contact bar slides out smoothly while the primary navigation remains fixed at the top of the viewport.

## Content

- Tagline: reuse the localized public footer description.
  - English: `UAE business setup and PRO management, made clearer.`
  - Arabic: the existing Arabic equivalent from `site.footer.description`.
- Email: `hello@mandoob.ae` linked with `mailto:`.
- Placeholder phone: `+971 4 555 0123` linked with `tel:+97145550123`.
- Email and phone are deliberately placeholder contact content for this iteration and can be replaced centrally later.

## Visual Structure

The public header becomes one sticky stack:

1. A 32px contact bar with a restrained dark surface, muted light text, and a subtle divider.
2. The existing 64px primary navigation, unchanged in its action hierarchy.

The tagline sits at inline-start. Email and phone sit at inline-end with small semantic icons and a quiet separator. Logical CSS properties preserve the intended relationship in both LTR and RTL layouts.

At widths below 768px, the tagline is hidden to prevent crowding. The two contact links remain centered and compact. The existing mobile navigation behavior is unchanged.

## Scroll Behavior

A small client component owns only the header's scroll state. The complete header stack uses `position: sticky; top: 0` and remains in normal document flow.

- At the top of the page, both rows are visible.
- After scrolling beyond 40px, the component marks the stack as collapsed.
- When the visitor returns above 12px, it expands again.
- The different collapse and expansion thresholds provide hysteresis and prevent jitter near the boundary.
- Scroll work is scheduled through `requestAnimationFrame` and the listener is passive.
- The contact row animates its grid track, opacity, and upward translation over 420ms using a refined ease-out curve. The main navigation settles into the top position as the row collapses.
- With `prefers-reduced-motion: reduce`, the transition is removed while the state change remains functional.

The bar does not repeatedly reappear during ordinary downward or upward scrolling; it returns only when the page is near the top. This keeps the navigation stable and avoids distracting motion.

## Component Boundaries

- `SiteHeader` remains the server component responsible for translations, session-aware actions, and header markup.
- A focused client-side header frame receives the top-bar and navigation markup as children and only toggles the collapsed state.
- Existing `LanguageSwitcher`, `PublicThemeToggle`, `UserMenu`, and `MobileNav` behavior remains untouched.
- New text reuses existing translations where possible; localized accessible labels for phone and email are added to both message catalogs.

## Accessibility and Resilience

- Email and telephone remain native links with visible focus states.
- Icons are decorative; the full contact text remains visible.
- The sticky stack has a stable high stacking context and does not cover the skip link.
- Initial server-rendered markup is expanded, so content remains usable without JavaScript.
- The animation does not change focus or intercept pointer events.
- Arabic uses localized tagline and labels, logical alignment, and LTR isolation for the email address and telephone number.

## Testing

- Unit-test the scroll-state helper or client behavior at both hysteresis thresholds.
- Extend the public navigation contract tests for the top-bar content, native contact links, sticky stack, responsive rule, and reduced-motion rule.
- Verify English and Arabic message parity.
- Run the focused public-header tests, TypeScript, formatting, and diff checks.
- Review the live header at 1440px and 390px, including scroll collapse, expansion near the top, dark/light themes, and Arabic RTL.

## Out of Scope

- Connecting contact details to a CMS or environment configuration.
- Reworking the existing navigation destinations or mobile menu.
- Showing the contact bar inside authenticated dashboards.
