# Shared Public Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one homepage-derived header across public, authentication, and account routes, with a bottom-border active-link indicator.

**Architecture:** `SiteHeader` remains the only shared header implementation. Route-group layouts render it directly, while the public theme stylesheet owns its visual states and a source-contract test protects both integration and styling.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Node test runner

---

### Task 1: Protect Shared Header Usage Across Route Groups

**Files:**

- Modify: `src/components/site/public-navigation.test.ts`
- Test: `src/components/site/public-navigation.test.ts`

- [ ] **Step 1: Write the failing route-group integration test**

Add layout source reads near the existing source constants:

```ts
const publicLayoutSource = readFileSync(
  new URL('../../app/(public)/layout.tsx', import.meta.url),
  'utf8',
);
const authLayoutSource = readFileSync(
  new URL('../../app/(auth)/layout.tsx', import.meta.url),
  'utf8',
);
const accountLayoutSource = readFileSync(
  new URL('../../app/account/layout.tsx', import.meta.url),
  'utf8',
);
```

Add this contract:

```ts
describe('shared public header layout integration', () => {
  it('uses the homepage header on public, auth, and account routes', () => {
    for (const layoutSource of [publicLayoutSource, authLayoutSource, accountLayoutSource]) {
      assert.match(
        layoutSource,
        /import \{ SiteHeader \} from '@\/components\/site\/SiteHeader';/u,
      );
      assert.equal(layoutSource.match(/<SiteHeader \/>/gu)?.length, 1);
    }
  });
});
```

- [ ] **Step 2: Run the integration contract**

Run: `node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts`

Expected: PASS because the three layouts already use the canonical component; this is a characterization test protecting the requested existing architecture.

- [ ] **Step 3: Commit the integration contract**

```bash
git add src/components/site/public-navigation.test.ts
git commit -m "test(public): protect shared header layouts"
```

### Task 2: Move the Active Indicator to the Bottom Edge

**Files:**

- Modify: `src/components/site/public-navigation.test.ts`
- Modify: `src/app/(public)/public-theme.css`
- Test: `src/components/site/public-navigation.test.ts`

- [ ] **Step 1: Change the styling contract and verify red**

Replace the active-state assertion with:

```ts
assert.match(
  cssSource,
  /\.site-public \.nav__links a\[aria-current='page'\]\s*\{[^}]*border-bottom:\s*2px solid var\(--accent\)[^}]*color:\s*var\(--public-cta-background\)/u,
);
assert.doesNotMatch(
  cssSource,
  /\.site-public \.nav__links a(?:\[aria-current='page'\])?\s*\{[^}]*border-inline-start:/u,
);
```

Run: `node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts`

Expected: FAIL because the stylesheet still uses `border-inline-start`.

- [ ] **Step 2: Implement the bottom-border indicator**

In the base link rule, replace the transparent side border with:

```css
border-bottom: 2px solid transparent;
padding-inline: 8px;
```

In the current-page rule, replace the side border with:

```css
border-bottom: 2px solid var(--accent);
```

- [ ] **Step 3: Run focused tests**

Run: `node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts`

Expected: all public navigation tests PASS.

- [ ] **Step 4: Run static verification**

Run: `npx prettier --check src/components/site/public-navigation.test.ts 'src/app/(public)/public-theme.css'`

Expected: both files use Prettier formatting.

Run: `npm run lint -- src/components/site/public-navigation.test.ts 'src/app/(public)/public-theme.css'`

Expected: zero lint errors.

Run: `npx tsc --noEmit`

Expected: TypeScript exits successfully.

- [ ] **Step 5: Commit the visual fix**

```bash
git add src/components/site/public-navigation.test.ts 'src/app/(public)/public-theme.css'
git commit -m "fix(public): unify header active indicator"
```
