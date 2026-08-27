import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import React from 'react';
import { Window } from 'happy-dom';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;

if (reactServer) {
  test('language switcher passes client interaction contracts', () => {
    const preloadPath = join(process.env.TMPDIR ?? '/tmp', 'language-switcher-preload.cjs');
    writeFileSync(
      preloadPath,
      `const Module = require('node:module');
const requireFromProject = Module.createRequire(process.cwd() + '/package.json');
const React = requireFromProject('react');
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'next-intl') return {
    useLocale: () => globalThis.__locale,
    useTranslations: () => (key) => key === 'language' ? 'Language' : key,
  };
  if (request === '@/lib/i18n/actions') return {
    setLocaleAction: (...args) => globalThis.__setLocaleAction(...args),
  };
  if (request === 'sonner') return {
    toast: {error: (message) => globalThis.__toastErrors.push(message)},
  };
  if (request === '@/components/ui/dropdown-menu') return {
    DropdownMenu: ({children}) => React.createElement('div', null, children),
    DropdownMenuTrigger: ({children}) => children,
    DropdownMenuContent: ({children}) => React.createElement('div', null, children),
    DropdownMenuItem: ({children, onSelect, ...props}) =>
      React.createElement('button', {...props, type: 'button', onClick: onSelect}, children),
  };
  if (request === '@/components/ui/button') return {
    Button: ({children, ...props}) => React.createElement('button', props, children),
  };
  return load.call(this, request, parent, isMain);
};`,
    );
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--require', preloadPath, '--test-reporter=spec', import.meta.filename],
      { encoding: 'utf8', env: { ...process.env, LANGUAGE_SWITCHER_CLIENT: '1' } },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
} else if (process.env.LANGUAGE_SWITCHER_CLIENT === '1') {
  const browser = new Window({ url: 'https://app.example.test/' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLButtonElement: browser.HTMLButtonElement,
    Event: browser.Event,
    MouseEvent: browser.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  type RuntimeGlobals = typeof globalThis & {
    __locale: string;
    __setLocaleAction: (locale: string, path: string) => Promise<unknown>;
    __toastErrors: string[];
  };
  const runtimeGlobals = globalThis as RuntimeGlobals;

  function deferred() {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function renderSwitcher(props: Record<string, unknown> = {}) {
    const [{ act, createElement }, { createRoot }, { LanguageSwitcher }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./LanguageSwitcher'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(LanguageSwitcher, props)));
    return { act, container, root };
  }

  test('selecting the current locale is a no-op', async () => {
    runtimeGlobals.__locale = 'en';
    let calls = 0;
    runtimeGlobals.__setLocaleAction = async () => {
      calls += 1;
    };
    runtimeGlobals.__toastErrors = [];
    const { act, container, root } = await renderSwitcher();
    const english = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'English',
    )!;
    await act(() => english.click());
    assert.equal(calls, 0);
    await act(() => root.unmount());
    container.remove();
  });

  test('pending selection is guarded, disabled, busy, and reloads only after success', async () => {
    runtimeGlobals.__locale = 'en';
    const action = deferred();
    const calls: Array<[string, string]> = [];
    runtimeGlobals.__setLocaleAction = async (locale, path) => {
      calls.push([locale, path]);
      return action.promise;
    };
    runtimeGlobals.__toastErrors = [];
    let reloads = 0;
    Object.getPrototypeOf(browser.location).reload = () => {
      reloads += 1;
    };
    const { act, container, root } = await renderSwitcher({
      pathToRevalidate: '/estimate',
      pendingLabel: 'Changing language…',
      className: 'public-language-switcher',
    });
    const arabic = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'العربية',
    )!;
    await act(() => {
      arabic.click();
      arabic.click();
    });
    assert.deepEqual(calls, [['ar', '/estimate']]);
    assert.equal(reloads, 0);
    const trigger = container.querySelector<HTMLButtonElement>('[aria-busy]')!;
    assert.equal(trigger.disabled, true);
    assert.equal(trigger.getAttribute('aria-busy'), 'true');
    assert.match(trigger.className, /public-language-switcher/u);
    assert.match(trigger.textContent ?? '', /Changing language/u);
    for (const item of container.querySelectorAll<HTMLButtonElement>('[data-active]')) {
      assert.equal(item.disabled, true);
    }
    await act(async () => action.resolve({ ok: true, locale: 'ar' }));
    assert.equal(reloads, 1);
    await act(() => root.unmount());
    container.remove();
  });

  test('rejection preserves locale, reports only supplied safe copy, and settles pending state', async () => {
    runtimeGlobals.__locale = 'en';
    const action = deferred();
    runtimeGlobals.__setLocaleAction = async () => action.promise;
    runtimeGlobals.__toastErrors = [];
    let reloads = 0;
    Object.getPrototypeOf(browser.location).reload = () => {
      reloads += 1;
    };
    const { act, container, root } = await renderSwitcher({
      failureMessage: 'Language could not be changed.',
    });
    const arabic = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'العربية',
    )!;
    await act(() => arabic.click());
    await act(async () => action.reject(new Error('private upstream exception')));
    assert.equal(reloads, 0);
    assert.deepEqual(runtimeGlobals.__toastErrors, ['Language could not be changed.']);
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-busy]')?.disabled, false);
    assert.match(container.textContent ?? '', /English/u);
    assert.doesNotMatch(container.textContent ?? '', /private upstream exception/u);
    await act(() => root.unmount());
    container.remove();
  });
}
