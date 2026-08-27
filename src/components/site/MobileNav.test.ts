import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import React from 'react';
import { Window } from 'happy-dom';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const source = readFileSync(new URL('./MobileNav.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/(public)/public-theme.css', import.meta.url), 'utf8');

test('mobile navigation composes the repository accessibility primitives', () => {
  assert.match(source, /from '@\/components\/ui\/dialog'/u);
  for (const primitive of ['Dialog', 'DialogTrigger', 'DialogContent', 'DialogTitle']) {
    assert.match(source, new RegExp(`\\b${primitive}\\b`, 'u'));
  }
  assert.match(source, /<PublicNavLinks/u);
  assert.match(source, /<PublicThemeToggle/u);
  assert.match(source, /<LanguageSwitcher/u);
  assert.match(source, /closeLabel=/u);
  assert.match(source, /aria-label=\{open \?/u);
});

test('mobile navigation is controlled and closes for selection or pathname changes', () => {
  assert.match(source, /<Dialog\s+open=\{open\}\s+onOpenChange=\{setOpen\}/u);
  assert.match(source, /onNavigate=\{closeMenu\}/u);
  assert.match(source, /usePathname\(\)/u);
  assert.match(source, /useEffect\([^]*setOpen\(false\)[^]*\[pathname\]/u);
});

test('desktop breakpoint listener closes and cleans up through the modern matchMedia API', () => {
  assert.match(source, /matchMedia\('\(min-width: 1024px\)'\)/u);
  assert.match(source, /addEventListener\('change',\s*handleBreakpointChange\)/u);
  assert.match(source, /removeEventListener\('change',\s*handleBreakpointChange\)/u);
  assert.match(source, /handleBreakpointChange[^]*event\.matches[^]*setOpen\(false\)/u);
});

test('the portalled dialog has a full-screen, dark, logical, responsive contract', () => {
  assert.match(css, /\.site-public\.public-mobile-dialog\s*\{/u);
  assert.match(
    css,
    /\.site-public\.public-mobile-dialog\s*\{[^}]*background:\s*var\(--public-mobile-dialog-surface\)/u,
  );
  assert.match(
    css,
    /\.site-public\.public-mobile-dialog\s*\{[^}]*inset-block:\s*0[^}]*inset-inline:\s*0/u,
  );
  assert.match(css, /\.site-public\.public-mobile-dialog\s*\{[^}]*max-inline-size:\s*none/u);
  assert.match(css, /\.site-public\.public-mobile-dialog\s*\{[^}]*overflow-x:\s*hidden/u);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*public-mobile-dialog/u);
  assert.match(
    css,
    /@media\s*\(min-width:\s*1024px\)[^]*\.site-public \.nav__menu\s*\{[^}]*display:\s*none/u,
  );
  assert.match(
    css,
    /\.site-public\.public-mobile-dialog \[data-slot='dialog-close'\]\s*\{[^}]*inset-inline-start:\s*auto[^}]*env\(safe-area-inset-right,\s*0px\)/u,
  );
  assert.match(
    css,
    /\.site-public\.public-mobile-dialog:dir\(rtl\) \[data-slot='dialog-close'\]\s*\{[^}]*env\(safe-area-inset-left,\s*0px\)/u,
  );
});

