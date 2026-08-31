# Homepage Reference Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the homepage body to closely follow `homee.png` while preserving the current Mandoob hero, final section, brand tokens, localized safe content and application contracts.

**Architecture:** Keep `page.tsx` as an ordered server-component composition layer. Refocus each middle component on one visual band, add one dedicated service-capability component, and style the sequence with scoped public-theme classes. Use existing local images through `next/image`; keep content in the English and Arabic message catalogs.

**Tech Stack:** Next.js 16 App Router, React server components, TypeScript, next-intl, next/image, lucide-react, scoped CSS, Node test runner.

## Approved correction after visual review

The final approved reference sequence also requires:

- removing the legacy `stats-band` rendered after the protected hero visual;
- replacing `EstimatorPreview` with a compact static sample-estimate breakdown;
- inserting `TestimonialsSection` between `WhyMandoobSection` and `KnowledgeFaqSection`;
- removing numbered eyebrow labels from the copied middle sections while retaining the protected final `07 · Get started` label.

Regression contracts must assert these corrected boundaries and the three-column testimonial layout with a one-column mobile collapse.

---

### Task 1: Lock the reference-led composition

**Files:**

- Modify: `src/app/(public)/page.test.ts`
- Modify: `src/app/(public)/page.tsx`
- Create: `src/components/site/home/SupportServicesSection.tsx`

- [ ] **Step 1: Write the failing composition test**

Assert this exact body order after the protected hero:

```ts
const orderedSections = [
  '<HeroSection />',
  '<TrustBandSection />',
  '<ServicesSection />',
  '<FlowSection />',
  '<EstimatorSection />',
  '<SupportServicesSection />',
  '<WhyMandoobSection />',
  '<KnowledgeFaqSection />',
  '<FinalCtaSection />',
];
assert.doesNotMatch(pageSource, /AnnotatedShowcaseSection/u);
```

- [ ] **Step 2: Run the composition test and verify red**

Run: `node --import tsx --conditions=react-server --test "src/app/(public)/page.test.ts"`

Expected: failure because `SupportServicesSection` is absent and the old estimator/flow order remains.

- [ ] **Step 3: Implement the ordered composition**

Import and render `SupportServicesSection`; remove `AnnotatedShowcaseSection`; place the flow before the estimator. Create the service component with a localized six-item list:

```tsx
const SERVICES = [
  ['companySetup', Building2],
  ['proServices', BriefcaseBusiness],
  ['bank', Landmark],
  ['vat', ReceiptText],
  ['visa', IdCard],
  ['renewal', CalendarSync],
] as const;
```

Each list item uses a real heading and paragraph from `home.services`, an icon marked `aria-hidden="true"`, and no fake CTA.

- [ ] **Step 4: Run the composition test and verify green**

Run: `node --import tsx --conditions=react-server --test "src/app/(public)/page.test.ts"`

Expected: 1 file passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/page.tsx" "src/app/(public)/page.test.ts" src/components/site/home/SupportServicesSection.tsx
git commit -m "refactor(public): align homepage section sequence"
```

### Task 2: Rebuild setup, journey and estimator bands

**Files:**

- Modify: `src/components/site/home/TrustBandSection.tsx`
- Modify: `src/components/site/home/ServicesSection.tsx`
- Modify: `src/components/site/home/FlowSection.tsx`
- Modify: `src/components/site/home/EstimatorSection.tsx`
- Modify: `src/components/site/home/homepage-content-contract.test.ts`

- [ ] **Step 1: Add failing structural contracts**

Assert that the setup section no longer renders the comparison table or support grid, the journey renders an ordered four-step row, and the estimator renders a single reference-style banner:

```ts
assert.doesNotMatch(services, /compare__table|home-support-grid/u);
assert.match(flow, /home-flow-row/u);
assert.match(estimator, /home-estimator-band/u);
assert.match(estimator, /EstimatorPreview/u);
```

- [ ] **Step 2: Run the contract and verify red**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts`

Expected: failure on the new reference-layout class and removal assertions.

- [ ] **Step 3: Implement the compact reference structures**

Use `BadgeCheck`, `FileSearch`, `UserRoundCheck` and `CalendarClock` in the trust strip. Render setup choices as three equal cards with icon medallions, concise bullets and existing estimate queries. Render the journey as:

```tsx
<ol className="home-flow-row">
  {steps.map(({ key, Icon }, index) => (
    <li key={key}>
      <span className="home-flow-row__number">0{index + 1}</span>
      <Icon aria-hidden="true" />
      <div>
        <h3>{t(`${key}Title`)}</h3>
        <p>{t(`${key}Text`)}</p>
      </div>
    </li>
  ))}
</ol>
```

Render the estimator as one navy `home-estimator-band` with copy/CTA on the inline-start and the existing qualified `EstimatorPreview` on the inline-end.

- [ ] **Step 4: Run the content contract and verify green**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/home/TrustBandSection.tsx src/components/site/home/ServicesSection.tsx src/components/site/home/FlowSection.tsx src/components/site/home/EstimatorSection.tsx src/components/site/home/homepage-content-contract.test.ts
git commit -m "feat(public): rebuild homepage setup journey and estimate bands"
```

### Task 3: Build compact capabilities, knowledge imagery and FAQ

**Files:**

- Modify: `src/components/site/home/SupportServicesSection.tsx`
- Modify: `src/components/site/home/WhyMandoobSection.tsx`
- Modify: `src/components/site/home/KnowledgeFaqSection.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`
- Modify: `src/components/site/home/homepage-localization.test.ts`

- [ ] **Step 1: Add failing imagery and catalog contracts**

Require four local knowledge cards, exact catalog parity and existing routes:

```ts
assert.match(knowledge, /next\/image/u);
assert.equal(knowledge.match(/home-knowledge-card/g)?.length, 4);
for (const route of ['/knowledge-base', '/blog']) assert.match(knowledge, new RegExp(route));
```

Add `home.knowledge.card1Title` through `card4Alt` in both expected catalog path sets.

- [ ] **Step 2: Run focused tests and verify red**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts src/components/site/home/homepage-localization.test.ts`

