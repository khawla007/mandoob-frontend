# Public Design-4 Color and Font Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public pages use the canonical `html-design/design-4` colors and Geist typography without changing layouts, localization, dark-mode behavior, or authenticated dashboards.

**Architecture:** Keep runtime changes inside `.site-public` in `public-theme.css`; global dashboard tokens and font loading stay untouched. Lock exact reference values in source tests first, implement the CSS token/component mapping, then update the parent design-system document.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS custom properties, `next/font`, Node test runner with `tsx`, next-themes.

---

## File map

- Modify `src/components/site/public-theme.test.ts`: exact palette/font/component contracts.
- Modify `src/components/site/home/homepage-content-contract.test.ts`: homepage visual contracts.
- Modify `src/app/(public)/public-theme.css`: scoped runtime implementation.
- Modify `../docs/design-system.md`: dashboard/public system documentation and current homepage inventory.

### Task 1: Lock the design-4 reference in failing tests

**Files:**
- Modify: `src/components/site/public-theme.test.ts`
- Modify: `src/components/site/home/homepage-content-contract.test.ts`

- [ ] **Step 1: Add a general token reader**

```ts
function rawToken(block: string, name: string): string {
  const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`, 'u'))?.[1].trim();
  assert.ok(value, `missing --${name}`);
  return value;
}
```

- [ ] **Step 2: Replace the semantic CTA contrast test with exact light-palette parity**

```ts
renderTest('public light tokens match the canonical design-4 palette and fonts', () => {
  const block = declarations('.site-public');
  const expected = {
    paper: '#FFFFFF', ink: '#000000', 'zinc-50': '#FAFAFA',
    'zinc-100': '#F4F4F5', 'zinc-200': '#E4E4E7', 'zinc-300': '#D4D4D8',
    'zinc-400': '#A1A1AA', 'zinc-500': '#71717A', 'zinc-600': '#52525B',
    'zinc-700': '#3F3F46', 'zinc-900': '#18181B', 'zinc-950': '#09090B',
    accent: '#FF5722', 'accent-hover': '#E64A19', 'accent-soft': '#FFF1ED',
    'pb-border': '#E4E4E7', 'pb-border-dark': '#27272A',
  } as const;
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(rawToken(block, name).toUpperCase(), value);
  }
  assert.match(rawToken(block, 'font'), /var\(--font-geist-sans\)/u);
  assert.match(rawToken(block, 'mono-font'), /var\(--font-geist-mono\)/u);
});
```

Delete the now-unused luminance helpers. Retain semantic-role presence and disabled-state tests. Add a dark test requiring `#FF5722`, `#E64A19`, and white CTA text while confirming neutrals are inverted.

- [ ] **Step 3: Add exact component contracts**

```ts
renderTest('design-4 component colors and weights are preserved', () => {
  assert.match(declarations('.site-public .btn--accent'), /background:\s*var\(--accent\)[^}]*color:\s*#fff/isu);
  assert.match(declarations('.site-public .btn--accent:hover'), /background:\s*var\(--accent-hover\)/u);
  assert.match(declarations('.site-public .eyebrow'), /color:\s*var\(--zinc-500\)/u);
  assert.match(declarations('.site-public .eyebrow--accent'), /color:\s*var\(--zinc-500\)/u);
  assert.match(declarations('.site-public .cell__link'), /color:\s*var\(--accent\)/u);
  const homeLink = declarations('.site-public .home-text-link');
  assert.match(homeLink, /color:\s*var\(--accent\)/u);
  assert.match(homeLink, /font-size:\s*var\(--fs-14\)/u);
  assert.match(homeLink, /font-weight:\s*600/u);
});
```

Extend `homepage-content-contract.test.ts` to require `eyebrow--accent` to resolve to Zinc 500 and `.home-text-link` to use accent/14px/600.

- [ ] **Step 4: Run tests and verify red**

Run: `npx tsx --test src/components/site/public-theme.test.ts src/components/site/home/homepage-content-contract.test.ts`

Expected: FAIL on warm OKLCH neutrals, `--accent-ink` eyebrow/link colors, and 13px/700 homepage links.

- [ ] **Step 5: Commit failing contracts**

Run: `git add src/components/site/public-theme.test.ts src/components/site/home/homepage-content-contract.test.ts`

Run: `git commit -m "test(public): lock design-4 visual tokens"`

### Task 2: Implement scoped public parity

**Files:**
- Modify: `src/app/(public)/public-theme.css`
- Test: `src/components/site/public-theme.test.ts`
- Test: `src/components/site/home/homepage-content-contract.test.ts`

- [ ] **Step 1: Replace light primitives with exact reference values**

```css
--paper: #ffffff;
--ink: #000000;
--ink-inv: #ffffff;
--zinc-50: #fafafa;
--zinc-100: #f4f4f5;
--zinc-200: #e4e4e7;
--zinc-300: #d4d4d8;
--zinc-400: #a1a1aa;
--zinc-500: #71717a;
--zinc-600: #52525b;
--zinc-700: #3f3f46;
--zinc-900: #18181b;
--zinc-950: #09090b;
--accent: #ff5722;
--accent-hover: #e64a19;
--accent-ink: var(--accent);
--accent-soft: #fff1ed;
--pb-border: #e4e4e7;
--pb-border-dark: #27272a;
```

