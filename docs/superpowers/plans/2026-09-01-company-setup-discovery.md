# P1.04 Company-Setup Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build strict-reference-parity English desktop discovery pages for Mainland, Free Zone, and Offshore setup at three canonical public routes.

**Architecture:** Keep route pages and page-specific compositions server-rendered, backed by one typed display catalog derived from accepted estimator and authority data. Share only visibly repeated primitives, and isolate the interactive Free Zone directory in one small Client Component.

**Tech Stack:** Next.js 16 App Router, React 19 Server/Client Components, TypeScript, next/image, next/link, lucide-react, Node test runner, Playwright, axe-core.

---

### Task 1: Lock route and composition contracts

**Files:**

- Create: `src/components/site/company-setup/company-setup-composition.test.ts`
- Create: `src/app/(public)/mainland/page.tsx`
- Create: `src/app/(public)/free-zones/page.tsx`
- Create: `src/app/(public)/offshore/page.tsx`

- [ ] **Step 1: Write failing source contracts**

Assert that every canonical page exports metadata, renders exactly one page-specific composition, and that the three compositions expose the required section IDs in reference order. Include negative checks that Mainland has two paired rows, Free Zone contains a filter/table directory, Offshore contains a three-column operations row, and the authority detail route remains present.

```ts
assert.deepEqual(extractSectionIds(mainland), [
  'setup-hero',
  'setup-benefits',
  'mainland-emirates',
  'mainland-activities',
  'mainland-license-cost',
  'mainland-documents-timeline',
  'setup-faq',
  'setup-conversion',
]);
assert.match(freeZones, /FreeZoneDirectory/);
assert.match(offshore, /setup-operations--three/);
assert.ok(existsSync(authorityDetailPath));
```

- [ ] **Step 2: Run the contract and verify RED**

Run: `node --import tsx --conditions=react-server --test src/components/site/company-setup/company-setup-composition.test.ts`  
Expected: FAIL because the canonical routes and compositions do not exist.

- [ ] **Step 3: Add minimal route shells**

Each route exports static `Metadata` with title, description, canonical URL, and Open Graph fields, then renders its named composition. Do not add client directives.

```tsx
export const metadata: Metadata = {
  title: 'UAE Mainland Company Setup Guide | Mandoob',
  description: 'Compare Mainland setup considerations, documents, and indicative costs.',
  alternates: { canonical: '/mainland' },
};

export default function MainlandPage() {
  return <MainlandDiscovery />;
}
```

- [ ] **Step 4: Run the contract and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/app/'(public)'/{mainland,free-zones,offshore}/page.tsx src/components/site/company-setup/company-setup-composition.test.ts
git commit -m "feat(public): add company setup discovery routes"
```

### Task 2: Build the typed, claim-safe presentation catalog

**Files:**

- Create: `src/lib/public-company-setup/contracts.ts`
- Create: `src/lib/public-company-setup/catalog.ts`
- Create: `src/lib/public-company-setup/catalog.test.ts`
- Create: `src/lib/public-company-setup/filter.ts`
- Create: `src/lib/public-company-setup/filter.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Cover seven emirates, six popular Free Zone records with valid authority slugs, exactly two authoritative Offshore records plus one guidance slot, deterministic ordering, safe relative estimate/detail URLs, integer-fils AED formatting, indicative labels, and rejection of unsupported claims.

```ts
assert.equal(MAINLAND_EMIRATES.length, 7);
assert.equal(POPULAR_FREE_ZONES.length, 6);
assert.equal(OFFSHORE_OPTIONS.filter((item) => item.authoritySlug).length, 2);
assert.ok(POPULAR_FREE_ZONES.every((item) => item.href.startsWith('/company-setup/')));
assert.doesNotMatch(
  JSON.stringify(PUBLIC_SETUP_CATALOG),
  /0% tax|guaranteed|confidentiality|45\+/iu,
);
```

- [ ] **Step 2: Run catalog tests and verify RED**

- [ ] **Step 3: Define display-only types and catalog derivation**