Expected: failure because the four image cards and their localized keys do not exist.

- [ ] **Step 3: Implement the reference-style lower content**

Use four local images:

```ts
const ARTICLES = [
  { key: 'card1', image: '/hero/skyline.webp', href: '/knowledge-base' },
  { key: 'card2', image: '/hero/knowledge-base-research.webp', href: '/knowledge-base' },
  { key: 'card3', image: '/hero/pro-firm-operations.webp', href: '/blog' },
  { key: 'card4', image: '/pro-hero-2.png', href: '/blog' },
] as const;
```

Render `Image` with `fill`, `sizes`, localized alt text, category, title, summary and link. Rework `WhyMandoobSection` into a five-item horizontal capability row. Keep six native `details` elements in a two-column FAQ grid. Add natural Arabic translations for every new English key.

- [ ] **Step 4: Run focused tests and verify green**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts src/components/site/home/homepage-localization.test.ts`

Expected: all tests pass with exact English/Arabic key parity.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/home/SupportServicesSection.tsx src/components/site/home/WhyMandoobSection.tsx src/components/site/home/KnowledgeFaqSection.tsx src/messages/en.json src/messages/ar.json src/components/site/home/homepage-content-contract.test.ts src/components/site/home/homepage-localization.test.ts
git commit -m "feat(public): add reference-led services knowledge and FAQ"
```

### Task 4: Match the reference rhythm with scoped responsive styling

**Files:**

- Modify: `src/app/(public)/public-theme.css`
- Modify: `src/components/site/home/homepage-responsive-contract.test.ts`

- [ ] **Step 1: Add failing layout contracts**

Require the desktop grids and their mobile collapse:

```ts
assert.match(css, /\.home-setup-grid[\s\S]*grid-template-columns:\s*repeat\(3,/u);
assert.match(css, /\.home-services-grid[\s\S]*grid-template-columns:\s*repeat\(6,/u);
assert.match(css, /\.home-knowledge-grid[\s\S]*grid-template-columns:\s*repeat\(4,/u);
assert.match(
  css,
  /@media \(max-width:\s*767px\)[\s\S]*\.home-faq__grid[\s\S]*grid-template-columns:\s*1fr/u,
);
```

- [ ] **Step 2: Run the responsive contract and verify red**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-responsive-contract.test.ts`

Expected: failure because the new layout classes are not styled.

- [ ] **Step 3: Implement the scoped stylesheet**

Replace obsolete homepage-body rules with compact, flat bands. Desktop values:

```css
.site-public .home-setup-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
.site-public .home-flow-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.site-public .home-estimator-band {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(22rem, 1.1fr);
}
.site-public .home-services-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.site-public .home-why-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.site-public .home-knowledge-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.site-public .home-faq__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
```

At tablet, reduce services and knowledge to three/two columns. Below 768px, stack setup, flow, estimator and FAQ, use two service columns, maintain 44px controls and prevent overflow. Use logical properties and `[dir='rtl']` only for directional icon mirroring. Preserve all hero and `.cta-section` rules unchanged.

- [ ] **Step 4: Run responsive and focused tests**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-responsive-contract.test.ts "src/app/(public)/page.test.ts"`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/public-theme.css" src/components/site/home/homepage-responsive-contract.test.ts
git commit -m "style(public): match homepage reference composition"
```

### Task 5: Verify candidate and refresh evidence

**Files:**

- Modify: `Reports/launch-gate-evidence/2026-08-31/public-frontend-phase-1/p1-03-homepage/verification.md` (repository root)
- Replace: the four P1.03 evidence PNG files and `SHA256SUMS.txt` (repository root)
- Modify: `Reports/daily-work-report.md` (repository root)

- [ ] **Step 1: Run all focused gates**

Run the prompt's discovered homepage test command, `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `git diff --check`, and `npm run build` with sanitized local build variables.

Expected: zero affected failures; lint may retain only documented unrelated warnings.

- [ ] **Step 2: Verify protected boundaries**

Run:

```bash
git diff 36b1cc6 -- src/components/site/home/HeroSection.tsx src/components/site/home/FinalCtaSection.tsx
```

Expected: no output.

- [ ] **Step 3: Review the exact candidate on port 3001**

Verify English desktop light/dark, Arabic mobile light/dark, 768px tablet, 720px reflow, keyboard FAQ, reduced motion, image loading, routes, zero page overflow, console errors and axe Critical/Serious results. Compare page pacing and section proportions directly with `homee.png`.

- [ ] **Step 4: Replace evidence**

Capture four sanitized screenshots, regenerate `SHA256SUMS.txt`, update `verification.md` with the new final SHA and browser results, and append the corrective rebuild result to the August 31 daily report.

- [ ] **Step 5: Final clean-state check**

Run: `git status --short`, `git rev-parse HEAD`, `git diff --check`, and `sha256sum -c SHA256SUMS.txt` from the evidence directory.

Expected: clean app worktree, exact committed candidate SHA, no whitespace errors and four passing hashes.
