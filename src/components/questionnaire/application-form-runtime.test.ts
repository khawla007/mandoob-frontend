import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;

if (reactServer) {
  test('application workspace browser interactions pass', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--test-reporter=spec', import.meta.filename],
      {
        encoding: 'utf8',
        env: { ...process.env, APPLICATION_FORM_CLIENT: '1' },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
} else if (process.env.APPLICATION_FORM_CLIENT === '1') {
  test('gates future stages, avoids initial autosave, and manages reset focus with Escape', async () => {
    const { Window } = await import('happy-dom');
    const browser = new Window({ url: 'https://example.test/apply' });
    Object.assign(globalThis, {
      window: browser,
      document: browser.document,
      navigator: browser.navigator,
      HTMLElement: browser.HTMLElement,
      Element: browser.Element,
      Event: browser.Event,
      KeyboardEvent: browser.KeyboardEvent,
      MouseEvent: browser.MouseEvent,
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    Object.defineProperty(browser, 'scrollTo', { value: () => undefined });
    const [{ act, createElement }, { createRoot }, { QuestionnaireForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./QuestionnaireForm'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(QuestionnaireForm, {
          handoff: { status: 'rejected', reason: 'invalid-estimator-handoff' },
          demoOutcome: 'confirmed-preview',
        }),
      ),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));

    assert.equal(container.querySelectorAll('main').length, 0);
    assert.equal(container.querySelectorAll('h1').length, 1);
    assert.equal(browser.sessionStorage.length, 0, 'hydration must not autosave');
    const stageButtons = [
      ...container.querySelectorAll<HTMLButtonElement>('.application-rail button'),
    ];
    assert.equal(stageButtons.length, 5);
    assert.equal(stageButtons[1].disabled, true, 'future stage is gated');

    const reset = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Reset',
    )!;
    reset.focus();
    await act(() => reset.click());
    const dialog = container.querySelector<HTMLElement>('[role="alertdialog"]')!;
    assert.ok(dialog);
    assert.match((document.activeElement as HTMLElement).textContent ?? '', /Keep draft/);
    await act(() =>
      dialog.dispatchEvent(
        new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event,
      ),
    );
    assert.equal(container.querySelector('[role="alertdialog"]'), null);
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    assert.equal(document.activeElement, reset);
    await act(() => root.unmount());
  });
}
