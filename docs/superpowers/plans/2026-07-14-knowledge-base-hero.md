# Knowledge Base Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/knowledge-base` a unique optimized editorial background and make its content-preserving hero closely match the home hero's responsive visual height.

**Architecture:** Keep shared `.hero`, home, and `/pro` untouched. Add one `hero--knowledge-base` modifier and decorative overlay element to the existing Knowledge Base page, with all image, readability, spacing, type, metric, and CTA behavior scoped to that modifier; protect the contract with a static Node regression test and validate real layout in a browser.

**Tech Stack:** Next.js 16, React 19, scoped CSS, Node test runner, built-in image generation, WebP, agent-browser.

---

### Task 1: Generate and optimize the Knowledge Base hero asset

**Files:**
- Create: `public/hero/knowledge-base-research.webp`

- [ ] **Step 1: Generate the source image**

Use the exact structured prompt in `docs/superpowers/specs/2026-07-14-knowledge-base-hero-design.md` with the built-in image-generation tool. This is a project-bound `photorealistic-natural` responsive website hero.

- [ ] **Step 2: Inspect the generated image**

Confirm quiet low-detail negative space across the left 55%, editorial research detail on the right, realistic warm materials, and no people, readable text/data, logos, flags, watermark, dashboards, neon, or blue corporate gradient. If a required constraint fails, make one targeted generation/edit iteration.

- [ ] **Step 3: Export the production WebP**

Use ImageMagick to crop/resize without distortion and export the selected source at 1915×821:

```bash
magick <generated-source> -resize '1915x821^' -gravity center -extent 1915x821 -strip -quality 82 public/hero/knowledge-base-research.webp
```

Verify:

```bash
identify public/hero/knowledge-base-research.webp
du -h public/hero/knowledge-base-research.webp
```

Expected: `1915x821` WebP and below 300KB when visually practical. Reduce quality in small increments if needed and re-inspect for banding.

- [ ] **Step 4: Commit the asset**

```bash
git add public/hero/knowledge-base-research.webp
git commit -m "feat: add Knowledge Base hero background"
```

### Task 2: Add the scoped hero contract through TDD

**Files:**
- Create: `src/app/(public)/knowledge-base/KnowledgeBaseHero.test.ts`
- Modify: `src/app/(public)/knowledge-base/page.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Write the failing regression contract**

Create `src/app/(public)/knowledge-base/KnowledgeBaseHero.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const page = readFileSync(join(root, 'src/app/(public)/knowledge-base/page.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/app/(public)/public-theme.css'), 'utf8');

test('Knowledge Base hero uses its own modifier, overlay, and background asset', () => {
  assert.match(page, /className="hero hero--knowledge-base"/);
  assert.match(page, /className="hero__overlay" aria-hidden="true"/);
  assert.match(css, /url\('\/hero\/knowledge-base-research\.webp'\)/);
});

test('Knowledge Base hero preserves CTAs and ordered in-hero metrics', () => {
  const labels = ['Estimate setup cost', 'Browse topics', 'guides', 'topics', 'free zones', 'updates'];
  let priorIndex = -1;
  for (const label of labels) {
    const index = page.indexOf(label);
    assert.ok(index > priorIndex, `${label} must remain present and ordered`);
    priorIndex = index;
  }
  assert.match(page, /hero__rule[\s\S]*hero__metrics/);
});

