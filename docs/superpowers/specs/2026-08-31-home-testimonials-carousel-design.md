# Home Testimonials Carousel Design

## Goal

Turn the decorative testimonial row into a real, responsive carousel while preserving the approved homepage layout, colors, typography, card treatment, and section spacing.

## Content

- Render 10 localized testimonial cards.
- Keep the existing customer portrait assets and reuse them across the additional cards.
- Store all names, roles, and quotes in the existing English and Arabic message catalogs.

## Interaction

- Show three cards on desktop, two on tablet, and one on mobile.
- Previous and next buttons move by one card and loop continuously at both ends.
- Support touch swipe/trackpad scrolling and left/right keyboard navigation when the carousel is focused.
- Do not autoplay; motion happens only after user input.
- Respect reduced-motion preferences.

## Architecture

- Keep `TestimonialsSection` as a server component for translations.
- Add a small client `TestimonialsCarousel` component that owns carousel state and interaction.
- Pass only serializable testimonial content from the server component.
- Use a CSS transform track with cloned boundary slides for seamless looping, then reset without animation after each boundary transition.

## Accessibility

- Use real button elements with localized previous/next labels.
- Give the carousel a region label and make it keyboard focusable.
- Mark cloned slides hidden from assistive technology and prevent their contents from becoming focus targets.
- Announce the current visible position without interrupting the user.

## Verification

- Add contract tests first for 10 cards, client carousel wiring, accessible controls, and responsive counts.
- Run the focused tests, type checking, linting, and production build.
- Verify arrow, keyboard, swipe, looping, English/Arabic direction, and responsive layouts against the running site on port 3001.
