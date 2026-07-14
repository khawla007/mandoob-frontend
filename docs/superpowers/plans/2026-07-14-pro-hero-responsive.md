# PRO Hero Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/pro` a unique optimized background and make its hero visually match the home hero's responsive height without removing or moving content.

**Architecture:** Keep the shared `.hero` implementation intact and add a page-specific `hero--pro` modifier. The modifier owns only the PRO background, overlay tuning, and compact responsive spacing; a static regression contract protects the class and CSS rules while browser measurements validate the visual behavior.

**Tech Stack:** Next.js 16, React 19, scoped CSS, Node test runner, OpenAI built-in image generation, WebP.

---

### Task 1: Generate and optimize the PRO hero asset

**Files:**
- Create: `public/hero/pro-firm-operations.webp`

- [ ] **Step 1: Generate the source image**

Use the exact structured prompt in `docs/superpowers/specs/2026-07-14-pro-hero-responsive-design.md`. Generate with the built-in image tool; this is a project-bound `photorealistic-natural` website hero asset.

- [ ] **Step 2: Inspect the generated composition**

Confirm the left 55% is low-detail, the operational subject is concentrated on the right, and the image contains no text, logos, watermark, people, or readable personal data. If one constraint fails, make one targeted generation/edit iteration.

- [ ] **Step 3: Export the production asset**

Crop and resize to `1915x821`, then export WebP at approximately 78–84 quality as `public/hero/pro-firm-operations.webp`. Confirm dimensions with:

```bash
file public/hero/pro-firm-operations.webp
```

Expected: WebP image data with dimensions `1915 x 821`.

- [ ] **Step 4: Validate practical asset weight**

Run:

```bash
du -h public/hero/pro-firm-operations.webp
```

Expected: preferably below 300 KB; if larger, lower WebP quality without visible banding or destructive detail loss.

- [ ] **Step 5: Commit**

```bash
git add public/hero/pro-firm-operations.webp
git commit -m "feat: add PRO hero background"
```

### Task 2: Add the PRO hero modifier through TDD

**Files:**
- Create: `src/components/site/pro/ProHeroSection.test.ts`
- Modify: `src/components/site/pro/ProHeroSection.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Write the failing regression contract**

Create `src/components/site/pro/ProHeroSection.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const component = readFileSync(
  join(root, 'src/components/site/pro/ProHeroSection.tsx'),
  'utf8',
);
const css = readFileSync(join(root, 'src/app/(public)/public-theme.css'), 'utf8');

test('PRO hero uses a dedicated page modifier and background asset', () => {
  assert.match(component, /className="hero hero--pro"/);
  assert.match(css, /\.site-public \.hero--pro\s*\{/);
  assert.match(css, /url\('\/hero\/pro-firm-operations\.webp'\)/);
});

test('PRO hero has compact desktop and mobile spacing without a fixed height', () => {
  assert.match(css, /\.site-public \.hero--pro\s*\{[^}]*padding-block:\s*var\(--sp-7\)/s);
  assert.match(
    css,
    /@media \(max-width: 767px\)[\s\S]*?\.site-public \.hero--pro\s*\{[^}]*padding-block:\s*var\(--sp-6\)/,
  );
  assert.doesNotMatch(css, /\.site-public \.hero--pro\s*\{[^}]*(?:height|max-height):/s);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/site/pro/ProHeroSection.test.ts
```

Expected: FAIL because `hero--pro` and its CSS do not exist.

- [ ] **Step 3: Add the modifier to the PRO component**

Change only the opening section class in `ProHeroSection.tsx`:

```tsx
<section className="hero hero--pro" aria-labelledby="pro-hero-h">
```

Do not change any visible copy, CTA, statistic, or section ordering.

- [ ] **Step 4: Add scoped responsive CSS**

Immediately after the shared hero overlay rule in `public-theme.css`, add:

```css
.site-public .hero--pro {
  padding-block: var(--sp-7);
  background-image: url('/hero/pro-firm-operations.webp');
  background-position: center center;
}
.site-public .hero--pro .hero__overlay {
  background:
    linear-gradient(
      180deg,
      var(--paper) 0%,
      color-mix(in oklch, var(--paper) 68%, transparent) 27%,
      transparent 58%
    ),
    linear-gradient(
      90deg,
      var(--paper) 0%,
      color-mix(in oklch, var(--paper) 92%, transparent) 42%,
      color-mix(in oklch, var(--paper) 58%, transparent) 66%,
      color-mix(in oklch, var(--paper) 20%, transparent) 100%
    );
}
@media (max-width: 767px) {
  .site-public .hero--pro {
    padding-block: var(--sp-6);
    background-position: 68% center;
  }
  .site-public .hero--pro .display {
    font-size: clamp(2.5rem, 12vw, var(--fs-56));
    max-width: 15ch;
  }
  .site-public .hero--pro .lede {
    margin-top: var(--sp-4);
    font-size: var(--fs-17);
    line-height: 1.5;
  }
  .site-public .hero--pro .cta-row {
    margin-top: var(--sp-4);
  }
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/site/pro/ProHeroSection.test.ts
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 6: Run static verification**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: both exit 0; pre-existing warnings may be reported separately.

- [ ] **Step 7: Commit**

```bash
git add src/components/site/pro/ProHeroSection.test.ts src/components/site/pro/ProHeroSection.tsx 'src/app/(public)/public-theme.css'
git commit -m "fix: compact PRO hero responsively"
```

### Task 3: Tune and verify responsive behavior

**Files:**
- Modify if measurements require it: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Start the isolated development server**

Run the worktree on an unused port:

```bash
npm run dev -- --port 3010
```

Expected: Next.js reports ready at `http://localhost:3010`.

- [ ] **Step 2: Compare desktop hero measurements**

At the same `1280x720` viewport, measure `.hero` on `/` and `/pro`. The PRO height must not exceed home by more than 24px. If it does, adjust only PRO modifier spacing/type rules; never delete or move content.

- [ ] **Step 3: Validate mobile layouts**

At `390x844` and `768x1024`, confirm:

- no horizontal overflow;
- no clipped or overlapping headline, lede, or CTAs;
- both CTAs remain visible and at least 44px tall;
- the stats band stays after the hero;
- background remains supportive and copy remains readable.

- [ ] **Step 4: Re-run focused test after tuning**

```bash
node --import tsx --conditions=react-server --test src/components/site/pro/ProHeroSection.test.ts
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Run production verification**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0. Record any pre-existing warnings without changing unrelated files.

- [ ] **Step 6: Commit tuning if needed**

```bash
git add 'src/app/(public)/public-theme.css'
git commit -m "fix: tune PRO hero breakpoints"
```

### Task 4: Final requirement review and integration

**Files:**
- Review: all files changed since `main`

- [ ] **Step 1: Review the final diff against the design spec**

Confirm dedicated image, preserved content, same-height intent, responsive rules, test coverage, and no unrelated changes.

- [ ] **Step 2: Run final verification**

```bash
node --import tsx --conditions=react-server --test src/components/site/pro/ProHeroSection.test.ts
npm run lint
npx tsc --noEmit
npm run build
git diff --check main...HEAD
```

Expected: all commands exit 0.

- [ ] **Step 3: Merge and push**

Merge the reviewed feature branch into local `main`, rerun the focused test on the merged result, and push `main` to the configured remote as explicitly requested by the user.