Resolve public CTA base/focus to `#ff5722`, text to `#ffffff`, and hover/active to `#e64a19`. Retain dedicated disabled, scrim, focus, and surface roles where the static reference has no equivalent.

- [ ] **Step 2: Convert dark neutral inversion to reference Zinc hex values**

```css
--paper: #18181b;
--ink: #fafafa;
--zinc-50: #09090b;
--zinc-100: #18181b;
--zinc-200: #27272a;
--zinc-300: #3f3f46;
--zinc-400: #52525b;
--zinc-500: #71717a;
--zinc-600: #a1a1aa;
--zinc-700: #d4d4d8;
--zinc-900: #e4e4e7;
--zinc-950: #f4f4f5;
--accent: #ff5722;
--accent-hover: #e64a19;
--accent-ink: var(--accent);
```

Do not edit `globals.css` or `layout.tsx`; Geist, Geist Mono, and the Arabic font are already loaded correctly.

- [ ] **Step 3: Restore reference component rules**

```css
.site-public .eyebrow { color: var(--zinc-500); }
.site-public .eyebrow--accent { color: var(--zinc-500); }
.site-public .cell__link { color: var(--accent); }
.site-public .home-text-link {
  color: var(--accent);
  font-size: var(--fs-14);
  font-weight: 600;
}
```

- [ ] **Step 4: Run focused tests and verify green**

Run: `npx tsx --test src/components/site/public-theme.test.ts src/components/site/home/homepage-content-contract.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Verify scope and commit**

Run: `git diff --check`

Run: `git diff -- src/app/globals.css 'src/app/(public)/public-theme.css'`

Expected: only `public-theme.css` changes; no `globals.css` diff.

Run: `git add 'src/app/(public)/public-theme.css'`

Run: `git commit -m "style(public): match design-4 colors and fonts"`

### Task 3: Update the design-system document

**Files:**
- Modify: `../docs/design-system.md`

- [ ] **Step 1: Correct document identity and sources**

Update its date and replace the April test-scaffold global-authority claim with three explicit sources:

```markdown
- `frontend/src/app/globals.css`: dashboard/application semantic tokens.
- `html-design/design-4/styles.css`: canonical public visual reference.
- `frontend/src/app/(public)/public-theme.css`: scoped runtime public implementation.
```

- [ ] **Step 2: Split dashboard and public color/font guidance**

Retain the existing shadcn token table under a dashboard heading. Add the complete reference Zinc palette, `#FF5722`, `#E64A19`, `#FFF1ED`, `#E4E4E7`, `#27272A`, Geist Sans, and Geist Mono under a public heading. Document inverted dark neutrals with unchanged orange accent and white CTA text.

- [ ] **Step 3: Document public component rules and trade-off**

Add: primary CTA `#FF5722`/white and hover `#E64A19`; eyebrow Zinc 500 and inverse Zinc 400; inline action link `#FF5722` weight 600. Record the approved small-text contrast trade-off. Keep dashboard button guidance clearly labeled dashboard-only.

- [ ] **Step 4: Replace stale homepage inventory**

Use this sequence from `src/app/(public)/page.tsx`:

```text
HeroSection → TrustBandSection → ServicesSection → FlowSection →
EstimatorSection → SupportServicesSection → WhyMandoobSection →
TestimonialsSection → KnowledgeFaqSection → FinalCtaSection
```

Remove stale mentions of the stats band, ProSuiteSection, DashboardSection, CustomersSection, and numbered middle sections.

- [ ] **Step 5: Verify documentation**

From the parent project directory run: `rg -n 'FF5722|E64A19|Geist Mono|public-theme.css|design-4/styles.css' docs/design-system.md`

Expected: all canonical values and sources are found.

Run: `rg -n 'ProSuiteSection|DashboardSection|CustomersSection|hero \+ stats band' docs/design-system.md`

Expected: no matches. The parent document is outside the `frontend` Git repository, so report it separately instead of claiming it is included in a frontend commit.

### Task 4: Full verification and localhost acceptance

**Files:**
- Verify: `src/app/(public)/public-theme.css`
- Verify: `src/app/layout.tsx`
- Verify: `../docs/design-system.md`

- [ ] **Step 1: Run static checks**

Run: `npx tsx --test src/components/site/public-theme.test.ts src/components/site/home/homepage-content-contract.test.ts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `git diff --check`

Expected: all commands exit 0; existing lint warnings may remain, but no new errors are allowed.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Next.js build exits 0.

- [ ] **Step 3: Verify localhost computed styles**

Use an isolated agent-browser session on `http://localhost:3001/`. Check the header CTA, hero CTA, `.home-text-link`, `.eyebrow--accent`, and `#cta-final` in light and dark modes.

Expected: CTA background `rgb(255, 87, 34)`, CTA text `rgb(255, 255, 255)`, hover `rgb(230, 74, 25)`, inline link `rgb(255, 87, 34)` at weight 600, light eyebrow `rgb(113, 113, 122)`, body font contains Geist, and eyebrow font contains Geist Mono. Dark mode keeps the accent values while neutral surfaces invert.

- [ ] **Step 4: Confirm final scope**

Run: `git status --short`

Run: `git diff HEAD~2 --name-only`

Expected: frontend commits contain only the planned public CSS/tests/spec/plan files. No authenticated dashboard component or global font-loading file changed. Report the separately updated parent `docs/design-system.md`.
