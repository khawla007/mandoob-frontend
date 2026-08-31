# Public Container Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the shared public-page container maximum from 1200px to 1440px without changing mobile gutters or dashboard layouts.

**Architecture:** Keep the change centralized in the existing `--container` design token in `public-theme.css`. Protect it with a source contract and verify rendered width plus horizontal overflow in the running public homepage.

**Tech Stack:** Next.js 16, React 19, CSS custom properties, Node test runner, agent-browser.

---

### Task 1: Widen and verify the public container

**Files:**

- Modify: `src/app/(public)/public-theme.css:86`
- Modify: `src/components/site/home/homepage-responsive-contract.test.ts`

- [x] **Step 1: Write the failing contract**

Add this assertion to the public-theme contract:

```ts
it('uses the approved wide public container', () => {
  assert.match(publicThemeCss, /--container:\s*1440px;/u);
});
```

- [x] **Step 2: Verify the contract fails**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/site/home/homepage-responsive-contract.test.ts
```

Expected: FAIL because the current token is `1200px`.

- [x] **Step 3: Implement the approved token**

Change the shared token to:

```css
--container: 1440px;
```

- [x] **Step 4: Verify code and rendering**

Run the focused layout contract, `npx tsc --noEmit`, `npm run lint`, `npx prettier --check` for the touched files, and `git diff --check`. On port 3001, confirm the desktop container is wider and that desktop and mobile `scrollWidth` equal `clientWidth`.

- [x] **Step 5: Commit**

```bash
git add src/app/'(public)'/public-theme.css src/components/site/home/homepage-responsive-contract.test.ts
git commit -m "fix(public): widen shared content container"
```
