# Smooth Homepage FAQ Accordion

## Goal

Make the homepage FAQ open and close smoothly. Opening a new answer must close the previously open answer, while preserving the accepted section layout, content, colors, and typography.

## Root Cause

The current FAQ uses native `<details>` elements without a transition. Each toggle changes the element height immediately. In the two-column grid, that instant height change also moves every following row at once, producing the aggressive vertical jump.

## Approved Design

Create a focused client-side `FaqAccordion` component and keep `KnowledgeFaqSection` as the server component that loads translations. The server component passes the six localized question-and-answer pairs to the accordion.

Each item uses a semantic button with `aria-expanded` and `aria-controls`. The accordion stores one open item index; opening a different item closes the previous item. Clicking the open item closes it, leaving all items closed.

Animate each answer with a nested CSS grid from `0fr` to `1fr`, combined with a subtle opacity transition. Use an approximately 280 ms eased transition so surrounding grid rows move progressively rather than jumping. The answer's inner wrapper clips overflow during the transition.

The plus/minus indicator rotates or changes smoothly without changing the existing visual language. Existing focus styles, English and Arabic content, RTL behavior, and the two-column/one-column responsive layout remain intact.

## Accessibility and Motion

- Buttons remain keyboard operable and expose their state with `aria-expanded`.
- Each answer has a stable ID referenced by its trigger.
- Focus-visible treatment remains clearly visible.
- Under `prefers-reduced-motion: reduce`, transitions are removed while all accordion behavior remains available.

## Testing

- Add a contract test that fails until the controlled accordion, single-open state, ARIA wiring, and animation classes exist.
- Verify the focused homepage contract tests, TypeScript, lint, and production build.
- Verify on port 3001 that opening a second item closes the first and that desktop/mobile layouts have no horizontal overflow.

## Scope

This change affects only the homepage FAQ interaction. It does not alter FAQ copy, knowledge cards, section spacing, site colors, typography, or other accordions.
