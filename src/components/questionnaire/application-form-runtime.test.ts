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
    const [{ act, createElement }, { createRoot }, { QuestionnaireForm, ApplicationErrorSummary }] =
      await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('./QuestionnaireForm'),
      ]);
    const container = document.createElement('div');
    document.body.append(container);
    let root = createRoot(container);
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

    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Save on this device'),
    )!;
    save.focus();
    await act(() => save.click());
    let disclosure = container.querySelector<HTMLElement>('.application-save-disclosure')!;
    assert.match(disclosure.textContent ?? '', /unencrypted/i);
    assert.match(disclosure.textContent ?? '', /not synced or submitted/i);
    assert.equal((document.activeElement as HTMLElement).textContent, 'Cancel');
    await act(() =>
      disclosure.dispatchEvent(
        new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event,
      ),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    assert.equal(document.activeElement, save);
    await act(() => save.click());
    disclosure = container.querySelector<HTMLElement>('.application-save-disclosure')!;
    const confirmSave = [...disclosure.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Confirm seven-day save'),
    )!;
    await act(() => confirmSave.click());
    assert.equal(browser.localStorage.length, 1, 'explicit save works before material edits');

    const conflicting = JSON.parse(browser.localStorage.getItem('mandoob:p109:application-local')!);
    const conflictSavedAt = new Date(Date.parse(conflicting.savedAt) + 1000);
    browser.localStorage.setItem(
      'mandoob:p109:application-local',
      JSON.stringify({
        ...conflicting,
        savedAt: conflictSavedAt.toISOString(),
        expiresAt: new Date(conflictSavedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
    const updateSave = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Update local save'),
    )!;
    await act(() => updateSave.click());
    const conflictDialog = container.querySelector<HTMLElement>('.application-save-disclosure')!;
    const confirmConflict = [...conflictDialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Confirm seven-day save'),
    )!;
    await act(() => confirmConflict.click());
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    assert.match(
      container.querySelector('.application-restore')?.textContent ?? '',
      /Resume saved draft/,
    );
    assert.match(container.textContent ?? '', /Local draft conflict/);

    await act(() => root.unmount());
    const localEnvelope = JSON.parse(
      browser.localStorage.getItem('mandoob:p109:application-local')!,
    );
    const sessionSaved = new Date(Date.parse(localEnvelope.savedAt) + 1000);
    browser.sessionStorage.setItem(
      'mandoob:p109:application-session',
      JSON.stringify({
        ...localEnvelope,
        storage: 'session',
        savedAt: sessionSaved.toISOString(),
        expiresAt: new Date(sessionSaved.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
    container.replaceChildren();
    root = createRoot(container);
    await act(() =>
      root.render(
        createElement(QuestionnaireForm, {
          handoff: { status: 'rejected', reason: 'invalid-estimator-handoff' },
          demoOutcome: 'confirmed-preview',
        }),
      ),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    const restore = container.querySelector<HTMLElement>('.application-restore')!;
    assert.match(restore.textContent ?? '', /Newest session copy/);
    assert.ok(
      [...restore.querySelectorAll('button')].some(
        (button) => button.textContent === 'Resume saved draft',
      ),
    );

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

    const summaryContainer = document.createElement('div');
    document.body.append(summaryContainer);
    const summaryRoot = createRoot(summaryContainer);
    await act(() =>
      summaryRoot.render(
        createElement(ApplicationErrorSummary, {
          errors: [
            {
              stepId: 'review',
              fieldId: 'application-data-consent',
              code: 'required',
              message: 'Consent is required.',
              href: '#application-data-consent',
            },
          ],
          onActivate: () => undefined,
        }),
      ),
    );
    assert.equal(document.activeElement?.id, 'application-error-summary');
    await act(() => summaryRoot.unmount());
  });
}
