# Public design-4 color and font parity

Date: 2026-09-01

## Goal

Align the public website's colors and typography with the canonical static reference in `../html-design/design-4` without changing the accepted homepage composition, content, responsive behavior, localization, or authenticated dashboards.

## Scope

- Apply only inside `.site-public` and the public header/footer shell.
- Keep admin, PRO, account, auth, and other authenticated dashboard styling unchanged.
- Keep the current public page markup and section order unchanged.
- Preserve English, Arabic, RTL, responsive layouts, motion behavior, and the public light/dark theme toggle.
- Update `../docs/design-system.md` so it accurately distinguishes dashboard tokens from the public design-4 system and documents the current homepage structure.

## Canonical reference

`../html-design/design-4/styles.css` is authoritative for public light-theme color and font values:

| Role | Reference value |
|---|---|
| Paper | `#FFFFFF` |
| Ink | `#000000` |
| Zinc 50 | `#FAFAFA` |
| Zinc 100 | `#F4F4F5` |
| Zinc 200 / border | `#E4E4E7` |
| Zinc 300 | `#D4D4D8` |
| Zinc 400 | `#A1A1AA` |
| Zinc 500 | `#71717A` |
| Zinc 600 | `#52525B` |
| Zinc 700 | `#3F3F46` |
| Zinc 900 | `#18181B` |
| Zinc 950 | `#09090B` |
| Accent | `#FF5722` |
| Accent hover | `#E64A19` |
| Accent soft | `#FFF1ED` |
| Dark border | `#27272A` |
| Sans font | Geist |
| Mono font | Geist Mono |

The fonts are already loaded through `next/font`; the implementation must continue using `--font-geist-sans` and `--font-geist-mono` rather than adding a network font or duplicate font loader.

## Public component treatment

- Primary accent buttons use `#FF5722` with `#FFFFFF` text in light and dark modes. Hover uses `#E64A19`.
- Standard eyebrow labels use Geist Mono, 13px, uppercase, `0.12em` tracking, and Zinc 500. Inverse eyebrows use Zinc 400. Existing `eyebrow--accent` markup is visually normalized to the reference eyebrow color rather than forcing orange labels.
- Inline action links use the accent color, Geist Sans, 14px where the existing component scale permits, and weight 600. Homepage text links must not retain the newer darker `--accent-ink` color or weight 700.
- Headings and body copy continue to use Geist Sans. Numeric and metadata treatments continue to use Geist Mono.
- Focus, disabled, scrim, and other semantic states may retain dedicated tokens where the static reference has no equivalent, but they must be derived from or visually compatible with the canonical palette.

## Dark mode adaptation

The static reference contains no dark-theme implementation. The current public dark-mode architecture remains: neutral role values invert within `.dark .site-public`, while the brand accent stays `#FF5722`. Primary button text remains white and hover remains `#E64A19`, matching the reference's component colors in both themes.

## Accessibility note

Exact reference parity is the approved requirement. The reference's `#FF5722` on white is below 4.5:1 for small text, so inline accent links may not meet WCAG AA contrast without another signal. Links must remain semantically identifiable and retain their existing hover/motion treatment; this known trade-off must be documented rather than silently replacing the approved color.

## Documentation update

Revise `../docs/design-system.md` to:

- remove the implication that the April dashboard scaffold color table governs public marketing pages;
- document the public design-4 palette, fonts, component color rules, and dark-mode adaptation;
- retain dashboard-specific token guidance separately;
- replace the stale homepage section inventory with the current component sequence;
- identify `html-design/design-4/styles.css` as the canonical public visual reference and `frontend/src/app/(public)/public-theme.css` as its runtime scoped implementation.

## Verification

- Add or update focused contracts for exact public palette, font, button, eyebrow, and link values.
- Run the focused public-theme and homepage tests.
- Run TypeScript, lint, formatting/diff checks, and a production build in proportion to the CSS/documentation change.
- Verify computed styles on `http://localhost:3001/` for header CTA, hero CTA, homepage inline link, section eyebrow, and final CTA in light and dark modes.
- Confirm authenticated dashboard token files and component styles are not changed.