if (reactServer) {
  test('mobile navigation client behavior passes', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'mobile-nav-'));
    const preloadPath = join(tempDirectory, 'preload.cjs');
    try {
      writeFileSync(
        preloadPath,
        `const Module = require('node:module');
const requireFromProject = Module.createRequire(process.cwd() + '/package.json');
const React = requireFromProject('react');
const DialogContext = React.createContext(undefined);
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'next-intl') return {
    useTranslations: () => (key) => ({openMenu:'Open menu',closeMenu:'Close menu',menuTitle:'Navigation menu',mobileNav:'Mobile navigation',openWorkspace:'Open workspace'}[key] || key),
  };
  if (request === 'next/navigation') return {usePathname: () => globalThis.__pathname};
  if (request === 'next/link') return {__esModule:true, default: ({children, href, ...props}) => React.createElement('a', {...props, href}, children)};
  if (request === '@/components/ui/dialog') return {
    Dialog: ({children, open, onOpenChange}) => React.createElement(DialogContext.Provider, {value:{open,onOpenChange}}, children),
    DialogTrigger: ({children}) => {
      const state = React.useContext(DialogContext);
      return React.cloneElement(children, {onClick: () => state.onOpenChange(true)});
    },
    DialogContent: ({children, closeLabel}) => {
      const state = React.useContext(DialogContext);
      return state.open ? React.createElement('section', {role:'dialog'}, children,
        React.createElement('button', {type:'button', 'aria-label':closeLabel, onClick:() => state.onOpenChange(false)})) : null;
    },
    DialogTitle: ({children}) => React.createElement('h2', null, children),
  };
  if (request === './PublicNavLinks') return {
    PublicNavLinks: ({links, onNavigate}) => {
      globalThis.__renderedLinkIds = links.map((link) => link.id);
      return React.createElement('nav', null, links.map((link) => React.createElement('button', {key:link.id, type:'button', onClick:onNavigate}, link.label)));
    },
  };
  if (request === './PublicThemeToggle') return {PublicThemeToggle: () => React.createElement('button', {type:'button'}, 'Theme')};
  if (request === '@/components/i18n/LanguageSwitcher') return {LanguageSwitcher: () => React.createElement('button', {type:'button'}, 'Language')};
  return load.call(this, request, parent, isMain);
};`,
      );
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--require', preloadPath, '--test-reporter=spec', import.meta.filename],
        { encoding: 'utf8', env: { ...process.env, MOBILE_NAV_CLIENT: '1' } },
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
} else if (process.env.MOBILE_NAV_CLIENT === '1') {
  const browser = new Window({ url: 'https://app.example.test/' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    Event: browser.Event,
    MouseEvent: browser.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
    __pathname: '/',
  });
  const breakpointListeners = new Set<(event: MediaQueryListEvent) => void>();
  let breakpointListenerAdds = 0;
  let breakpointListenerRemoves = 0;
  Object.defineProperty(browser, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          breakpointListenerAdds += 1;
          breakpointListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          breakpointListenerRemoves += 1;
          breakpointListeners.delete(listener);
        },
      }) as unknown as MediaQueryList,
  });

  test('trigger, immediate selection, pathname closure, and account actions work at runtime', async () => {
    const [{ act, createElement }, { createRoot }, { MobileNav }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./MobileNav'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const props = {
      links: Array.from({ length: 7 }, (_, index) => ({
        href: `/legacy-${index}`,
        label: `Legacy ${index}`,
      })),
      authed: true as const,
      signInLabel: 'Sign in',
      ctaLabel: 'Get Estimate',
      accountHref: '/workspace',
      accountLabel: 'Open workspace',
    };
    await act(() => root.render(createElement(MobileNav, props)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    assert.equal(breakpointListenerAdds, 1);
    const trigger = container.querySelector<HTMLButtonElement>('.nav__menu')!;
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(trigger.getAttribute('aria-label'), 'Open menu');

    await act(() => trigger.click());
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.ok(container.querySelector('[role="dialog"]'));
    assert.match(container.textContent ?? '', /Theme/u);
    assert.match(container.textContent ?? '', /Language/u);
    assert.equal(container.querySelector('a[href="/workspace"]')?.textContent, 'Open workspace');
    assert.equal(container.querySelector('a[href="/estimate"]')?.textContent, 'Get Estimate');
    const renderedLinkIds = (globalThis as typeof globalThis & { __renderedLinkIds: string[] })
      .__renderedLinkIds;
    assert.equal(new Set(renderedLinkIds).size, 7, 'legacy link IDs must remain unique');

    await act(() => container.querySelector<HTMLButtonElement>('nav button')!.click());
    assert.equal(container.querySelector('[role="dialog"]'), null);

    await act(() => trigger.click());
    await act(() => {
      for (const listener of breakpointListeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
    });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    await act(() => root.render(createElement(MobileNav, props)));
    assert.equal(breakpointListenerAdds, 1, 'rerenders must not add breakpoint listeners');

    await act(() => trigger.click());
    (globalThis as typeof globalThis & { __pathname: string }).__pathname = '/pricing';
    await act(() => root.render(createElement(MobileNav, props)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    assert.equal(container.querySelector('[role="dialog"]'), null);

    await act(() => root.unmount());
    assert.equal(breakpointListenerRemoves, 1);
    assert.equal(breakpointListeners.size, 0);
    container.remove();

    const remountContainer = document.createElement('div');
    document.body.append(remountContainer);
    const remountRoot = createRoot(remountContainer);
    await act(() => remountRoot.render(createElement(MobileNav, props)));
    assert.equal(breakpointListenerAdds, 2);
    assert.equal(breakpointListeners.size, 1, 'a remount must keep exactly one active listener');
    await act(() => remountRoot.unmount());
    assert.equal(breakpointListenerRemoves, 2);
    assert.equal(breakpointListeners.size, 0);
    remountContainer.remove();
  });
}
