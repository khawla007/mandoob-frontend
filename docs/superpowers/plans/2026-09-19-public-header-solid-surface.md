# Public Header Solid Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove transparency from the shared logo-and-navigation header surface in light and dark modes without changing its colors, layout, sticky behavior, or other header regions.

**Architecture:** Keep `SiteHeader` and every layout unchanged. Update the four concrete `--public-header-surface` token declarations in the shared public stylesheet, then strengthen the existing public-theme contract so all base and company-setup variants must retain the same RGB colors with no alpha channel.

**Tech Stack:** Next.js 16, React 19, TypeScript source-contract tests, CSS

---

### Task 1: Make the shared navigation surface opaque

**Files:**
- Modify: `src/components/site/public-theme.test.ts`
- Modify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Write the failing token contract**

Replace the existing test named `sticky public header surfaces retain the accepted translucent treatment` in `src/components/site/public-theme.test.ts` with:

```ts
renderTest('sticky public header surfaces preserve their colors without transparency', () => {
  assert.equal(rawToken(declarations('.site-public'), 'public-header-surface'), '#fff');
  assert.equal(rawToken(declarations('.dark .site-public'), 'public-header-surface'), '#0a0a0a');

  const values = [...css.matchAll(/--public-header-surface:\s*([^;]+);/gu)].map((match) =>
    match[1].trim(),
  );
  assert.deepEqual(values, [
    '#fff',
    '#0a0a0a',
    'rgb(255 255 255)',
    'rgb(24 24 27)',
    'inherit',
  ]);
  assert.doesNotMatch(css, /--public-header-surface:[^;]*(?:rgba|\/\s*85%|0\.85)/u);
});
```

This checks both shared theme roots, both company-setup palette overrides, the intentional inheritance bridge, and the absence of the old alpha syntax.

- [ ] **Step 2: Run the focused test and confirm the red phase**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/site/public-theme.test.ts
```

Expected: FAIL because the stylesheet still contains the 85% alpha values.

- [ ] **Step 3: Remove only the token alpha channels**

In `src/app/(public)/public-theme.css`, make exactly these replacements:

```css
/* Base light scope */
--public-header-surface: #fff;

/* Base dark scope */
--public-header-surface: #0a0a0a;

/* Company-setup light scope */
--public-header-surface: rgb(255 255 255);

/* Company-setup dark scope */
--public-header-surface: rgb(24 24 27);
```

Do not modify `.nav`, `SiteHeader`, layouts, contact-bar rules, sticky frame rules, dimensions, transitions, borders, or blur declarations.

- [ ] **Step 4: Run focused theme and navigation tests**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/site/public-theme.test.ts src/components/site/public-navigation.test.ts
```

Expected: both test files PASS, including the existing contract that public, auth, and account layouts each mount the shared `SiteHeader` once.

- [ ] **Step 5: Run formatting and full verification**

Run:

```bash
npx prettier --check src/components/site/public-theme.test.ts 'src/app/(public)/public-theme.css'
npm run lint -- src/components/site/public-theme.test.ts
npm test
```

Expected: formatting and lint exit `0`; the complete source suite passes with zero failures.

- [ ] **Step 6: Inspect shared pages in the browser**

Open `/`, `/login`, and `/register` using the same local revision. In both light and dark modes, scroll enough to collapse the contact bar and confirm:

- the logo/navigation region remains fully opaque;
- the light and dark colors match their previous colors;
- no page content shows through the navigation surface;
- contact-bar collapse, sticky position, dimensions, spacing, and navigation contents are unchanged.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/components/site/public-theme.test.ts 'src/app/(public)/public-theme.css'
git commit -m "fix(public): make shared header surface opaque"
```
