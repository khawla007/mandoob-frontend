# Public Header Contact Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slim localized contact bar that collapses smoothly on scroll while the existing public navigation remains fixed.

**Architecture:** Keep `SiteHeader` server-rendered and add a narrow client frame whose only responsibility is scroll-state hysteresis. The frame owns the sticky banner; server-rendered top-bar and navigation children preserve translations, session resolution, native links, and no-JavaScript usability.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, Lucide React, scoped CSS, Node test runner

---

## File Structure

- Create `src/components/site/PublicHeaderFrame.tsx`: sticky banner wrapper, scroll listener, requestAnimationFrame scheduling, and pure collapse-state resolver.
- Create `src/components/site/PublicHeaderFrame.test.ts`: threshold and source-level lifecycle tests for the client frame.
- Modify `src/components/site/SiteHeader.tsx`: render localized top-bar content and contact links inside the client frame.
- Modify `src/components/site/public-navigation.test.ts`: assert integration, semantics, contact destinations, and CSS contracts.
- Modify `src/messages/en.json`: add English contact-link accessible labels.
- Modify `src/messages/ar.json`: add matching Arabic accessible labels.
- Modify `src/app/(public)/public-theme.css`: sticky stack, top-bar presentation, collapse animation, responsive behavior, and reduced-motion fallback.

### Task 1: Scroll-Aware Header Frame

**Files:**
- Create: `src/components/site/PublicHeaderFrame.tsx`
- Create: `src/components/site/PublicHeaderFrame.test.ts`

- [ ] **Step 1: Write the failing threshold and behavior tests**

Create `src/components/site/PublicHeaderFrame.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolveHeaderCollapsed } from './PublicHeaderFrame';

const source = readFileSync(new URL('./PublicHeaderFrame.tsx', import.meta.url), 'utf8');

describe('resolveHeaderCollapsed', () => {
  it('collapses only after passing the lower-page threshold', () => {
    assert.equal(resolveHeaderCollapsed(40, false), false);
    assert.equal(resolveHeaderCollapsed(41, false), true);
  });

  it('stays collapsed until the visitor returns near the top', () => {
    assert.equal(resolveHeaderCollapsed(13, true), true);
    assert.equal(resolveHeaderCollapsed(12, true), false);
  });
});

describe('PublicHeaderFrame lifecycle contract', () => {
  it('uses one passive, animation-frame-scheduled scroll listener', () => {
    assert.match(source, /addEventListener\('scroll', handleScroll, \{ passive: true \}\)/u);
    assert.match(source, /requestAnimationFrame\(update\)/u);
    assert.match(source, /cancelAnimationFrame\(frameId\)/u);
    assert.match(source, /removeEventListener\('scroll', handleScroll\)/u);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --import tsx --test src/components/site/PublicHeaderFrame.test.ts
```

Expected: FAIL because `PublicHeaderFrame.tsx` does not exist.

- [ ] **Step 3: Implement the client frame and pure state resolver**

Create `src/components/site/PublicHeaderFrame.tsx`:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';

const COLLAPSE_AT = 40;
const EXPAND_AT = 12;

export function resolveHeaderCollapsed(scrollY: number, currentlyCollapsed: boolean): boolean {
  return currentlyCollapsed ? scrollY > EXPAND_AT : scrollY > COLLAPSE_AT;
}