Use literal unions for jurisdiction, emirate, business type, office type, and budget. Derive authority slugs and indicative cost bands from `authoritySetupPages` and `seededCostDataRows`; do not duplicate the full seed catalog or import privileged clients.

```ts
export type SetupDirectoryFilters = {
  query: string;
  emirate: EmirateFilter;
  businessType: BusinessTypeFilter;
  officeType: OfficeTypeFilter;
  budget: BudgetFilter;
};

export function formatIndicativeAed(minFils: number, maxFils: number): string {
  return `AED ${aed.format(minFils / 100)}–${aed.format(maxFils / 100)}`;
}
```

- [ ] **Step 4: Run catalog tests and verify GREEN**

- [ ] **Step 5: Write failing filter behavior tests**

Test combined search/emirate/business/office/budget filtering, case-insensitive search, clear-state behavior, no matches, and stable source ordering without mutation.

- [ ] **Step 6: Implement pure filtering and verify GREEN**

```ts
export function filterFreeZones(
  rows: readonly FreeZoneDirectoryItem[],
  filters: SetupDirectoryFilters,
): FreeZoneDirectoryItem[] {
  return rows.filter((row) => matchesAllFilters(row, filters));
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/public-company-setup
git commit -m "feat(public): add claim-safe setup discovery catalog"
```

### Task 3: Create shared strict-parity primitives

**Files:**

- Create: `src/components/site/company-setup/SetupHero.tsx`
- Create: `src/components/site/company-setup/SetupBenefitStrip.tsx`
- Create: `src/components/site/company-setup/SetupPanel.tsx`
- Create: `src/components/site/company-setup/SetupProcess.tsx`
- Create: `src/components/site/company-setup/SetupFaq.tsx`
- Create: `src/components/site/company-setup/SetupConversionBand.tsx`
- Create: `src/components/site/company-setup/company-setup-primitives.test.ts`

- [ ] **Step 1: Write failing semantic contracts**

Assert a breadcrumb `nav`, one hero heading ID, semantic benefit/process lists, native `details` FAQ disclosures, real Link CTAs, unique heading IDs, and no empty/hash destinations.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement server-rendered primitives**

Keep props serializable and narrowly typed. `SetupHero` accepts an optional checklist slot; `SetupPanel` accepts semantic children rather than a broad configuration object; `SetupFaq` renders two-column-friendly `details` elements.

```tsx
export function SetupFaq({ title, items }: SetupFaqProps) {
  return (
    <section id="setup-faq" className="setup-faq" aria-labelledby="setup-faq-h">
      <h2 id="setup-faq-h">{title}</h2>
      <div className="setup-faq__grid">
        {items.map((item) => (
          <details key={item.question} className="setup-faq__item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/components/site/company-setup
git commit -m "feat(public): add setup discovery primitives"
```

### Task 4: Add scoped visual foundation and local imagery

**Files:**

