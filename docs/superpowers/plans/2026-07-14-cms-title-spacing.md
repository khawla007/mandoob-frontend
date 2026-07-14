# CMS Title Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every no-hero page created through the CMS Page Editor 96px of title-section top padding and 20px of bottom padding on desktop and mobile.

**Architecture:** Add a dedicated class to the shared `PublicCmsPage` no-hero header and define its spacing in the public theme. Hero-enabled CMS pages keep their existing rendering path and styles.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Node test runner

---

### Task 1: Lock the shared no-hero spacing contract

**Files:**
- Modify: `src/components/pages/PublicCmsPage.test.ts`
- Modify: `src/components/pages/PublicCmsPage.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Write the failing regression test**

Add a test that renders a CMS page with an empty hero, confirms the shared title header uses `cms-page__title-section`, reads `public-theme.css`, and confirms that selector declares `padding-block: 96px 20px`.

```ts
test('no-hero CMS pages use the shared 96px by 20px title spacing', () => {
  const element = PublicCmsPage({ page: cmsPage({ heroSettings: null }) });
  const serialized = JSON.stringify(element);
  assert.match(serialized, /cms-page__title-section/);

  const css = readFileSync(new URL('../../app/(public)/public-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-public \.cms-page__title-section\s*{[^}]*padding-block:\s*96px 20px;/s);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/pages/PublicCmsPage.test.ts
```

Expected: FAIL because `cms-page__title-section` and its spacing rule do not exist yet.

- [ ] **Step 3: Implement the shared title-section class**

Change the no-hero header in `PublicCmsPage.tsx` to:

```tsx
<header className="section cms-page__title-section">
  <div className="container"><h1 className="h2">{page.title}</h1></div>
</header>
```

Add the global no-hero CMS rule beside the long-form document styles in `public-theme.css`:

```css
.site-public .cms-page__title-section {
  padding-block: 96px 20px;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/pages/PublicCmsPage.test.ts
```

Expected: all `PublicCmsPage` tests pass.

### Task 2: Verify behavior and repository health

**Files:**
- Verify: `src/components/pages/PublicCmsPage.tsx`
- Verify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
find src -name '*.test.ts' -print0 | xargs -0 node --import tsx --conditions=react-server --test
```

Expected: 0 failures.

- [ ] **Step 2: Run lint and production build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0; pre-existing lint warnings may remain.

- [ ] **Step 3: Verify all four legal pages in a browser**

At 1440 × 900 and 390 × 844, inspect `/privacy`, `/terms`, `/pdpl`, and `/trust`. For every page, verify the title begins 96px below the public header, the title header ends 20px after the title line box, and mobile `scrollWidth` does not exceed `innerWidth`.

- [ ] **Step 4: Commit and push**

```bash
git add docs/superpowers/plans/2026-07-14-cms-title-spacing.md src/components/pages/PublicCmsPage.test.ts src/components/pages/PublicCmsPage.tsx 'src/app/(public)/public-theme.css'
git commit -m "fix: space CMS page titles"
git push origin main
```

