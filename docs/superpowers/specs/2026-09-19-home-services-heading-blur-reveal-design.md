# Home Services Heading Blur Reveal

## Goal

Match the SteelNova homepage About Company heading entrance on Mandoob's second-section heading, “Choose the Right UAE Business Setup,” without changing any other section animation or layout.

## Reference behavior

The SteelNova heading uses a one-time, scroll-triggered character reveal:

- each visible character starts at `opacity: 0` and `blur(10px)`;
- each character animates to full opacity and `blur(0)` over 1 second;
- characters begin 25 milliseconds apart in reading order;
- the easing is equivalent to GSAP `power2.out`;
- the reveal starts when the heading reaches approximately 85% of the viewport;
- the animation plays once per page load.

## Implementation design

Use the existing `EntranceReveal` intersection-observer lifecycle rather than adding GSAP. Render the translated title as word containers containing per-character spans so characters animate independently while words continue to wrap as units. The heading keeps its full translated text as an accessible label, while decorative character spans are hidden from assistive technology.

Scope all new selectors to the services heading. The heading's existing generic vertical reveal must be suppressed so the reference blur-and-opacity transition is the only motion applied to it. The eyebrow, descriptive paragraph, cards, spacing, and layout retain their established behavior.

For `prefers-reduced-motion: reduce`, render every character immediately with no blur, transition, or delay. If JavaScript or `IntersectionObserver` is unavailable, the existing reveal fallback must leave the complete heading visible.

## Verification

- Add or update a focused source contract covering character-level markup, accessible labeling, reference timing values, and reduced-motion fallback.
- Run the focused homepage tests, TypeScript validation, and lint checks relevant to touched files.
- In the browser, confirm the heading reveals once on entry, preserves normal line wrapping, remains visible with reduced motion, and does not alter the eyebrow, paragraph, or cards.

## Out of scope

- Adding GSAP or another animation dependency.
- Changing any other homepage heading.
- Changing service-card, eyebrow, paragraph, spacing, or layout animations.
- Replaying the animation whenever the user scrolls away and back.
