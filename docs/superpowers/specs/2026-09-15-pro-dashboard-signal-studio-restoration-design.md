# PRO Dashboard Signal Studio Restoration

**Status:** Approved
**Date:** 2026-09-15
**Visual source of truth:** Git commit `4fbd79c` and the August 13 Design B parity evidence
**Product baseline:** Current `main` after Phase 1 and Phase 2

## Outcome

Restore the PRO dashboard's approved **Design B — Signal Studio** visual identity without reverting the current one-PRO–one-company product model or its newer security and data contracts.

The finished dashboard should again be immediately recognizable as Signal Studio: a compact operational masthead, strong dark-to-orange signal hero, asymmetric tinted decision cards, dense but readable operational instruments, and the near-black PRO navigation rail. Current Company-focused information replaces retired Client and Team concepts.

## Sources of truth

Use these sources in descending order:

1. Current authorization, Company ownership, routing, server-side data, localization, and navigation behavior on `main`.
2. Final reference screenshot `Reports/launch-gate-evidence/2026-08-13/pro-dashboard-design-b-parity/final-gate-desktop-light-1440x900.png`.
3. Responsive, dark-mode, RTL, and interaction screenshots in the same evidence directory.
4. Design B implementation at Git commit `4fbd79c`, especially its dashboard composition, component geometry, and `signal-*` CSS.
5. Original approved specification `docs/superpowers/specs/2026-08-11-pro-dashboard-signal-studio-design.md` where it does not conflict with the current one-company model.

This is a selective visual restoration, not a checkout or cherry-pick of the old dashboard.

## Preserve unchanged

- `requireProTenantRouteAccess` and the current authenticated route boundary.
- The authoritative PRO-to-Company assignment and tenant-plus-Company-scoped data reads.
- The `/t/{tenant}/dashboard` route and all current drill-down destinations.
- Current service-type and date-range filtering.
- Company profile, activation-readiness, pending-document, registration-unavailable, and partial-source-error semantics.
- Real data only; no preview values or fabricated metrics.
- Current navigation information architecture from Phase 1 and Phase 2.
- English and Arabic localization, RTL, light/dark themes, keyboard access, reduced motion, and semantic alternatives for charts.

## Do not restore

- Active Client totals, Client selectors, or multi-company summaries.
- Team Signal, employee rankings, assignment controls, team capacity, or owner filters.
- The legacy composite operations-health score where its inputs rely on retired team/client semantics.
- Old authorization helpers, old dashboard queries, or pre-Phase-1 route behavior.
- The old `LIVE` claim unless the current data source is actually real-time. Keep the truthful generated-at timestamp.

## Page composition

### Masthead and heading

Restore the compact uppercase Signal Studio masthead and the tighter desktop rhythm from Design B. It contains the operating-signal identity and the current generated-at timestamp. The heading remains Company-aware and keeps the current range selector and filter drawer.

### Signal hero

Restore the large dark-to-orange mesh hero as the visual anchor above the fold. Adapt its content to the current model:

- Company identity and operational context replace the retired generic tenant/client framing.
- Priority action count remains the primary signal.
- Registration/readiness state replaces the retired composite health score.
- A compact case-velocity trace uses the current Company-scoped series.
- Primary actions link to the current Company and action/application destinations.

The hero must retain the diagonal service pattern, restrained line work, high-contrast copy, compact controls, and stable height seen in the final parity screenshot.

### Decision cards

Retain the current six Company summary meanings—readiness, registration, documents, priority actions, renewals, and invoices—but render them with Design B's asymmetric instrument-card treatment. On desktop, the first four critical signals form the dominant above-the-fold row; the remaining signals may join the operational grid where this improves parity and hierarchy.

Orange is the primary brand signal. Blue, red, amber, and green remain semantic. Cards use low-saturation tinted surfaces, visible borders, compact typography, tabular values, and clear hover/focus states.

### Operational grid

Restore Design B's asymmetric main-and-rail composition:

- Case Velocity is the leading analytical instrument.
- Action Deck is visually prominent and appears before analytics on mobile.
- Deadline Intensity remains keyboard-operable and falls back to a list where needed.
- Pending Documents occupies the supporting rail using the current Company data.
- Collections Waterfall and Renewal Streams retain their current Company-scoped data and drill-down links.
- Typed unavailable panels remain local to missing sources and must not collapse the whole page.

### Shell

Preserve the current shared PRO shell behavior, routes, labels, counters, and permissions. Restore the exact Signal Studio visual treatment: near-black rail, compact icon geometry, orange active state, warm canvas, and tighter topbar spacing. Do not reintroduce removed navigation items.

## Responsive behavior

- **1920×1080 and 1440×900:** match the original Signal Studio density, hero prominence, four-card decision rhythm, and asymmetric operational grid.
- **1024×768:** collapse shell navigation as currently supported; retain readable two-column hierarchy where space permits.
- **768×1024:** stack hero content and instruments without clipped controls.
- **390×844:** single column; Action Deck precedes analytical charts; no page-level horizontal overflow; tap targets remain at least 44px.
- **Arabic RTL:** content direction reverses correctly while chart chronology and numerical meaning remain understandable.

## Component strategy

Recover visual composition and CSS from `4fbd79c`, then adapt it onto the current components instead of restoring deleted business components verbatim.

- Introduce a Company-aware Signal hero derived from the old `SignalHero` visual structure.
- Restyle or reshape `CompanySummaryDeck` using the old `SignalKpis` visual grammar.
- Preserve the current public props and data contracts for `CompanyCommand`, `PendingDocuments`, `ActionDeck`, `CaseVelocityChart`, `DeadlineHeatmap`, `CollectionsWaterfall`, and `RenewalStreams` unless a narrowly scoped presentational prop is necessary.
- Recover only relevant `signal-*` styles; remove or avoid selectors exclusively tied to retired Team/Client behavior.
- Keep loading, error, and empty states shape-matched to the restored layout.

## Verification

Automated checks:

- Focused dashboard component, link, state, authorization, Company ownership, localization, and responsive-source tests.
- Full unit test suite.
- TypeScript, ESLint, formatting, and production build.
- Source scans confirming no Team Signal, Client selector/count, owner filter, multi-company wording, fake metric, or authorization regression.

Authenticated browser acceptance:

- Compare 1440×900 English light mode directly with the August 13 final reference.
- Verify 1920×1080, 1024×768, 768×1024, and 390×844.
- Verify English light/dark and Arabic RTL.
- Exercise range/filter controls and all dashboard drill-downs.
- Check keyboard order, visible focus, chart alternatives, axe WCAG 2/2.1 A/AA, console errors, and horizontal overflow.

## Acceptance criteria

- A user comparing the new dashboard with the final August 13 reference immediately recognizes the same Design B — Signal Studio system.
- The dark mesh hero, compact masthead, tinted instruments, black rail, warm canvas, and asymmetric grid are restored.
- Current one-company information is preserved; no retired Client or Team model leaks into UI, queries, or navigation.
- Every displayed value is current Company-scoped real data or an explicit unavailable/empty state.
- Current authentication, tenant isolation, Company assignment, and drill-down behavior remain unchanged.
- Required responsive, theme, RTL, accessibility, test, lint, type, and build gates pass.

## Out of scope

- Reverting Phase 1 or Phase 2.
- Changing database schema, RLS, authentication policy, MFA behavior, or Company assignment rules.
- Reintroducing retired multi-company, Client, Team, employee-ranking, or owner-assignment concepts.
- Redesigning public pages or non-PRO dashboards.
