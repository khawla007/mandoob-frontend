# Public Header Smooth Zero-Gap Collapse Design

## Goal

Restore the smooth contact-bar collapse while keeping the sticky public navigation flush with the viewport after scrolling and preventing page content from appearing above it during motion.

## Root cause

The zero-gap fix uses `display: none` on the collapsed contact bar. Browser sampling confirmed that this moves the navigation from `top: 45px` to `top: 0` in one frame, bypassing the existing 420ms grid-row transition.

## Approved behavior

- Preserve the existing 420ms `cubic-bezier(0.16, 1, 0.3, 1)` collapse and expansion.
- Remove `display: none` from the collapsed state so the grid row can animate from `1fr` to `0fr`.
- Keep the contact-bar box visible and opaque while it collapses, then apply `visibility: hidden` only after the 420ms transition completes.
- Animate the bottom-border width from one pixel to zero over the same duration so the final navigation position is exactly `top: 0` without a one-pixel residue.
- On expansion, restore visibility immediately and reverse the same smooth geometry.
- Preserve header markup, scroll thresholds, focus protection, colors, navigation styling, controls, sticky behavior and shared public/auth route coverage.

## Implementation scope

Change only the contact-bar transition declarations and collapsed contact-bar rule in `src/app/(public)/public-theme.css`, plus the corresponding contract in `src/components/site/public-navigation.test.ts`.

## Verification

- Use a failing regression contract before editing production CSS.
- Run focused header tests, formatting, lint and the full test suite.
- In light and dark modes, sample navigation position during collapse and confirm intermediate values between 45 and 0 rather than a one-frame jump.
- Confirm the contact bar remains painted during motion, ends hidden with zero border and zero height, and leaves navigation at `top: 0`.
- Verify expansion, focus protection, desktop/mobile home, login and registration routes, plus header-control usability.

