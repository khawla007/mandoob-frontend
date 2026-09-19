# Home Services Heading Blur Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce SteelNova's one-time, character-by-character blur reveal on the “Choose the Right UAE Business Setup” heading without changing the service section's card, eyebrow, paragraph, spacing, or layout treatment.

**Architecture:** Keep the translated heading server-rendered and use the existing `EntranceReveal` observer to add `is-in` once the heading group enters the viewport. Render each word as an unbreakable inline wrapper and each visible character as an indexed span; scoped CSS applies the 10px-to-0 blur, opacity fade, 1-second duration, and 25ms stagger. Preserve no-JavaScript and reduced-motion visibility with explicit fallbacks.

**Tech Stack:** Next.js 16 server components, React 19, TypeScript, CSS keyframes, existing `IntersectionObserver` reveal controller, Node source-contract tests.

---

## File map

- Modify `src/components/site/home/homepage-content-contract.test.ts`: define the failing contract for markup, animation values, fallbacks, and unchanged cards.
- Modify `src/components/site/home/ServicesSection.tsx`: render accessible, character-indexed heading markup and keep all service cards on their established classes.
- Modify `src/app/(public)/public-theme.css`: add heading-scoped blur reveal and reduced-motion rules.
- Modify `src/app/(public)/layout.tsx`: extend the existing no-JavaScript override so character spans cannot remain blurred or hidden.

### Task 1: Lock the reference behavior with a failing contract test

**Files:**
- Modify: `src/components/site/home/homepage-content-contract.test.ts`

- [ ] **Step 1: Add the failing heading-animation contract**

Add this test beside the existing homepage style contracts:

```ts
it('gives only the services heading the SteelNova character blur reveal', () => {
  const services =
    componentSources.find(({ file }) => file === 'ServicesSection.tsx')?.source ?? '';
  const publicLayout = readFileSync(join(process.cwd(), 'src/app/(public)/layout.tsx'), 'utf8');

  assert.match(services, /aria-label=\{titleText\}/u);
  assert.match(services, /className="home-services-title__visual" aria-hidden="true"/u);
  assert.match(services, /className="home-services-title__word"/u);
  assert.match(services, /className="home-services-title__char"/u);
  assert.match(services, /Array\.from\(word\)/u);
  assert.match(services, /--home-services-char-index/u);

  assert.match(publicTheme, /@keyframes home-services-title-blur-reveal/u);
  assert.match(
    publicTheme,
    /\.home-services-title__char\s*\{[^}]*opacity:\s*0[^}]*filter:\s*blur\(10px\)/su,
  );
  assert.match(
    publicTheme,
    /\.home-services-title--blur-reveal\.is-in[\s\S]*?animation:[^;]*home-services-title-blur-reveal[^;]*1s[^;]*cubic-bezier\(0\.25,\s*0\.46,\s*0\.45,\s*0\.94\)[^;]*both/u,
  );
  assert.match(
    publicTheme,
    /animation-delay:\s*calc\(var\(--home-services-char-index\) \* 25ms\)/u,
  );
  assert.match(
    publicTheme,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.home-services-title__char[\s\S]*?animation:\s*none/u,
  );
  assert.match(publicLayout, /\.home-services-title__char\{opacity:1!important;filter:none!important/u);

  assert.match(services, /home-setup-grid cards-stagger/u);
  assert.doesNotMatch(services, /card-left|card-center|card-right/u);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/components/site/home/homepage-content-contract.test.ts
```

Expected: the new test fails first on the missing `aria-label={titleText}` or `home-services-title__visual` contract.

- [ ] **Step 3: Confirm the test file itself remains valid**

Run:

```bash
npx prettier --check src/components/site/home/homepage-content-contract.test.ts
```

Expected: PASS after formatting the new test with `npx prettier --write src/components/site/home/homepage-content-contract.test.ts` if needed.

### Task 2: Implement the accessible character reveal and restore unrelated section behavior

**Files:**
- Modify: `src/components/site/home/ServicesSection.tsx`
- Modify: `src/app/(public)/public-theme.css`
- Modify: `src/app/(public)/layout.tsx`
- Test: `src/components/site/home/homepage-content-contract.test.ts`

- [ ] **Step 1: Replace the current heading attempt with indexed character markup**

In `ServicesSection.tsx`, add the React type import and prepare the translated title:

```tsx
import type { CSSProperties } from 'react';

const titleText = t('title');
const titleWords = titleText.trim().split(/\s+/u);
let characterIndex = 0;
```

Render the section header as a reveal group. Keep the existing eyebrow and paragraph classes and spacing; give them only the existing `reveal` behavior. Render the heading as follows:

```tsx
<header className="home-centered-head" data-reveal-cards>
  <span className="eyebrow eyebrow--accent reveal">{t('eyebrow')}</span>
  <h2
    id="services-h"
    className="home-section-title home-services-title--blur-reveal reveal"
    aria-label={titleText}
  >
    <span className="home-services-title__visual" aria-hidden="true">
      {titleWords.map((word, wordIndex) => (
        <span className="home-services-title__word" key={`${word}-${wordIndex}`}>
          {Array.from(word).map((character, index) => {
            const currentCharacterIndex = characterIndex++;

            return (
              <span
                className="home-services-title__char"
                key={`${character}-${index}`}
                style={
                  {
                    '--home-services-char-index': currentCharacterIndex,
                  } as CSSProperties
                }
              >
                {character}
              </span>
            );
          })}
          {wordIndex < titleWords.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  </h2>
  <p className="reveal">{t('lede')}</p>
</header>
```

Restore the service-card wrapper and article classes exactly to:

