# Public Header Language Selector Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the public header controls and turn the English/Arabic selector into a clearly labeled, accessible dropdown without changing the dashboard presentation.

**Architecture:** Keep locale-changing behavior in the shared `LanguageSwitcher`, adding a `variant="public"` presentation branch with explicit trigger, menu, and option hooks. The public desktop and mobile headers opt into that variant; scoped CSS supplies the 44px sizing and restrained outlined treatment while the dashboard retains the default compact variant.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl, Radix DropdownMenu, Lucide icons, scoped CSS, Node test runner with Happy DOM.

---

## File Map

- Modify `src/components/i18n/LanguageSwitcher.tsx`: add the public variant, persistent public label, chevron, and public menu hooks.
- Modify `src/components/i18n/LanguageSwitcher.test.ts`: prove the public and default variants render different, intentional affordances.
- Modify `src/components/site/SiteHeader.tsx`: opt the desktop public header into the public variant.
- Modify `src/components/site/MobileNav.tsx`: opt the mobile public navigation into the same labeled variant.
- Modify `src/app/(public)/public-theme.css`: standardize public trigger and menu sizing and states.
- Modify `src/components/site/public-navigation.test.ts`: protect public integration and styling.

### Task 1: Preserve the Existing Sign-in Alignment Fix

**Files:**
- Modify: `src/app/(public)/public-theme.css`
- Test: `src/components/site/public-navigation.test.ts`

- [ ] **Step 1: Verify the existing regression test**

Run:

```bash
node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts
```

Expected: 17 tests pass, including `vertically centers the desktop sign-in link with the other header controls`.

- [ ] **Step 2: Inspect and commit only that completed fix**

```bash
git diff -- src/app/'(public)'/public-theme.css src/components/site/public-navigation.test.ts
git add src/app/'(public)'/public-theme.css src/components/site/public-navigation.test.ts
git commit -m "fix(public): align header sign-in control"
```

Expected diff: `.nav__cta > .link-muted` gains `display: inline-flex` and `align-items: center`, plus one regression test. No unrelated lines change.

### Task 2: Add a Tested Public Language-switcher Variant

**Files:**
- Modify: `src/components/i18n/LanguageSwitcher.test.ts`
- Modify: `src/components/i18n/LanguageSwitcher.tsx`

- [ ] **Step 1: Write failing rendering tests**

Add these client-branch tests to `LanguageSwitcher.test.ts`:

```tsx
test('public variant exposes a persistent label, dropdown chevron, and public menu hooks', async () => {
  runtimeGlobals.__locale = 'en';
  runtimeGlobals.__setLocaleAction = async () => ({ ok: true });
  runtimeGlobals.__toastErrors = [];
  const { act, container, root } = await renderSwitcher({ variant: 'public' });

  const trigger = container.querySelector<HTMLButtonElement>(
    '.language-switcher__trigger--public',
  )!;
  const label = trigger.querySelector('span')!;
  assert.equal(label.textContent, 'English');
  assert.doesNotMatch(label.className, /\bhidden\b/u);
  assert.equal(trigger.querySelectorAll('svg').length, 2);
  assert.ok(container.querySelector('.language-switcher__content--public'));
  assert.equal(container.querySelectorAll('.language-switcher__item--public').length, 2);

  await act(() => root.unmount());
  container.remove();
});

test('default variant retains its compact responsive label treatment', async () => {
  runtimeGlobals.__locale = 'en';
  runtimeGlobals.__setLocaleAction = async () => ({ ok: true });
  runtimeGlobals.__toastErrors = [];
  const { act, container, root } = await renderSwitcher();

  const trigger = container.querySelector<HTMLButtonElement>('[aria-busy]')!;
  assert.match(trigger.querySelector('span')?.className ?? '', /\bhidden\b/u);
  assert.equal(trigger.querySelectorAll('svg').length, 1);
  assert.equal(container.querySelector('.language-switcher__content--public'), null);

  await act(() => root.unmount());
  container.remove();
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --import tsx --conditions=react-server --test src/components/i18n/LanguageSwitcher.test.ts
```

Expected: the public test fails because the variant classes, persistent label, chevron, and menu hooks are absent.

- [ ] **Step 3: Implement the minimal component variant**

Change the icon import and props:

```tsx
import { ChevronDown, Languages } from 'lucide-react';

type LanguageSwitcherProps = {
  pathToRevalidate?: string;
  failureMessage?: string;
  pendingLabel?: string;
  className?: string;
  variant?: 'default' | 'public';
};
```

Default `variant = 'default'`, define `const isPublic = variant === 'public'`, then update the trigger:

```tsx
className={cn('gap-2', isPublic && 'language-switcher__trigger--public', className)}
```

```tsx
<Languages className="size-4" aria-hidden />
<span className={cn(!isPublic && 'hidden sm:inline')}>
  {pending ? resolvedPendingLabel : localeLabels[current]}
</span>
{isPublic ? <ChevronDown className="size-3.5" aria-hidden /> : null}
```

Add public hooks to the menu and items:

```tsx
<DropdownMenuContent
  align="end"
  sideOffset={isPublic ? 8 : 4}
  className={cn(isPublic && 'language-switcher__content--public')}
```

```tsx
className={cn('cursor-pointer', isPublic && 'language-switcher__item--public')}
```

- [ ] **Step 4: Run the component test and verify GREEN**

