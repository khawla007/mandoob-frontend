# Smooth Homepage FAQ Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage FAQ's abrupt native-details toggle with an accessible, single-open accordion that animates smoothly.

**Architecture:** Keep translation loading in the existing server component and pass six plain question/answer objects to a focused client component. The client component owns only the open item index; CSS grid-track and opacity transitions animate content height without measuring it in JavaScript.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Node test runner

---

### Task 1: Define the accordion behavior contract

**Files:**
- Modify: `src/components/site/home/homepage-responsive-contract.test.ts`
- Test: `src/components/site/home/homepage-responsive-contract.test.ts`

- [ ] **Step 1: Write the failing contract test**

Add file reads for `FaqAccordion.tsx` and `KnowledgeFaqSection.tsx`, then add this test:

```ts
it('uses a smooth single-open FAQ accordion', () => {
  assert.match(faqAccordion, /'use client';/u);
  assert.match(faqAccordion, /useState<number \| null>\(null\)/u);
  assert.match(
    faqAccordion,
    /setOpenIndex\(\(current\) => \(current === index \? null : index\)\)/u,
  );
  assert.match(faqAccordion, /aria-expanded=\{isOpen\}/u);
  assert.match(faqAccordion, /aria-controls=\{answerId\}/u);
  assert.match(knowledgeFaq, /<FaqAccordion items=\{faqItems\} \/>/u);
  assert.doesNotMatch(knowledgeFaq, /<details/u);
  assert.match(
    css,
    /\.home-faq__answer\s*\{[\s\S]*?grid-template-rows:\s*0fr;[\s\S]*?transition:/u,
  );
  assert.match(
    css,
    /\.home-faq__item\[data-open\] \.home-faq__answer\s*\{[\s\S]*?grid-template-rows:\s*1fr;/u,
  );
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.home-faq__answer/u);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx --test src/components/site/home/homepage-responsive-contract.test.ts
```

Expected: FAIL because `FaqAccordion.tsx` and the smooth accordion selectors do not exist.

- [ ] **Step 3: Commit the failing contract**

```bash
git add src/components/site/home/homepage-responsive-contract.test.ts
git commit -m "test(public): define smooth FAQ accordion contract"
```

### Task 2: Implement the controlled accordion

**Files:**
- Create: `src/components/site/home/FaqAccordion.tsx`
- Modify: `src/components/site/home/KnowledgeFaqSection.tsx`

- [ ] **Step 1: Create the focused client component**

Create `FaqAccordion.tsx` with this public shape and behavior:

```tsx
'use client';

import { useId, useState } from 'react';

type FaqItem = {
  question: string;
  answer: string;
};

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const accordionId = useId();

  return (
    <div className="home-faq__grid">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `${accordionId}-trigger-${index}`;
        const answerId = `${accordionId}-answer-${index}`;

        return (
          <article className="home-faq__item" data-open={isOpen ? '' : undefined} key={item.question}>
            <h4>
              <button
                id={triggerId}
                className="home-faq__trigger"
                type="button"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => setOpenIndex((current) => (current === index ? null : index))}
              >
                <span>{item.question}</span>
                <span className="home-faq__indicator" aria-hidden="true" />
              </button>
            </h4>
            <div
              id={answerId}
              className="home-faq__answer"
              role="region"
              aria-labelledby={triggerId}
              aria-hidden={!isOpen}
            >
              <div className="home-faq__answer-inner">
                <p>{item.answer}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Pass localized FAQ items from the server component**

In `KnowledgeFaqSection.tsx`, import `FaqAccordion`, build the localized items, and replace the native details grid:

```tsx
const faqItems = [1, 2, 3, 4, 5, 6].map((item) => ({
  question: faq(`q${item}`),
  answer: faq(`a${item}`),
}));

// Inside .home-faq:
<FaqAccordion items={faqItems} />
```

- [ ] **Step 3: Run the contract to confirm implementation is still RED only for CSS**

Run:

```bash
npx tsx --test src/components/site/home/homepage-responsive-contract.test.ts
```

Expected: FAIL on missing `.home-faq__answer` transition selectors, while component assertions pass.

### Task 3: Add smooth motion and preserve the accepted styling

**Files:**
- Modify: `src/app/(public)/public-theme.css`
- Test: `src/components/site/home/homepage-responsive-contract.test.ts`

- [ ] **Step 1: Replace details/summary rules with accordion rules**

Preserve the current border, radius, colors, spacing, and responsive grid. Replace the native element selectors with:

```css
.site-public .home-faq__item {
  overflow: clip;
  border: 1px solid var(--pb-border);
  border-radius: var(--r-sm);
  background: var(--paper);
}

.site-public .home-faq__item h4 {
  margin: 0;
}

.site-public .home-faq__trigger {
  min-block-size: 44px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.site-public .home-faq__indicator {
  position: relative;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: var(--accent-ink);
}

.site-public .home-faq__indicator::before,
.site-public .home-faq__indicator::after {
  content: '';
  position: absolute;
  inset: 50% auto auto 50%;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  transform: translate(-50%, -50%);
  transition: transform 220ms ease, opacity 180ms ease;
}

.site-public .home-faq__indicator::after {
  transform: translate(-50%, -50%) rotate(90deg);
}

.site-public .home-faq__item[data-open] .home-faq__indicator::after {
  opacity: 0;
  transform: translate(-50%, -50%) rotate(0deg);
}

.site-public .home-faq__trigger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.site-public .home-faq__answer {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease;
}

.site-public .home-faq__item[data-open] .home-faq__answer {
  grid-template-rows: 1fr;
  opacity: 1;
}

.site-public .home-faq__answer-inner {
  min-height: 0;
  overflow: hidden;
}

.site-public .home-faq__answer p {
  padding: 0 var(--sp-3) var(--sp-3);
  color: var(--zinc-600);
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .site-public .home-faq__answer,
  .site-public .home-faq__indicator::before,
  .site-public .home-faq__indicator::after {
    transition: none;
  }
}
```

- [ ] **Step 2: Update the pre-existing accessibility assertions**

Change the old `summary` assertions to require `.home-faq__trigger` and `.home-faq__trigger:focus-visible`.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test src/components/site/home/homepage-responsive-contract.test.ts src/components/site/home/homepage-content-contract.test.ts src/components/site/home/homepage-localization.test.ts
```

Expected: 15 or more tests pass with zero failures.

- [ ] **Step 4: Run static verification**

Run:

```bash
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: all commands exit 0; existing unrelated lint warnings may remain.

- [ ] **Step 5: Verify the interaction on port 3001**

Use the homepage FAQ in a browser at desktop and mobile widths. Confirm that opening item 2 after item 1 sets item 1 to `aria-expanded="false"`, item 2 to `aria-expanded="true"`, movement occurs over the configured transition, and page horizontal overflow remains zero. Confirm the same behavior on the Arabic page.

- [ ] **Step 6: Run the production build**

Run:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon_key_for_tests_padded_ \
SUPABASE_SERVICE_ROLE_KEY=service_role_key_for_tests_padded_ \
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3001 \
ENCRYPTION_KEY=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE= \
npm run build
```

Expected: exit 0. The fake Supabase host may produce expected sitemap data warnings.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/components/site/home/FaqAccordion.tsx \
  src/components/site/home/KnowledgeFaqSection.tsx \
  src/components/site/home/homepage-responsive-contract.test.ts \
  'src/app/(public)/public-theme.css'
git commit -m "fix(public): smooth FAQ accordion motion"
```