- Create: `public/company-setup/mainland-hero.webp`
- Create: `public/company-setup/free-zone-hero.webp`
- Create: `public/company-setup/offshore-hero.webp`
- Create: `public/company-setup/emirates-grid.webp`
- Create: `public/company-setup/free-zones-grid.webp`
- Create: `src/components/site/company-setup/company-setup-visual.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Write failing visual source contracts**

Require scoped `.setup-*` rules for 1440 and 1280 desktop geometry, light/dark semantic tokens, 7/4/2/3-column structures, focus-visible styles, table overflow containment, image aspect ratios, and reduced motion. Reject copied sample-brand colors, pure black/white, gradient text, and unscoped selectors.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Generate or prepare local text-free UAE architectural imagery**

Create original imagery rather than cropping the supplied full-page screenshots. Store only optimized local WebP masters and document that they are illustrative, not authority endorsements.

- [ ] **Step 4: Add scoped Mandoob styles**

Use the existing public token ramp, warm paper/dark surfaces, orange interaction color, restrained borders, sharp desktop density, and exact reference proportions. Preserve existing narrower rules without performing Phase 5 redesign.

- [ ] **Step 5: Run and verify GREEN**

- [ ] **Step 6: Commit**

```bash
git add public/company-setup src/app/'(public)'/public-theme.css src/components/site/company-setup/company-setup-visual.test.ts
git commit -m "feat(public): add setup discovery visual system"
```

### Task 5: Implement Mainland strict parity

**Files:**

- Create: `src/components/site/company-setup/MainlandDiscovery.tsx`
- Create: `src/components/site/company-setup/mainland-discovery.test.ts`

- [ ] **Step 1: Write failing eight-section contract**

Assert exact order, seven emirate cards, four activity cards, two paired panel rows, two-column FAQ, final conversion position, next/image usage with `sizes`, valid estimator/apply links, and safe variable copy.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement the page-specific composition**

Render all eight reference sections. Emirate cards use honest estimator selection links because emirate detail routes do not exist. Cost and timeline panels use indicative ranges/factors from the accepted data model and explicit variability notes.

- [ ] **Step 4: Run and verify GREEN**

- [ ] **Step 5: Run TypeScript and a 1440×900 light-mode browser comparison**

- [ ] **Step 6: Commit**

```bash
git add src/components/site/company-setup/MainlandDiscovery.tsx src/components/site/company-setup/mainland-discovery.test.ts
git commit -m "feat(public): build mainland discovery page"
```

### Task 6: Implement Free Zone directory and strict parity

**Files:**

- Create: `src/components/site/company-setup/FreeZoneDirectory.tsx`
- Create: `src/components/site/company-setup/FreeZonesDiscovery.tsx`
- Create: `src/components/site/company-setup/free-zone-directory.test.tsx`
- Create: `src/components/site/company-setup/free-zones-discovery.test.ts`

- [ ] **Step 1: Write failing directory interaction tests**

Use the real Client Component with a DOM test environment. Verify labels, draft selections, Apply, Clear, combined results, keyboard-operable controls, deterministic row order, semantic headers/caption, valid action links, and live no-results output.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement the minimal client island**

```tsx
'use client';

export function FreeZoneDirectory({ items }: { items: readonly FreeZoneDirectoryItem[] }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const rows = filterFreeZones(items, applied);
  // Render labelled form, Apply/Clear buttons, table, and aria-live result count.
}
```

- [ ] **Step 4: Run and verify GREEN**

- [ ] **Step 5: Write failing nine-section composition contract**

Assert hero checklist, six benefit items, six popular cards, centered directory jump, sidebar/table directory, comparison strip, cost/process pair, FAQ, and conversion band in order.

- [ ] **Step 6: Implement composition and verify GREEN**

- [ ] **Step 7: Run TypeScript and a 1440×900 light-mode browser comparison**

- [ ] **Step 8: Commit**

```bash
git add src/components/site/company-setup/FreeZoneDirectory.tsx src/components/site/company-setup/FreeZonesDiscovery.tsx src/components/site/company-setup/free-zone-directory.test.tsx src/components/site/company-setup/free-zones-discovery.test.ts
git commit -m "feat(public): build free zone discovery directory"
```

### Task 7: Implement Offshore strict parity

**Files:**

- Create: `src/components/site/company-setup/OffshoreDiscovery.tsx`
- Create: `src/components/site/company-setup/offshore-discovery.test.ts`

- [ ] **Step 1: Write failing nine-section safety/composition contract**

Assert exact order, five benefits, three comparison slots, five process steps, three-column operations row, two-column FAQ, final CTA, two valid authority-detail links, one guidance state, and rejection of Ajman Offshore/tax/confidentiality/audit/bank/recognition guarantees.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement the page-specific composition**

Use qualified wording such as “may support,” “subject to authority and case,” and “confirm with advisers.” Retain the reference geometry without representing the guidance slot as a nonexistent authority.

- [ ] **Step 4: Run and verify GREEN**

- [ ] **Step 5: Run TypeScript and a 1440×900 light-mode browser comparison**

- [ ] **Step 6: Commit**

```bash
git add src/components/site/company-setup/OffshoreDiscovery.tsx src/components/site/company-setup/offshore-discovery.test.ts
git commit -m "feat(public): build offshore discovery page"
```

### Task 8: Wire navigation, sitemap, and authority-detail preservation

**Files:**

- Modify: `src/components/site/public-navigation.ts`
- Modify: `src/components/site/public-navigation.test.ts`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/sitemap.test.ts`
- Create: `src/app/(public)/company-setup/[authoritySlug]/authority-route-preservation.test.ts`

