# Public Header Solid Surface Design

## Goal

Make only the logo-and-navigation portion of the shared public header fully opaque on every public-facing route, including login, signup, and account pages.

## Visual behavior

- Preserve the current light-mode header color as solid white.
- Preserve the current dark-mode header color as the same solid near-black already used by the design.
- Remove only the 85% alpha channel from the shared header-surface tokens.
- Keep the dark contact bar, borders, blur declaration, navigation contents, dimensions, collapse behavior, sticky positioning, and transitions unchanged.

The opaque surface prevents page content from showing through the navigation bar while scrolling. It does not introduce a new color or modify the header layout.

## Architecture and scope

`SiteHeader` is already shared by the public, authentication, and account layouts. The implementation therefore changes the existing `--public-header-surface` values in `src/app/(public)/public-theme.css`, including the route-specific company-setup palette overrides, instead of changing individual layouts or components.

No React or Next.js component behavior changes are required.

## Verification

- Add a focused source contract proving every `--public-header-surface` declaration is fully opaque and preserves its existing RGB color.
- Confirm the shared `SiteHeader` remains mounted by the public and authentication layouts.
- Run the focused public-navigation tests, formatting, lint/static checks where applicable, and the complete source-test suite.
- Inspect public home, login, and signup pages in light and dark modes and confirm the navigation surface is opaque while scrolling.
