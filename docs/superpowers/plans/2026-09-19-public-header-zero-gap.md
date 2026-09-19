# Public Header Zero-Gap Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the animated and persistent strip above the sticky public navigation after the contact bar collapses.

**Architecture:** Preserve the existing shared header component and scroll-state logic. Strengthen only the collapsed CSS state so the contact bar leaves layout immediately and contributes no border, then lock that behavior with the existing source contract test and verify computed browser geometry.

**Tech Stack:** Next.js, React, CSS, TypeScript, Node test runner, agent-browser

---

### Task 1: Make the collapsed contact bar occupy zero layout space

**Files:**
- Modify: `src/components/site/public-navigation.test.ts:275-300`
- Modify: `src/app/(public)/public-theme.css:499-502`

- [ ] **Step 1: Write the failing regression test**

Add an assertion to the public-header animation test that requires the existing collapsed rule to remove the contact bar from layout and remove its border:

```ts
assert.match(
  cssSource,
  /\.site-public\.public-header-frame\[data-collapsed='true'\] \.public-topbar\s*\{[^}]*display:\s*none[^}]*border-block-end:\s*0/u,
);
```

Keep the existing assertions that the collapsed rule has `grid-template-rows: 0fr`, `visibility: hidden` and no opacity animation.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test src/components/site/public-navigation.test.ts
```

Expected: FAIL because the collapsed contact-bar rule does not contain `display: none` or `border-block-end: 0`.

- [ ] **Step 3: Implement the minimal collapsed-state fix**

Update only the existing collapsed contact-bar rule:

```css
.site-public.public-header-frame[data-collapsed='true'] .public-topbar {
  display: none;
  grid-template-rows: 0fr;
  visibility: hidden;
  border-block-end: 0;
}
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
node --import tsx --test \
  src/components/site/public-navigation.test.ts \
  src/components/site/PublicHeaderFrame.test.ts \
  src/components/site/public-theme.test.ts
npx prettier --check 'src/app/(public)/public-theme.css' src/components/site/public-navigation.test.ts
npx eslint 'src/app/(public)/public-theme.css' src/components/site/public-navigation.test.ts
```

Expected: all focused tests pass; Prettier passes. ESLint may report that the CSS file is ignored, but must report no JavaScript/TypeScript errors.

- [ ] **Step 5: Run the full test suite**

Run:

```bash
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 6: Verify runtime geometry and route coverage**

On the local development server, verify `/`, `/login` and `/register`. On `/`, scroll beyond the collapse threshold in light and dark modes and measure:

```js
({
  collapsed: document.querySelector('.public-header-frame')?.dataset.collapsed,
  topbarDisplay: getComputedStyle(document.querySelector('.public-topbar')).display,
  navTop: document.querySelector('.nav')?.getBoundingClientRect().top,
});
```

Expected after scrolling in both themes:

```js
{ collapsed: 'true', topbarDisplay: 'none', navTop: 0 }
```

Expected on all three routes: one shared public header, unchanged solid theme surface and no console errors.

- [ ] **Step 7: Commit the fix**

```bash
git add 'src/app/(public)/public-theme.css' src/components/site/public-navigation.test.ts
git commit -m "fix(public): remove sticky header top gap"
```
