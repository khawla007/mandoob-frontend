# Home Services Card Directional Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give only the three home services cards SteelNova’s simultaneous left/up/right one-second entrance while preserving the approved heading reveal and all other animations.

**Architecture:** Reuse the existing `EntranceReveal` observer and each card’s existing numeric modifier. A grid-specific class scopes CSS overrides that replace the shared stagger and generic vertical movement only for these three cards; focused source-contract assertions lock down direction, timing, and reduced-motion behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Node test runner, PostCSS test parsing

---

### Task 1: Add and verify the directional card reveal

**Files:**
- Modify: `src/components/site/home/homepage-content-contract.test.ts`
- Modify: `src/components/site/home/ServicesSection.tsx`
- Modify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Write the failing contract test**

Add this test after the existing services-heading reveal test in `src/components/site/home/homepage-content-contract.test.ts`:

```ts
it('matches the SteelNova directional reveal on only the three services cards', () => {
  const services = componentSources.find(({ file }) => file === 'ServicesSection.tsx')?.source ?? '';

  assert.match(services, /home-setup-grid cards-stagger home-setup-grid--directional-reveal/u);
  assert.match(
    services,
    /className=\{`home-setup-card home-setup-card--\$\{index \+ 1\} reveal`\}/u,
  );

  const shared = declarations(
    '.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card',
  );
  assert.match(shared, /opacity:\s*0/u);
  assert.match(shared, /opacity 1s ease/u);
  assert.match(shared, /transform 1s ease/u);
  assert.match(shared, /transition-delay:\s*0ms !important/u);
  assert.match(
    declarations('.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card--1'),
    /transform:\s*translateX\(-20px\)/u,
  );
  assert.match(
    declarations('.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card--2'),
    /transform:\s*translateY\(20px\)/u,
  );
  assert.match(
    declarations('.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card--3'),
    /transform:\s*translateX\(20px\)/u,
  );

  const visible = declarations(
    '.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card.is-in',
  );
  assert.match(visible, /opacity:\s*1/u);
  assert.match(visible, /transform:\s*none/u);

  const reduced = ruleDeclarations(
    reducedMotionRule(
      '.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card',
    ),
  );
  assert.equal(reduced.get('opacity'), '1');
  assert.equal(reduced.get('transform'), 'none');
  assert.equal(reduced.get('transition'), 'none');
});
```

- [ ] **Step 2: Run the focused test and confirm the red phase**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts`

Expected: FAIL because `home-setup-grid--directional-reveal` and its CSS rules do not exist.

- [ ] **Step 3: Scope the services card group**

Change the card-grid opening tag in `src/components/site/home/ServicesSection.tsx` to:

```tsx
<div
  className="home-setup-grid cards-stagger home-setup-grid--directional-reveal"
  data-reveal-cards
>
```

Leave the heading markup and card article classes unchanged.

- [ ] **Step 4: Add the exact SteelNova motion**

Add these rules immediately after the generic `.site-public.reveal-on .reveal.is-in` rule in `src/app/(public)/public-theme.css`:

```css
/* SteelNova About-section motion, scoped to the three home setup cards. */
.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card {
  opacity: 0;
  transition:
    opacity 1s ease,
    transform 1s ease;
  transition-delay: 0ms !important;
}

.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card--1 {
  transform: translateX(-20px);
}

.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card--2 {
  transform: translateY(20px);
}

.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card--3 {
  transform: translateX(20px);
}

.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card.is-in {
  opacity: 1;
  transform: none;
}
```

Inside the existing `@media (prefers-reduced-motion: reduce)` block, add:

```css
.site-public.reveal-on .home-setup-grid--directional-reveal .home-setup-card {
  opacity: 1;
  transform: none;
  transition: none;
}
```

- [ ] **Step 5: Run the focused contract test and confirm the green phase**

Run: `node --import tsx --conditions=react-server --test src/components/site/home/homepage-content-contract.test.ts`

Expected: all tests in the file PASS.

- [ ] **Step 6: Run formatting and static verification**

Run:

```bash
npx prettier --check src/components/site/home/ServicesSection.tsx src/components/site/home/homepage-content-contract.test.ts 'src/app/(public)/public-theme.css'
npm run lint -- src/components/site/home/ServicesSection.tsx src/components/site/home/homepage-content-contract.test.ts
```

Expected: both commands exit `0` with no new errors.

- [ ] **Step 7: Run the full source test suite**

Run: `npm test`

Expected: the full suite passes with zero failures.

- [ ] **Step 8: Inspect the animation in a browser**

Start the development server if necessary, open the public home page, and scroll the second section into view at desktop and mobile widths. Confirm the first card enters from `-20px` horizontally, the middle from `20px` below, and the last from `20px` horizontally, all simultaneously over one second; confirm the heading retains its character blur reveal and no horizontal overflow appears.

Emulate `prefers-reduced-motion: reduce`, reload, and confirm all three cards render immediately without movement or fading.

- [ ] **Step 9: Commit the implementation**

```bash
git add src/components/site/home/homepage-content-contract.test.ts src/components/site/home/ServicesSection.tsx 'src/app/(public)/public-theme.css'
git commit -m "feat: match services card directional reveal"
```
