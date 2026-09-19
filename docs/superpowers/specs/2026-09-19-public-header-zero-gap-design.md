# Public Header Zero-Gap Collapse Design

## Goal

Remove the visible strip above the sticky public navigation after scrolling. The navigation must sit flush against the viewport at `top: 0` once the contact bar collapses.

## Root cause

The contact bar remains in normal layout while its grid row animates closed for 420ms. Its bottom border remains after the row reaches zero, leaving a persistent one-pixel box above the navigation. Browser measurements on staging confirmed a collapsed contact-bar height and navigation offset of one pixel.

## Approved behavior

- Keep the contact bar unchanged while the header is expanded.
- When `data-collapsed='true'`, remove the contact bar from layout immediately and remove its border.
- Place the navigation at the viewport's top edge with no animated or persistent strip above it.
- Preserve the existing collapse thresholds, focus protection, sticky behavior, navigation dimensions, colors, links, controls and light/dark theme surfaces.
- Apply the shared behavior to every route that uses `PublicHeaderFrame`, including public, login and registration pages.

## Implementation scope

Change only the collapsed contact-bar CSS in `src/app/(public)/public-theme.css` and the corresponding public-header styling contract test. Do not modify header markup, scroll logic, navigation styling or unrelated animations.

## Verification

- Add a regression assertion that the collapsed contact bar is removed from layout and has no border.
- Run the focused public-header tests, formatting and lint checks.
- Run the full test suite.
- Verify in a browser that the navigation's computed `top` is exactly `0` after scrolling in light and dark modes, and smoke-check home, login and registration routes.

