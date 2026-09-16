# Super Admin Signal Studio Restoration

**Status:** Approved
**Date:** 2026-09-16
**Approved direction:** A — Admin Signal Command
**Product baseline:** Local `main` at `14b2f9194d9eeb476239e8953db8fbf129e69027`

## Outcome

Restyle the authenticated Super Admin overview at `/admin` as a role-appropriate member of Mandoob's **Signal Studio** dashboard family while preserving every current Super Admin data, authorization, navigation, localization, and failure-state contract.

The finished page should share the PRO dashboard's visual DNA—near-black rail, warm canvas, dark-to-orange command surface, compact operational typography, tinted instruments, and asymmetric panels—without copying PRO-specific Company semantics or reducing the Super Admin dashboard's cross-platform operational density.

## Sources of truth

Use these sources in descending order:

1. Current `/admin` authorization, reporting-period parsing, dashboard data contracts, routes, translations, and independent widget states on `main`.
2. This approved design specification and the selected visual companion direction at `.superpowers/brainstorm/1190727-1789541380/content/super-admin-signal-directions.html`.
3. The merged PRO Signal Studio implementation, especially `CompanySignalHero`, `CompanySummaryDeck`, the operational grid, scoped `signal-*` CSS, loading/error geometry, and authenticated acceptance evidence.
4. The Super Admin P2.03 metric, state, and reference-parity evidence under `Reports/launch-gate-evidence/2026-09-01/dashboard-phase-2/p2-03-super-admin-dashboard/`.
5. Dashboard design and code rules under `docs/ai/`.

This is a selective visual redesign, not a checkout, cherry-pick, or literal copy of the PRO dashboard.

## Preserve unchanged

- `requirePlatformOperator` at the page and sensitive data boundaries.
- `loadAdminCommandDashboard`, its cross-company scope, independent source settlement, sanitization, bounded reads, and existing real-data/unavailable/error semantics.
- The URL-driven 7/30/90-day reporting-period contract, Asia/Dubai boundaries, generated-at timestamp, and current navigation destinations.
- All ten current KPI definitions and their meanings.
- Registration Overview, Lead Funnel, Recent Activity, PRO Operational Health, Revenue Overview, and Registrations by Stage, including truthful unavailable states.
- Current Super Admin shell routes, counters, breadcrumbs, locale/theme/session controls, MFA/session behavior, English and Arabic translations, RTL, dark mode, keyboard access, reduced motion, and chart/table alternatives.
- The one-PRO–one-Company model and visible **Company** terminology.
- Real zeroes as zeroes and failed or unsupported sources as explicit error/unavailable states.

## Prohibited changes

- No database, migration, RLS, RPC, API, provider, dependency, fixture, production-data, authentication, authorization, role, assignment, or business-rule changes.
- No fabricated counts, trends, percentages, charts, money, activity, composite health score, or `LIVE` claim.
- No Client terminology, multi-company-per-PRO concepts, Team Signal, employee ranking, assignment control, owner filter, or marketplace behavior.
- No removal or reinterpretation of current KPIs/panels merely to fit the visual design.
- No redesign of Super Admin management routes or non-Admin dashboards.
- No global Signal Studio CSS leakage into public pages or other dashboard roles.

## Approved page composition

### 1. Compact operational heading

Retain one `h1`, concise supporting copy, the exact reporting-period range, generated-at timestamp, 7/30/90-day selector, and current Companies/Leads actions. Use Signal Studio's operational eyebrow and tighter hierarchy. Wide layouts keep actions beside the heading; narrow layouts stack them with 44-pixel targets.

### 2. Platform Signal command surface

Introduce a Super Admin-specific dark-to-orange hero as the visual anchor. It communicates portfolio oversight, not a Company case.

- Use the diagonal mesh/grid, restrained line work, high-contrast typography, and warm orange focus of the PRO hero.
- Present existing platform facts only. Suitable signals include separate unassigned Company/PRO, renewal, payment, assignment, lead, or source-state indicators.
- Do not sum unlike backlogs into a new “priority score” without an already approved definition.
- A micro-visual may reuse the real lead-funnel series or another existing dashboard series; it must disappear or render an explicit local unavailable/error state when its source fails.
- Limit actions to one primary and one secondary current route.
- Keep the generated-at contract truthful; never label the surface real-time unless the source is real-time.

### 3. Portfolio instrument deck

Preserve all ten KPI slots. Apply the asymmetric Signal Studio instrument-card grammar rather than a generic five-by-two white-card grid.

- Give four decision-critical signals stronger visual weight above the fold after confirming hierarchy against current product meaning.
- Retain the remaining six metrics in a compact secondary instrument deck; do not hide them behind tabs or interaction.
- Use semantic tinted surfaces, visible borders, compact labels, tabular values, and restrained real-data marks.
- Decorative marks render only from the metric's own real value. Zero, error, and unavailable states must not produce fake bars or trends.
- A card links only when its current destination consumes the represented context.