- [ ] **Step 1: Write failing integration contracts**

Require canonical discovery links in shared navigation/discovery, all three sitemap entries, valid authority detail params/metadata/JSON-LD/estimator handoff, and no collision with the new routes.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Add canonical navigation and sitemap entries**

Keep current-path matching exact and preserve all accepted shell routes. Do not redirect or rewrite `/company-setup/[authoritySlug]`.

- [ ] **Step 4: Run and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/components/site/public-navigation.ts src/components/site/public-navigation.test.ts src/app/sitemap.ts src/app/sitemap.test.ts src/app/'(public)'/company-setup/'[authoritySlug]'/authority-route-preservation.test.ts
git commit -m "feat(public): expose setup discovery routes"
```

### Task 9: Correct parity, accessibility, and dark mode in-browser

**Files:**

- Modify: `src/app/(public)/public-theme.css`
- Modify: affected `src/components/site/company-setup/*.tsx`
- Modify: affected focused tests first for every discovered defect

- [ ] **Step 1: Run the production candidate at port 3001 with sanitized environment values**

- [ ] **Step 2: Compare each 1440×900 light page section-by-section with its exact reference**

Correct only after adding a failing contract for each source-addressable defect. Verify section count/order, grid/table type, image/CTA position, proportions, whitespace, and density.

- [ ] **Step 3: Verify dark geometry and 1280×800 smoke**

- [ ] **Step 4: Verify keyboard, FAQ, filtering, focus, overflow, local images, console/page errors, and axe**

- [ ] **Step 5: Commit parity corrections**

```bash
git add src/app/'(public)'/public-theme.css src/components/site/company-setup src/lib/public-company-setup
git commit -m "fix(public): align setup pages with approved references"
```

### Task 10: Final gates, evidence, and handoff

**Files:**

- Create: `Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-04-company-setup/verification.md` outside the frontend git repository
- Create: `Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-04-company-setup/parity-matrix.md` outside the frontend git repository
- Create: `Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-04-company-setup/content-safety-register.md` outside the frontend git repository
- Create: `Reports/launch-gate-evidence/2026-09-01/public-frontend-phase-1/p1-04-company-setup/data-source-map.md` outside the frontend git repository
- Modify: `docs/roadmap.md` outside the frontend git repository
- Modify: `Reports/daily-work-report.md` outside the frontend git repository

- [ ] **Step 1: Resolve and inspect the exact focused test list**

```bash
mapfile -t setup_tests < <(rg --files src | rg '(company-setup|mainland|free-zones|offshore|public-company-setup|public-navigation|sitemap).*\.test\.(ts|tsx)$' | sort)
printf '%s\n' "${setup_tests[@]}"
```

- [ ] **Step 2: Run all final automated gates**

```bash
node --import tsx --conditions=react-server --test --test-concurrency=8 "${setup_tests[@]}"
npx tsc --noEmit
npm run lint
npm run format:check
git diff --check
npm run build
```

- [ ] **Step 3: Capture six sanitized full-page screenshots**

Capture Mainland, Free Zone, and Offshore in English light and dark at 1440×900. Record SHA-256 hashes and retain 1280×800 smoke results without adding redundant screenshots.

- [ ] **Step 4: Write evidence records**

Document exact dependency/base/final SHAs, changed files, all three section matrices, every content substitution, authoritative versus illustrative data, test totals, browser results, and known Phase 4/5 gaps.

- [ ] **Step 5: Update roadmap and daily report**

Mark P1.04 complete only if every completion criterion passes. Put remaining P1.05+ work under Upcoming Work.

- [ ] **Step 6: Confirm clean final worktree and stop for review**

Do not begin P1.05, merge, push, or deploy.
