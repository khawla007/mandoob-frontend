# CMS Title Spacing Design

## Goal

Give every CMS page without a configured hero clear separation from the public header and body content.

## Design

- Apply the change globally through the shared `PublicCmsPage` no-hero title section.
- Set title-section top padding to `96px`.
- Set title-section bottom padding to `20px`.
- Use the same values on desktop and mobile, as requested.
- Leave hero-enabled CMS pages unchanged.
- Leave rich-text body spacing, public navigation, and footer spacing unchanged.

## Verification

- Add a regression test for the shared no-hero title-section class and spacing rules.
- Confirm Privacy, Terms, PDPL, and Trust use the same shared result.
- Inspect all four pages at 1440 × 900 and 390 × 844.
- Confirm each title starts 96px below the header and each title section ends 20px below the title line box.
- Confirm there is no horizontal overflow on mobile.
- Run focused tests, lint, and the production build.