export function PublicHeaderFrame({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let frameId: number | null = null;

    const update = () => {
      frameId = null;
      setCollapsed((current) => resolveHeaderCollapsed(window.scrollY, current));
    };
    const handleScroll = () => {
      if (frameId === null) frameId = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <header className="public-header-frame" data-collapsed={collapsed} role="banner">
      {children}
    </header>
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --import tsx --test src/components/site/PublicHeaderFrame.test.ts
```

Expected: 3 tests pass and 0 fail.

- [ ] **Step 5: Commit the client behavior**

```bash
git add src/components/site/PublicHeaderFrame.tsx src/components/site/PublicHeaderFrame.test.ts
git commit -m "feat(public): add scroll-aware header frame"
```

### Task 2: Localized Contact Bar Markup

**Files:**
- Modify: `src/components/site/SiteHeader.tsx`
- Modify: `src/components/site/public-navigation.test.ts`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`

- [ ] **Step 1: Add failing integration and locale-parity assertions**

Add tests to `src/components/site/public-navigation.test.ts` that read both message catalogs and assert:

```ts
it('renders the contact bar inside the scroll-aware banner', () => {
  assert.match(headerSource, /<PublicHeaderFrame>/u);
  assert.match(headerSource, /className="public-topbar"/u);
  assert.match(headerSource, /tSite\('footer\.description'\)/u);
  assert.match(headerSource, /href="mailto:hello@mandoob\.ae"/u);
  assert.match(headerSource, /href="tel:\+97145550123"/u);
  assert.match(headerSource, /<bdi>hello@mandoob\.ae<\/bdi>/u);
  assert.match(headerSource, /<bdi>\+971 4 555 0123<\/bdi>/u);
});

it('keeps public contact labels localized in both catalogs', () => {
  for (const messages of [enMessages, arMessages]) {
    assert.equal(typeof messages.site.contactEmailLabel, 'string');
    assert.equal(typeof messages.site.contactPhoneLabel, 'string');
  }
});
```

At the top of the file, import `enMessages` and `arMessages` from the JSON catalogs.

- [ ] **Step 2: Run the public navigation test and verify RED**

Run:

```bash
node --import tsx --test src/components/site/public-navigation.test.ts
```

Expected: FAIL because the frame, top bar, destinations, and message keys are absent from `SiteHeader` and the catalogs.

- [ ] **Step 3: Add matching translation keys**

Add beneath `site.languageChangeFailed` in `src/messages/en.json`:

```json
"contactEmailLabel": "Email Mandoob at {email}",
"contactPhoneLabel": "Call Mandoob at {phone}",
```

Add at the same location in `src/messages/ar.json`:

```json
"contactEmailLabel": "راسل مندوب عبر البريد الإلكتروني {email}",
"contactPhoneLabel": "اتصل بمندوب على الرقم {phone}",
```

- [ ] **Step 4: Render the server-owned top-bar content**

In `src/components/site/SiteHeader.tsx`, import `Mail` and `Phone` from `lucide-react` and import `PublicHeaderFrame`. Replace the outer `.site-public` wrapper with:

```tsx
<PublicHeaderFrame>
  <div className="public-topbar">
    <div className="public-topbar__clip">
      <div className="public-topbar__inner container">
        <p className="public-topbar__tagline">{tSite('footer.description')}</p>
        <address className="public-topbar__contacts">
          <a
            href="mailto:hello@mandoob.ae"
            aria-label={tSite('contactEmailLabel', { email: 'hello@mandoob.ae' })}
          >
            <Mail size={13} strokeWidth={1.8} aria-hidden="true" />
            <bdi>hello@mandoob.ae</bdi>
          </a>
          <span className="public-topbar__separator" aria-hidden="true" />
          <a
            href="tel:+97145550123"
            aria-label={tSite('contactPhoneLabel', { phone: '+971 4 555 0123' })}
          >
            <Phone size={13} strokeWidth={1.8} aria-hidden="true" />
            <bdi>+971 4 555 0123</bdi>
          </a>
        </address>
      </div>
    </div>
  </div>
```

Immediately after this inserted block, change the existing opening tag from:

```tsx
<header className="nav" role="banner" data-route-progress-anchor>
```

to:

```tsx
<div className="nav" data-route-progress-anchor>
```

Change that element's closing `</header>` tag to `</div>`, replace the outer wrapper's closing `</div>` with `</PublicHeaderFrame>`, and leave the complete existing `nav__inner` block unchanged. `PublicHeaderFrame` therefore owns the single banner landmark.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
node --import tsx --test src/components/site/PublicHeaderFrame.test.ts src/components/site/public-navigation.test.ts src/components/site/public-shell-copy.test.ts
```

Expected: all tests pass with matching English and Arabic keys.

- [ ] **Step 6: Commit the localized markup**

```bash
git add src/components/site/SiteHeader.tsx src/components/site/public-navigation.test.ts src/messages/en.json src/messages/ar.json
git commit -m "feat(public): add localized header contact bar"
```

### Task 3: Sticky Stack and Smooth Collapse Styling

**Files:**
- Modify: `src/app/(public)/public-theme.css`
- Modify: `src/components/site/public-navigation.test.ts`

- [ ] **Step 1: Add failing CSS contract tests**

Add these assertions to the public header styling suite in `public-navigation.test.ts`:

```ts
it('keeps the complete banner sticky while smoothly collapsing its contact row', () => {
  assert.match(cssSource, /\.site-public \.public-header-frame\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*z-index:\s*50/u);
  assert.match(cssSource, /\.site-public \.public-topbar\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*1fr[^}]*transition:[^}]*420ms/u);
  assert.match(cssSource, /\.site-public \.public-header-frame\[data-collapsed='true'\] \.public-topbar\s*\{[^}]*grid-template-rows:\s*0fr[^}]*opacity:\s*0/u);
  assert.match(cssSource, /\.site-public \.public-header-frame\[data-collapsed='true'\] \.public-topbar__inner\s*\{[^}]*transform:\s*translateY\(-100%\)/u);
});

