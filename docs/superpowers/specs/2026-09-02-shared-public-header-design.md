# Shared Public Header Design

## Goal

Use the homepage header consistently across all public marketing routes, authentication routes, and client account routes. Replace the active navigation item's inline-start border with a bottom border.

## Scope

- Keep `SiteHeader` as the canonical shared header.
- Confirm the public, auth, and account layouts all render `SiteHeader` rather than page-specific header variants.
- Change the desktop active-link indicator from `border-inline-start` to `border-bottom` while preserving the existing accent color, text color, keyboard focus state, and 44px target size.
- Preserve RTL behavior, responsive navigation, session-aware controls, and all dashboard headers.

## Implementation

Update the shared public navigation CSS and its contract tests. No page-specific header markup will be duplicated. Add a layout integration contract if the existing tests do not already protect shared-header usage across the three route groups.

## Verification

- Run the focused public navigation and header tests.
- Run TypeScript and lint checks appropriate to the touched files.
- Verify the header visually on the homepage, a secondary public page, login/register, and an authenticated account page when local authentication state permits.