### 4. Asymmetric operational grid

Retain all six current panels and reorganize them into a clear main-and-rail composition close to the shared 1.35:0.82 Signal Studio proportion.

- Registration Overview and Lead Funnel form the primary analytical workspace where their current states permit.
- Recent Activity becomes a compact priority/activity rail with safe newest-first entries.
- PRO Operational Health, Revenue Overview, and Registrations by Stage remain present as supporting instruments.
- Existing unavailable panels remain deliberately designed instruments, not empty white boxes.
- Panels fail independently and keep their current exact actions, tables, textual alternatives, and safe labels.

### 5. Shared shell

Preserve the existing Admin navigation information architecture and shared shell behavior. Apply the same scoped Signal Studio treatment used by the verified PRO dashboard: near-black rail, orange active state, warm canvas, compact topbar, clear focus, and dark-mode parity. Do not copy PRO navigation labels or routes.

## Component strategy

- Create an Admin-specific platform hero derived from the visual structure of `CompanySignalHero`, not from its Company content or props.
- Reshape `DashboardKpiCard` and the KPI layout while preserving `KpiDefinition`, `WidgetState`, localization, and every current state branch.
- Preserve `DashboardPanel`'s public behavior and improve only its presentational variants/geometry where required.
- Keep `CommandDashboard` as a presentation layer over the unchanged `AdminCommandDashboard` contract.
- Recover or reuse only relevant scoped Signal Studio CSS. Prefer existing semantic tokens and CSS patterns over raw colors or image assets.
- Update `/admin/loading.tsx` and the existing error geometry only when needed to match the final layout.
- Avoid new client state, new data loaders, a general analytics framework, or unrelated refactoring.

## Responsive behavior

- **1920×1080 and 1440×900:** strong command hero, useful above-the-fold density, asymmetric operational grid, and clear portfolio hierarchy.
- **1024×768:** collapsed/narrow shell; hero and instruments remain readable; main content becomes one column when the two-column grid is no longer viable.
- **768×1024:** stacked hero, controls, instruments, and supporting panels without clipping.
- **640, 700, and 767 pixels:** verify the exact transition around the `md` boundary in both English and Arabic.
- **390×844:** one column, 44×44 targets, no page-level horizontal overflow, no clipped focus, and useful priority content before lower analytics.
- **Arabic RTL:** controls and layout mirror with logical CSS while chronological charts retain meaningful order.

## Error and unavailable behavior

- Preserve discriminated `data`, `empty`, `unavailable`, and sanitized `error` presentation.
- No failed source may display a numeric fallback, decorative mark, successful trend, or misleading normal-state color.
- Long localized error/unavailable copy must wrap without overflow.
- One failed source must not erase the hero, KPI deck, or unrelated panels.
- Loading skeletons approximate the final hero, instrument deck, and main/rail geometry.

## Verification

Automated gates:

- Focused Admin dashboard render, data-contract, period, link, authorization, localization, responsive-source, and Signal Studio tests.
- Full explicit source suite.
- TypeScript, ESLint, targeted Prettier, `git diff --check`, protected-scope scans, and production build.
- Source/diff proof that auth, data loaders, APIs, schema, providers, dependencies, routes, and business rules are unchanged.

Authenticated browser acceptance:

- Capture 1920×1080, 1440×900 light/dark, 1024×768, 768×1024, 390×844, and 640/700/767 English and Arabic RTL.
- Exercise period selector, Companies/Leads actions, KPI/panel drilldowns, tables/chart alternatives, and keyboard order.
- Measure page overflow and 44-pixel targets; test reduced motion.
- Run axe WCAG 2/2.1 A/AA on representative settled desktop, mobile, dark, and RTL views.
- Record console errors and network failures.
- Compare the resulting composition with the approved Option A companion and the verified PRO Signal Studio visual language.

## Acceptance criteria

- The Super Admin overview is immediately recognizable as **Signal Studio**, but its cross-platform Admin role remains distinct from the PRO Company workspace.
- The dark-to-orange Platform Signal hero, tinted portfolio instruments, warm canvas, black rail, and asymmetric operational grid are present.
- Every current KPI, panel, action, reporting-period behavior, and state remains available and semantically unchanged.
- No backend, authorization, data, route, or product-model regression exists.
- Light/dark, English/Arabic RTL, responsive, keyboard, reduced-motion, axe, console, test, type, lint, format, and build gates pass.

## Out of scope

- Adding missing Phase 3 data contracts to make unavailable panels appear populated.
- Changing Admin management pages, public pages, PRO/Customer/Employee dashboards, or shared business logic.
- Merging, pushing, deploying, or mutating production/remote systems without explicit approval.
