# Home Services Card Directional Reveal Design

## Goal

Match the three-card entrance beneath the home page heading “Choose the Right UAE Business Setup” to the SteelNova About section while preserving the approved heading animation and every other section animation.

## Reference behavior

The SteelNova About section uses WOW/Animate.css entrances with these shared settings:

- First card: `fadeInLeft`, beginning at `translateX(-20px)`.
- Middle card: `fadeInUp`, beginning at `translateY(20px)`.
- Last card: `fadeInRight`, beginning at `translateX(20px)`.
- All three fade from opacity `0` to `1` over `1s` with the CSS `ease` timing function.
- The aligned cards begin together; there is no intentional stagger.

## Implementation

Keep the existing `EntranceReveal` observer and card markup. Add a services-card-specific class to the grid and use the cards' existing positional modifier classes to define the three initial transforms. When the observer applies `is-in`, each card transitions to full opacity and no transform.

The services-card rules will override the generic card stagger only inside this grid, ensuring a simultaneous entrance without affecting other reveal groups. No animation library or new client-side state is required.

## Scope and safeguards

- Change only the three home services cards and their focused contract tests.
- Do not alter the heading character blur reveal, copy, card styling, layout, or other page animations.
- Preserve the current no-JavaScript fallback.
- Disable the movement and fade under `prefers-reduced-motion: reduce`.
- On narrow screens, retain the same semantic directions with the small 20px reference offset to avoid disruptive horizontal travel.

## Verification

- Contract-test the directional classes and exact duration, easing, transforms, and simultaneous delay.
- Run the focused homepage tests and the relevant project checks.
- Inspect the section in a browser at desktop and mobile widths, including reduced-motion behavior.
