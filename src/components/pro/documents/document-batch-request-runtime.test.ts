import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

import React from 'react';
import { Window } from 'happy-dom';
import { installDomGlobals } from '@/lib/testing/dom-globals';

import type { DocType } from '@/lib/validation/document';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;

if (reactServer) {
  test('batch request dialog passes rendered pending-race and locale behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(
          process.cwd(),
          'src/components/pro/documents/document-batch-request-runtime-preload.cjs',
        ),
        '--test-reporter=spec',
        import.meta.filename,
      ],
      { encoding: 'utf8', env: { ...process.env, DOCUMENT_BATCH_RUNTIME_CHILD: '1' } },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
} else if (process.env.DOCUMENT_BATCH_RUNTIME_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/t/acme/documents' });
  installDomGlobals({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    HTMLButtonElement: browser.HTMLButtonElement,
    Event: browser.Event,
    FormData: browser.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  type Result = { ok: false; code: 'CONFLICT'; messageKey: string };
  type RuntimeGlobals = typeof globalThis & {
    __batchRequestAction: (...args: unknown[]) => Promise<Result>;
  };
  const runtimeGlobals = globalThis as RuntimeGlobals;

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      browser.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
    input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
  }

  test('pending submission freezes its payload, hides stale status and formats Arabic item numbers', async () => {
    const [{ act, createElement }, { createRoot }, { DocumentBatchRequestDialog }] =
      await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('./DocumentBatchRequestDialog'),
      ]);
    const docTypes = Object.fromEntries(
      [
        'passport',
        'visa',
        'emirates_id',
        'trade_license',
        'ejari',
        'moa',
        'shareholder_id',
        'other',
        'aoa',
        'bank_reference_letter',
        'noc',
        'cv_resume',
        'office_lease',
        'medical_certificate',
        'insurance_policy',
      ].map((value) => [value, value]),
    ) as Record<DocType, string>;
    const labels = {
      trigger: 'Trigger',
      title: 'Title',
      description: 'Description',
      add: 'Add',
      remove: 'Remove',
      item: 'Item',
      customType: 'Custom',
      submit: 'Submit',
      pending: 'Pending',
      success: 'Success',
      maximum: 'Maximum',
      close: 'Close localized',
      type: 'Type',
      label: 'Label',
      due: 'Due',
      notes: 'Notes',
      docTypes,
      errors: { conflict: 'Conflict', unexpected: 'Unexpected' },
    };
    runtimeGlobals.__batchRequestAction = async () => ({
      ok: false,
      code: 'CONFLICT',
      messageKey: 'conflict',
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(DocumentBatchRequestDialog, {
          slug: 'acme',
          locale: 'en',
          labels,
        }),
      ),
    );
    assert.match(container.querySelector('legend')?.textContent ?? '', /1/u);
    await act(() =>
      root.render(
        createElement(DocumentBatchRequestDialog, {
          slug: 'acme',
          locale: 'ar-u-nu-arab',
          labels,
        }),
      ),
    );
    assert.match(container.querySelector('legend')?.textContent ?? '', /١/u);
    assert.equal(
      container.querySelector('section')?.getAttribute('data-close-label'),
      'Close localized',
    );
    await act(() =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'Add')!
        .click(),
    );
    const label = [...container.querySelectorAll<HTMLInputElement>('input')].find(
      (input) => input.type === 'text',
    )!;
    await act(() => setInputValue(label, 'Original payload'));
    const form = container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(
        new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(container.querySelector('[role=alert]')?.textContent, 'Conflict');

    const next = deferred<Result>();
    runtimeGlobals.__batchRequestAction = async () => next.promise;
    await act(async () => {
      form.dispatchEvent(
        new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(container.querySelector('[role=alert]'), null);
    for (const control of container.querySelectorAll<
      | HTMLFieldSetElement
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | HTMLButtonElement
    >('fieldset, fieldset select, fieldset input, fieldset textarea, button')) {
      if (control.textContent === 'Trigger') continue;
      assert.equal(control.hasAttribute('disabled'), true, control.outerHTML);
    }
    await act(() => setInputValue(label, 'Stale edit'));
    assert.equal(label.value, 'Original payload');
    await act(async () => next.resolve({ ok: false, code: 'CONFLICT', messageKey: 'conflict' }));
    assert.equal(container.querySelector('[role=alert]')?.textContent, 'Conflict');
    await act(() => root.unmount());
    container.remove();
  });
}