```bash
node --import tsx --conditions=react-server --test src/components/i18n/LanguageSwitcher.test.ts
```

Expected: all language-switcher tests pass.

- [ ] **Step 5: Commit the component variant**

```bash
git add src/components/i18n/LanguageSwitcher.tsx src/components/i18n/LanguageSwitcher.test.ts
git commit -m "feat(i18n): add public language selector variant"
```

### Task 3: Integrate and Style the Public Selector

**Files:**
- Modify: `src/components/site/SiteHeader.tsx`
- Modify: `src/components/site/MobileNav.tsx`
- Modify: `src/app/(public)/public-theme.css`
- Test: `src/components/site/public-navigation.test.ts`

- [ ] **Step 1: Add failing integration assertions**

Add to `public-navigation.test.ts`:

```tsx
assert.match(headerSource, /<LanguageSwitcher[^>]*variant="public"[^>]*failureMessage=/u);
assert.match(
  mobileSource,
  /<LanguageSwitcher[^>]*variant="public"[^>]*className="public-mobile-dialog__language"/u,
);
```

Add this styling contract:

```tsx
it('styles the public language selector as a clear, consistently sized dropdown', () => {
  assert.match(
    cssSource,
    /\.site-public \.language-switcher__trigger--public\s*\{[^}]*min-block-size:\s*44px[^}]*border:\s*1px solid var\(--pb-border\)[^}]*font-size:\s*var\(--fs-14\)/u,
  );
  assert.match(
    cssSource,
    /\.site-public \.language-switcher__trigger--public\[data-state='open'\]\s*\{[^}]*background:\s*var\(--public-surface\)/u,
  );
  assert.match(
    cssSource,
    /\.language-switcher__item--public\s*\{[^}]*min-block-size:\s*44px[^}]*font-size:\s*0\.875rem/u,
  );
});
```

- [ ] **Step 2: Run the navigation test and verify RED**

```bash
node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts
```

Expected: failures report missing public integrations and CSS.

- [ ] **Step 3: Opt both public call sites into the variant**

Use this opening tag in `SiteHeader.tsx`:

```tsx
<LanguageSwitcher
  variant="public"
  failureMessage={tSite('languageChangeFailed')}
  pendingLabel={tSite('languageChanging')}
/>
```

Use this opening tag in `MobileNav.tsx`:

```tsx
<LanguageSwitcher
  variant="public"
  className="public-mobile-dialog__language"
  failureMessage={languageFailureMessage}
  pendingLabel={languagePendingLabel}
/>
```

- [ ] **Step 4: Add the public styles**

Add near `.nav__cta` in `public-theme.css`:

```css
.site-public .language-switcher__trigger--public {
  min-block-size: 44px;
  padding-inline: 12px;
  border: 1px solid var(--pb-border);
  border-radius: var(--r-pill);
  color: var(--zinc-600);
  background: transparent;
  font-size: var(--fs-14);
  font-weight: 500;
  line-height: 1;
}
.site-public .language-switcher__trigger--public:hover,
.site-public .language-switcher__trigger--public[data-state='open'] {
  border-color: var(--zinc-300);
  background: var(--public-surface);
  color: var(--ink);
}
.site-public .language-switcher__trigger--public svg:last-child {
  transition: transform var(--dur) var(--ease);
}
.site-public .language-switcher__trigger--public[data-state='open'] svg:last-child {
  transform: rotate(180deg);
}
.language-switcher__content--public {
  min-inline-size: 160px;
  padding: 4px;
}
.language-switcher__item--public {
  min-block-size: 44px;
  padding-inline: 12px 32px;
  font-size: 0.875rem;
}
.language-switcher__item--public > span {
  right: auto;
  inset-inline-end: 8px;
}
```

Do not add new color tokens, shadows, gradients, or another header bar.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --import tsx --conditions=react-server --test src/components/i18n/LanguageSwitcher.test.ts src/components/site/public-navigation.test.ts src/components/site/MobileNav.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit the integration**

```bash
git add src/components/site/SiteHeader.tsx src/components/site/MobileNav.tsx src/app/'(public)'/public-theme.css src/components/site/public-navigation.test.ts
git commit -m "fix(public): polish header language dropdown"
```

### Task 4: Final Verification

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run static checks**

```bash
npx tsc --noEmit
npx eslint src/components/i18n/LanguageSwitcher.tsx src/components/i18n/LanguageSwitcher.test.ts src/components/site/SiteHeader.tsx src/components/site/MobileNav.tsx src/components/site/public-navigation.test.ts
npx prettier --check src/components/i18n/LanguageSwitcher.tsx src/components/i18n/LanguageSwitcher.test.ts src/components/site/SiteHeader.tsx src/components/site/MobileNav.tsx src/components/site/public-navigation.test.ts src/app/'(public)'/public-theme.css
git diff --check
```

Expected: all commands exit 0; Prettier reports all matched files formatted.

- [ ] **Step 2: Run the complete unit suite**

```bash
npm test
```

Expected: exit code 0 with zero failed tests.

- [ ] **Step 3: Perform visual verification when browser infrastructure is available**

At 1440px, verify the 64px header, 14px labels, vertical centering, labeled language pill, chevron, and expanded/selected states. Repeat at 390px with the mobile dialog, then in Arabic/RTL. If the browser remains blocked by file-watcher or Chromium sandbox limits, report the limitation instead of claiming visual verification.