```tsx
<div className="home-setup-grid cards-stagger" data-reveal-cards>
  {PATHS.map(({ key, href, cta, Icon }, index) => (
    <article className={`home-setup-card home-setup-card--${index + 1} reveal`} key={key}>
      <span className="home-icon-medallion">
        <Icon aria-hidden="true" />
      </span>
      <div>
        <h3>{t(`${key}Title`)}</h3>
        <p>{t(`${key}Summary`)}</p>
        <ul role="list">
          <li>{t(`${key}Ideal`)}</li>
          <li>{t(`${key}Market`)}</li>
          <li>{t(`${key}Office`)}</li>
        </ul>
        <Link className="home-text-link" href={href}>
          {t(cta)} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  ))}
</div>
```

Delete the component-local `<style>` block and all `steelnova-word`, `card-left`, `card-center`, and `card-right` code. Do not change the translated copy or service-card contents.

- [ ] **Step 2: Add the scoped reference animation to the public stylesheet**

Add this block near the existing homepage title styles in `public-theme.css`:

```css
@keyframes home-services-title-blur-reveal {
  from {
    opacity: 0;
    filter: blur(10px);
  }
  to {
    opacity: 1;
    filter: blur(0);
  }
}

.site-public.reveal-on .home-services-title--blur-reveal.reveal {
  opacity: 1;
  transform: none;
  transition: none;
  will-change: auto;
}

.site-public .home-services-title__word,
.site-public .home-services-title__char {
  display: inline-block;
}

.site-public.reveal-on .home-services-title__char {
  opacity: 0;
  filter: blur(10px);
}

.site-public.reveal-on .home-services-title--blur-reveal.is-in .home-services-title__char {
  animation: home-services-title-blur-reveal 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  animation-delay: calc(var(--home-services-char-index) * 25ms);
}

.site-public.reveal-on .home-setup-section .home-centered-head > p.reveal {
  transition-delay: 0ms !important;
}
```

The last rule counteracts the observer's group index delay for the paragraph so the eyebrow and paragraph keep the section header's original simultaneous generic reveal; the heading alone uses the new animation.

Inside the existing final `@media (prefers-reduced-motion: reduce)` reveal block, add:

```css
.site-public.reveal-on .home-services-title__char,
.site-public.reveal-on .home-services-title--blur-reveal.is-in .home-services-title__char {
  opacity: 1;
  filter: none;
  animation: none;
}
```

- [ ] **Step 3: Extend the no-JavaScript visibility override**

In the existing `<noscript>` style in `src/app/(public)/layout.tsx`, append the services-character fallback:

```tsx
<style>{`.site-public .reveal,.site-public .rise__i{opacity:1!important;transform:none!important;}.site-public .home-services-title__char{opacity:1!important;filter:none!important;animation:none!important;}`}</style>
```

- [ ] **Step 4: Run the focused contract and verify GREEN**

Run:

```bash
npx tsx --test src/components/site/home/homepage-content-contract.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Run static verification for the touched implementation**

Run:

```bash
npx prettier --check src/components/site/home/ServicesSection.tsx src/components/site/home/homepage-content-contract.test.ts 'src/app/(public)/public-theme.css' 'src/app/(public)/layout.tsx'
npx tsc --noEmit
npm run lint -- src/components/site/home/ServicesSection.tsx src/components/site/home/homepage-content-contract.test.ts 'src/app/(public)/layout.tsx'
git diff --check
```

Expected: every command exits 0. Existing unrelated warnings may be reported, but no new warning or error may reference a touched file.

- [ ] **Step 6: Commit only the heading implementation**

```bash
git add src/components/site/home/ServicesSection.tsx src/components/site/home/homepage-content-contract.test.ts 'src/app/(public)/public-theme.css' 'src/app/(public)/layout.tsx'
git commit -m "feat(home): match services heading blur reveal"
```

Before committing, verify `git diff --cached --name-only` lists exactly those four files. Do not stage the existing auth or company-profile changes.

### Task 3: Verify motion and isolation in the browser

**Files:**
- Verify: `src/components/site/home/ServicesSection.tsx`
- Verify: `src/app/(public)/public-theme.css`

- [ ] **Step 1: Start the local application**

Run:

```bash
npm run dev
```

Expected: Next.js serves the public homepage at `http://localhost:3001`.

- [ ] **Step 2: Inspect the normal-motion entrance**

Open `http://localhost:3001`, keep the second section below the initial viewport, then scroll until the heading crosses the reveal threshold.

Expected:

- characters reveal once from blurred/transparent to sharp/opaque in reading order;
- each character takes 1 second and starts 25ms after the previous visible character;
- the heading has no vertical slide;
- words wrap as units and the title keeps its existing typography and alignment;
- eyebrow, paragraph, and all three cards retain their existing entrance direction and spacing.

- [ ] **Step 3: Inspect reduced motion and responsive wrapping**

Repeat at desktop and mobile widths with `prefers-reduced-motion: reduce` enabled.

Expected: the complete title is immediately visible with no blur or animation, no horizontal overflow appears, and the words wrap cleanly.

- [ ] **Step 4: Run the broader homepage regression suite**

Run:

```bash
npm test -- src/components/site/home/homepage-content-contract.test.ts src/components/site/home/homepage-responsive-contract.test.ts 'src/app/(public)/page.test.ts'
```

Expected: the homepage contract tests pass. If this repository's test wrapper expands to the full source suite, record the full-suite totals and ensure there are zero failures.

- [ ] **Step 5: Record final repository state**

Run:

```bash
git status --short
git log -2 --oneline
```

Expected: the design-spec commit and implementation commit are present; only the user's pre-existing unrelated auth and company-profile changes remain uncommitted.