test('Knowledge Base hero has scoped natural-height responsive rules', () => {
  assert.match(css, /\.site-public \.hero--knowledge-base\s*\{(?:(?!})[\s\S])*padding-block:\s*var\(--sp-5\)/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.site-public \.hero--knowledge-base\s*\{/);
  assert.doesNotMatch(css, /\.site-public \.hero--knowledge-base\s*\{(?:(?!})[\s\S])*(?:height|max-height):/);
});

test('Knowledge Base primary CTA has scoped accessible normal and hover colors', () => {
  assert.match(css, /\.site-public \.hero--knowledge-base \.btn--accent\s*\{[^}]*background:\s*oklch\(0\.57 0\.19 38\)/);
  assert.match(css, /\.site-public \.hero--knowledge-base \.btn--accent:hover\s*\{[^}]*background:\s*oklch\(0\.52 0\.17 38\)/);
});
```

- [ ] **Step 2: Prove RED**

Run:

```bash
node --import tsx --conditions=react-server --test 'src/app/(public)/knowledge-base/KnowledgeBaseHero.test.ts'
```

Expected: FAIL because the modifier, overlay, asset reference, and scoped rules do not exist.

- [ ] **Step 3: Add only the modifier and decorative overlay**

Change the existing section opening and add the overlay as its first child:

```tsx
<section className="hero hero--knowledge-base" aria-labelledby="kb-h">
  <div className="hero__overlay" aria-hidden="true" />
```

Do not change any visible string, link, data expression, or element order after the new decorative overlay.

- [ ] **Step 4: Add scoped CSS after the legacy hero-metric rules**

Add this initial implementation, then tune only numeric values if browser measurements require it:

```css
.site-public .hero--knowledge-base {
  padding-block: var(--sp-5);
  background-image: url('/hero/knowledge-base-research.webp');
  background-position: center center;
}
.site-public .hero--knowledge-base .hero__overlay {
  background:
    linear-gradient(
      180deg,
      var(--paper) 0%,
      color-mix(in oklch, var(--paper) 58%, transparent) 30%,
      color-mix(in oklch, var(--paper) 18%, transparent) 100%
    ),
    linear-gradient(
      90deg,
      var(--paper) 0%,
      color-mix(in oklch, var(--paper) 94%, transparent) 43%,
      color-mix(in oklch, var(--paper) 56%, transparent) 67%,
      color-mix(in oklch, var(--paper) 16%, transparent) 100%
    );
}
.site-public .hero--knowledge-base .display {
  max-width: 15ch;
  font-size: clamp(3rem, 7.5vw, 6rem);
  line-height: 0.94;
}
.site-public .hero--knowledge-base .lede,
.site-public .hero--knowledge-base .cta-row {
  margin-top: var(--sp-4);
}
.site-public .hero--knowledge-base .hero__rule {
  margin-block: var(--sp-4);
}
.site-public .hero--knowledge-base .hero__metrics {
  gap: var(--sp-3);
  padding-bottom: var(--sp-5);
}
.site-public .hero--knowledge-base .btn--accent {
  background: oklch(0.57 0.19 38);
}
.site-public .hero--knowledge-base .btn--accent:hover {
  background: oklch(0.52 0.17 38);
}
@media (max-width: 767px) {
  .site-public .hero--knowledge-base {
    padding-block: var(--sp-5);
    background-position: 70% center;
  }
  .site-public .hero--knowledge-base .eyebrow {
    margin-bottom: var(--sp-3);
  }
  .site-public .hero--knowledge-base .display {
    max-width: 15ch;
    font-size: clamp(2.5rem, 11.3vw, 3.25rem);
    line-height: 0.96;
  }
  .site-public .hero--knowledge-base .lede {
    margin-top: var(--sp-3);
    font-size: var(--fs-17);
    line-height: 1.45;
  }
  .site-public .hero--knowledge-base .cta-row {
    margin-top: var(--sp-4);
  }
  .site-public .hero--knowledge-base .hero__rule {
    margin-block: var(--sp-4);
  }
  .site-public .hero--knowledge-base .hero__metrics {
    gap: var(--sp-3);
    padding-bottom: var(--sp-5);
  }
}
```

- [ ] **Step 5: Prove GREEN**

Run the focused command from Step 2. Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Commit the implementation**

```bash
git add 'src/app/(public)/knowledge-base/KnowledgeBaseHero.test.ts' 'src/app/(public)/knowledge-base/page.tsx' 'src/app/(public)/public-theme.css'
git commit -m "fix: improve Knowledge Base hero"
```

### Task 3: Tune, verify, and document the completed session

**Files:**
- Modify only if measurements require it: `src/app/(public)/public-theme.css`
- Modify outside the frontend repository after merge: `../Reports/daily-work-report.md`

- [ ] **Step 1: Start the worktree server**

```bash
npm run dev -- --port 3010
```

Expected: ready at `http://localhost:3010`.

- [ ] **Step 2: Measure all required viewports**

At 1280×720, 768×1024, and 390×844 measure home, `/knowledge-base`, and `/pro` hero heights; document pre/post Knowledge Base values. At 1280×720, tune only `.hero--knowledge-base` descendants until the absolute home/Knowledge Base delta is at most 24px without clipping.

- [ ] **Step 3: Verify layout and themes**

At each viewport in light and dark themes, confirm `scrollWidth <= clientWidth`, every hero child lies within the hero rectangle, both CTA computed heights are at least 44px, metrics are visible and ordered, and the computed background URL contains `knowledge-base-research.webp`. Capture desktop and mobile screenshots for visual inspection. Recheck home and `/pro` against their baseline assets and markup.

- [ ] **Step 4: Measure CTA contrast**

Read the primary CTA's computed foreground/background colors in normal and hover states and calculate WCAG relative-luminance contrast. Both must be at least 4.5:1 because the 14px button text is normal-size text.

- [ ] **Step 5: Re-run focused and production checks**

```bash
node --import tsx --conditions=react-server --test 'src/app/(public)/knowledge-base/KnowledgeBaseHero.test.ts'
npm run lint
npm run build
git diff --check main...HEAD
```

Expected: focused tests pass, lint has zero errors, build exits 0, and diff check is empty. Report the pre-existing Node 20 quoted-glob `npm test` failure separately.

- [ ] **Step 6: Commit measurement tuning if present**

```bash
git add 'src/app/(public)/public-theme.css'
git commit -m "fix: tune Knowledge Base hero breakpoints"
```

- [ ] **Step 7: Complete whole-diff review and integration**

Review `main...HEAD` for specification compliance and code quality. Merge the feature branch into local `main`, rerun the focused test on merged `main`, push `main` to `origin`, and record the remote SHA.

- [ ] **Step 8: Append the daily report**

Under `Work Completed` in `../Reports/daily-work-report.md`, add a dated session heading summarizing the dedicated asset, scoped responsive hero, measurements, contrast, tests, lint, build, merge, and pushed SHA. Preserve all existing report content.
