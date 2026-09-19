# Public Header Smooth Zero-Gap Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore smooth sticky-header motion while keeping the collapsing contact bar opaque and ending with the navigation exactly at the viewport top.

**Architecture:** Continue using the existing grid-row collapse. Replace the one-frame `display: none` removal with synchronized grid-row and border-width transitions, and delay the discrete `visibility: hidden` change until the 420ms geometry transition completes; expansion restores visibility immediately.

**Tech Stack:** Next.js, CSS, TypeScript, Node test runner, agent-browser

---

### Task 1: Smooth the zero-gap contact-bar collapse

**Files:**
- Modify: `src/components/site/public-navigation.test.ts:272-305`
- Modify: `src/app/(public)/public-theme.css:448-505`

- [ ] **Step 1: Write the failing regression contract**

Rename the contract to `smoothly collapses the painted contact bar without leaving a gap`. Replace the immediate-removal assertion with these requirements while retaining the existing grid, hidden-state and no-opacity checks:

```ts
assert.match(
  cssSource,
  /\.site-public \.public-topbar\s*\{[^}]*transition:\s*grid-template-rows 420ms cubic-bezier\(0\.16, 1, 0\.3, 1\),\s*border-block-end-width 420ms cubic-bezier\(0\.16, 1, 0\.3, 1\),\s*visibility 0s linear 0s/u,
);
assert.doesNotMatch(
  cssSource,
  /\.site-public\.public-header-frame\[data-collapsed='true'\] \.public-topbar\s*\{[^}]*display:\s*none/u,
);
assert.match(
  cssSource,
  /\.site-public\.public-header-frame\[data-collapsed='true'\] \.public-topbar\s*\{[^}]*border-block-end-width:\s*0[^}]*transition:\s*grid-template-rows 420ms cubic-bezier\(0\.16, 1, 0\.3, 1\),\s*border-block-end-width 420ms cubic-bezier\(0\.16, 1, 0\.3, 1\),\s*visibility 0s linear 420ms/u,
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test src/components/site/public-navigation.test.ts
```

Expected: FAIL because the collapsed rule still uses `display: none` and the synchronized/delayed transitions do not exist.

- [ ] **Step 3: Implement the minimal transition fix**

Update the base contact-bar transition:

```css
transition:
  grid-template-rows 420ms cubic-bezier(0.16, 1, 0.3, 1),
  border-block-end-width 420ms cubic-bezier(0.16, 1, 0.3, 1),
  visibility 0s linear 0s;
```

Update only the collapsed contact-bar rule:

```css
.site-public.public-header-frame[data-collapsed='true'] .public-topbar {
  grid-template-rows: 0fr;
  visibility: hidden;
  border-block-end-width: 0;
  transition:
    grid-template-rows 420ms cubic-bezier(0.16, 1, 0.3, 1),
    border-block-end-width 420ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s linear 420ms;
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
npx eslint src/components/site/public-navigation.test.ts
```

Expected: all focused tests, formatting and lint pass.

- [ ] **Step 5: Run the full suite**

Run `npm test`.

Expected: all tests pass with zero failures.

- [ ] **Step 6: Verify browser motion and shared routes**

At desktop width in both themes, sample `.nav.getBoundingClientRect().top` during collapse. Expected sequence: starts near `45`, includes intermediate values strictly between `45` and `0`, and settles at `0` after 420ms. During motion, `.public-topbar` must remain painted with its existing opaque background; when settled it must have height `0`, border width `0px` and `visibility: hidden`.

Scroll back to the top and confirm the reverse motion contains intermediate positions and restores the 45px contact bar. Confirm focus protection, header controls, mobile home, `/login` and `/register`, no horizontal overflow and no browser errors.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/public-theme.css' src/components/site/public-navigation.test.ts
git commit -m "fix(public): smooth sticky header collapse"
```

