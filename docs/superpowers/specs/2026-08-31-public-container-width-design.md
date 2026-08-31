# Public container width design

## Goal

Increase the usable width of public-page sections so the homepage and blog layouts no longer feel compressed on wide desktop screens.

## Approved design

- Increase the shared public `--container` maximum from `1200px` to `1440px`.
- Keep the existing `32px` desktop gutter and `16px` mobile padding.
- Apply the change through the existing shared `.site-public .container` token so public sections remain aligned.
- Preserve the current hero composition, section order, typography, colors, card counts, and responsive breakpoints.
- Do not change authenticated dashboard containers.

## Verification

- Add a source contract that requires the `1440px` public container token.
- Confirm the contract fails before the CSS change and passes afterward.
- Run TypeScript, lint, and formatting checks.
- Inspect the homepage at desktop and mobile widths on port 3001 and confirm there is no horizontal overflow.
