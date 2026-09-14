# P1.04 Company-Setup Discovery Design

**Date:** 2026-09-01
**Status:** Approved by the P1.04 strict-parity prompt and manager confirmation
**Dependency:** P1.03 final SHA `5162eb8b208dbbf7fab77dd9e0f2a25bcea36ee7`

## Goal

Create three canonical English desktop discovery routes, `/mainland`, `/free-zones`, and `/offshore`, that reproduce their mapped reference page bodies while retaining Mandoob's accepted public shell, typography, orange-led tokens, light/dark themes, content safety, and one-PRO/one-company policy.

## Visual direction

The scene is an entrepreneur comparing UAE setup paths on a large office monitor in daylight, looking for a calm, precise decision surface rather than promotional spectacle. The existing Mandoob brand remains operational, warm, and exact: strong black typography, warm paper surfaces, orange action cues, restrained borders, architectural UAE imagery, and compact information density.

The reference screenshots govern section order, proportions, grid/table type, and CTA placement. Their sample blue/green branding, unsupported proof, contact details, guarantees, prices, and timelines do not transfer.

## Architecture

- Keep the three route pages as Server Components with static metadata and page-specific compositions.
- Create shared primitives only for visibly repeated structures: breadcrumb/hero frame, benefit strip, information panels, process row, native FAQ disclosures, and final conversion band.
- Keep `MainlandDiscovery`, `FreeZonesDiscovery`, and `OffshoreDiscovery` as separate compositions. Do not introduce a configuration-driven mega-page.
- Isolate only the Free Zone search/filter/table as a Client Component. Pass it a small serializable catalog and derive filter results during render.
- Preserve `/company-setup/[authoritySlug]`, its static params, metadata, JSON-LD, and estimator handoff.
- Add canonical routes to sitemap and shared discovery navigation without changing accepted shell behavior.

## Data model and safety

`src/lib/public-company-setup/contracts.ts` defines display-only jurisdiction, emirate, activity, office, budget, panel, process, FAQ, and authority summary types. `catalog.ts` derives safe authority summaries and estimator URLs from the committed estimator and knowledge-base catalogs, then adds only reviewed explanatory copy.

All amounts are labelled indicative and formatted in AED. Timing is described as variable or illustrative. Suitability, approvals, permitted activities, office requirements, visas, fees, and timing remain authority- and case-dependent. The pages never imply authority endorsement, tax exemption, confidentiality, guaranteed banking, guaranteed recognition, or universal UAE-law rules.

The Offshore comparison uses only existing RAK ICC and Jebel Ali Offshore authority records. The third reference card is retained as an honest comparison-guidance state instead of inventing Ajman Offshore data.

## Page compositions

### Mainland

1. Breadcrumb and wide split scenic hero with two valid CTAs.
2. Four-item benefit strip.
3. Seven image-led emirate cards linking to prefilled estimator selections.
4. Four horizontal activity cards.
5. Licence-types and indicative-cost paired row.
6. Required-documents and variable-timeline paired row.
7. Two-column native FAQ grid.
8. Full-width Mainland conversion band.

### Free Zone

1. Breadcrumb and split scenic hero with a right-side checklist card and two valid CTAs.
2. Six-item fact/benefit strip.
3. Six image-led popular-zone cards using valid existing authority-detail routes.
4. Centered directory jump action.
5. Left filter/search panel plus right semantic desktop comparison table.
6. Horizontal comparison-benefits strip.
7. Indicative-cost panel plus five-step process.
8. Two-column native FAQ grid.
9. Full-width Free Zone conversion band.

The filter supports search, emirate, business type, office type, and budget; Apply commits draft selections, Clear resets both draft and applied state, deterministic ordering is preserved, and an accessible no-results state replaces the table body when needed.

### Offshore

1. Breadcrumb and split scenic hero with a right-side checklist card and two valid CTAs.
2. Five-item benefit strip.
3. Three large comparison slots using two existing offshore authorities plus one honest guidance state.
4. Centered estimator comparison action.
5. Qualified benefits strip.
6. Five-step process.
7. Three-column cost, requirements, and variable-timeline row.
8. Two-column native FAQ grid.
9. Full-width Offshore conversion band.

## Accessibility and interaction

- One `h1` per route and ordered section headings.
- Semantic lists and table markup with a caption and scoped headers.
- Native `details`/`summary` FAQ disclosures.
- Explicit labels for every filter, keyboard-operable controls, visible focus, and live no-results feedback.
- WCAG 2.1 AA contrast in both themes and no desktop page overflow at 1440×900 or 1280×800.
- No new Arabic/RTL or responsive redesign; existing narrower behavior must not be intentionally broken.

## Performance and Next.js boundaries

- Route pages and static sections remain Server Components.
- Only `FreeZoneDirectory.tsx` ships client JavaScript.
- Use direct imports, `next/link`, and `next/image` with intrinsic dimensions and accurate `sizes`.
- Reuse accepted local imagery where it truthfully fits; any new generated imagery must be text-free and stored locally.
- Keep catalog values serializable and avoid client-side privileged reads, APIs, migrations, or production writes.

## Verification

Use strict TDD slices for route/composition contracts, catalog/filter behavior, primitives, and each page. Then run focused affected tests, TypeScript, lint, formatting, diff checks, and a sanitized production build. Browser acceptance covers English light/dark at 1440×900, smoke at 1280×800, keyboard, filter/FAQ behavior, axe Critical/Serious, local assets, console/page errors, and horizontal overflow. Evidence includes six screenshots, hashes, parity matrices, a safety-substitution register, a data-source map, and the final verification report.

## Scope exclusions

No P1.05+, Arabic/RTL completion, responsive redesign, dashboard work, API, Supabase schema/RLS, production mutation, provider configuration, merge, or deployment.