it('adapts the contact bar for mobile and reduced motion', () => {
  assert.match(cssSource, /@media\s*\(max-width:\s*767px\)[^]*\.site-public \.public-topbar__tagline\s*\{[^}]*display:\s*none/u);
  assert.match(cssSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*\.site-public \.public-topbar[^]*transition:\s*none/u);
});
```

- [ ] **Step 2: Run the public navigation test and verify RED**

Run:

```bash
node --import tsx --test src/components/site/public-navigation.test.ts
```

Expected: FAIL on the new sticky, collapse, mobile, and reduced-motion assertions.

- [ ] **Step 3: Implement the sticky frame and top-bar styling**

In the NAV section of `src/app/(public)/public-theme.css`, move sticky positioning from `.nav` to the frame and add:

```css
.site-public .public-header-frame {
  position: sticky;
  top: 0;
  z-index: 50;
}
.site-public .public-topbar {
  display: grid;
  grid-template-rows: 1fr;
  overflow: clip;
  color: #d4d4d8;
  background: #11100f;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  opacity: 1;
  transition:
    grid-template-rows 420ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 300ms ease-out;
}
.site-public .public-topbar__clip {
  min-height: 0;
  overflow: hidden;
}
.site-public .public-topbar__inner {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  transform: translateY(0);
  transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
.site-public .public-topbar__tagline {
  margin: 0;
  font-size: var(--fs-12);
  line-height: 1;
  color: #a1a1aa;
}
.site-public .public-topbar__contacts {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-style: normal;
}
.site-public .public-topbar__contacts a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-block-size: 28px;
  color: #d4d4d8;
  font-size: var(--fs-12);
  line-height: 1;
  transition: color var(--dur) var(--ease);
}
.site-public .public-topbar__contacts a:hover {
  color: #ffffff;
}
.site-public .public-topbar__separator {
  inline-size: 1px;
  block-size: 12px;
  background: rgb(255 255 255 / 18%);
}
.site-public .public-header-frame[data-collapsed='true'] .public-topbar {
  grid-template-rows: 0fr;
  opacity: 0;
}
.site-public .public-header-frame[data-collapsed='true'] .public-topbar__inner {
  transform: translateY(-100%);
}
```

Keep `.nav` responsible for its background, blur, and lower border, but remove its `position`, `top`, and `z-index` declarations.

- [ ] **Step 4: Add responsive and reduced-motion rules**

Add:

```css
@media (max-width: 767px) {
  .site-public .public-topbar__inner {
    justify-content: center;
    gap: 0;
  }
  .site-public .public-topbar__tagline {
    display: none;
  }
  .site-public .public-topbar__contacts {
    gap: 10px;
  }
  .site-public .public-topbar__contacts a {
    font-size: 0.6875rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .site-public .public-topbar,
  .site-public .public-topbar__inner {
    transition: none;
  }
}
```

- [ ] **Step 5: Run focused tests and formatting**

Run:

```bash
node --import tsx --test src/components/site/PublicHeaderFrame.test.ts src/components/site/public-navigation.test.ts src/components/site/public-shell-copy.test.ts
npx prettier --check src/components/site/PublicHeaderFrame.tsx src/components/site/PublicHeaderFrame.test.ts src/components/site/SiteHeader.tsx src/components/site/public-navigation.test.ts src/messages/en.json src/messages/ar.json 'src/app/(public)/public-theme.css'
```

Expected: all tests pass; Prettier reports all matched files formatted.

- [ ] **Step 6: Commit the presentation layer**

```bash
git add 'src/app/(public)/public-theme.css' src/components/site/public-navigation.test.ts
git commit -m "style(public): animate sticky contact header"
```

### Task 4: Full Verification and Live Review

**Files:**
- Verify only; modify touched files only if a check reveals a defect.

- [ ] **Step 1: Run tests and static checks**

```bash
node --import tsx --test src/components/site/PublicHeaderFrame.test.ts src/components/site/public-navigation.test.ts src/components/site/public-shell-copy.test.ts
npx tsc --noEmit
npx eslint src/components/site/PublicHeaderFrame.tsx src/components/site/PublicHeaderFrame.test.ts src/components/site/SiteHeader.tsx src/components/site/public-navigation.test.ts
npx prettier --check src/components/site/PublicHeaderFrame.tsx src/components/site/PublicHeaderFrame.test.ts src/components/site/SiteHeader.tsx src/components/site/public-navigation.test.ts src/messages/en.json src/messages/ar.json 'src/app/(public)/public-theme.css'
git diff --check
```

Expected: zero test failures, zero TypeScript errors, zero ESLint errors, formatting success, and no whitespace errors.

- [ ] **Step 2: Review the live desktop header**

At `http://localhost:3001`, use a 1440×900 viewport and verify:

- The tagline is at inline-start and email/phone are at inline-end.
- The main navigation begins below the 32px bar.
- Scrolling beyond 40px smoothly removes the top row while navigation remains pinned.
- Returning within 12px of the top restores it without jitter.
- Links remain keyboard-focusable and the language menu still opens.

- [ ] **Step 3: Review mobile, RTL, themes, and reduced motion**

At 390×844, verify the tagline is hidden, both contact links fit without horizontal overflow, and the mobile menu still opens. Repeat in Arabic to confirm logical alignment and LTR-isolated contact strings. Check light and dark themes. Emulate reduced motion and confirm the collapse occurs without animation.

- [ ] **Step 4: Record final repository state**

```bash
git status --short
git log -4 --oneline
```

Expected: only the pre-existing untracked `.superpowers/` directory remains; all feature files are committed on `main`.
