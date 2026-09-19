import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

if (process.env.CUSTOMER_UPLOAD_DIALOG_RUNTIME_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/t/alpha/portal/documents' });
  const operationIds = [
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000007',
  ];
  let operationIndex = 0;
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    Event: browser.Event,
    MouseEvent: browser.MouseEvent,
    File: browser.File,
    FormData: browser.FormData,
    Headers: browser.Headers,
    IS_REACT_ACT_ENVIRONMENT: true,
    __refreshes: 0,
  });
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => operationIds[operationIndex++],
  });
  document.cookie = 'mandoob-csrf=csrf-token; path=/';

  test('failed upload retains the selected file and operation ID until replacement, close, or success', async () => {
    operationIndex = 0;
    (globalThis as typeof globalThis & { __refreshes: number }).__refreshes = 0;
    const [{ createElement, act }, { createRoot }, { UploadDocumentDialog }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./UploadDocumentDialog'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(UploadDocumentDialog, {
          slug: 'alpha',
          docType: 'passport',
          requestId: '40000000-0000-4000-8000-000000000004',
          label: 'Passport',
        }),
      ),
    );

    const open = () => act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    const select = (file: File) => {
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      const transfer = new browser.DataTransfer();
      (transfer.items.add as (value: unknown) => void)(file);
      input.files = transfer.files as unknown as FileList;
      input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
      return input;
    };
    const submit = async () => {
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(
            new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
          );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    const attempts: Array<{ operationId: string; file: File }> = [];
    const responses = [500, 500, 200, 500, 200];
    globalThis.fetch = async (_input, init) => {
      const form = init?.body as FormData;
      attempts.push({
        operationId: String(form.get('operation_id')),
        file: form.get('file') as File,
      });
      const status = responses.shift()!;
      return Response.json(
        status === 200
          ? {
              ok: true,
              data: {
                documentId: '50000000-0000-4000-8000-000000000005',
                versionId: '60000000-0000-4000-8000-000000000006',
              },
            }
          : { error: 'Unable to upload document', code: 'UPLOAD_FAILED' },
        { status },
      );
    };

    await open();
    const firstFile = new browser.File(['%PDF-1.4 first'], 'first.pdf', {
      type: 'application/pdf',
    }) as unknown as File;
    const input = select(firstFile);
    await submit();
    assert.equal(input.files?.[0]?.name, 'first.pdf');
    await submit();
    assert.equal(attempts[0]?.operationId, operationIds[0]);
    assert.equal(attempts[1]?.operationId, operationIds[0]);
    assert.equal(attempts[1]?.file.name, 'first.pdf');

    const replacement = new browser.File(['%PDF-1.4 replacement'], 'replacement.pdf', {
      type: 'application/pdf',
    }) as unknown as File;
    select(replacement);
    await submit();
    assert.equal(attempts[2]?.operationId, operationIds[1]);
    assert.equal(attempts[2]?.file.name, 'replacement.pdf');
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal((globalThis as typeof globalThis & { __refreshes: number }).__refreshes, 1);

    await open();
    select(firstFile);
    await submit();
    const cancel = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'cancel',
    )!;
    await act(() => cancel.click());
    await open();
    select(firstFile);
    await submit();
    assert.equal(attempts[3]?.operationId, operationIds[2]);
    assert.equal(attempts[4]?.operationId, operationIds[3]);

    await act(() => root.unmount());
    container.remove();
  });

  test('pending upload blocks every dialog dismissal until the same attempt settles', async () => {
    operationIndex = 0;
    (globalThis as typeof globalThis & { __refreshes: number }).__refreshes = 0;
    const [{ createElement, act }, { createRoot }, { UploadDocumentDialog }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./UploadDocumentDialog'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(UploadDocumentDialog, {
          slug: 'alpha',
          docType: 'passport',
          label: 'Passport',
        }),
      ),
    );
    await act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const transfer = new browser.DataTransfer();
    transfer.items.add(
      new browser.File(['%PDF-1.4 pending'], 'pending.pdf', { type: 'application/pdf' }),
    );
    input.files = transfer.files as unknown as FileList;
    input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);

    let settle!: (response: Response) => void;
    const attempts: string[] = [];
    globalThis.fetch = async (_input, init) => {
      attempts.push(String((init?.body as FormData).get('operation_id')));
      return new Promise<Response>((resolve) => {
        settle = resolve;
      });
    };
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(
          new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
        );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="dialog-close"]')!.click(),
    );
    assert.equal(container.querySelector('[role="dialog"]'), dialog);
    assert.equal(container.querySelector('input[type="file"]'), input);
    assert.equal(input.files?.[0]?.name, 'pending.pdf');
    await act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    assert.equal(container.querySelector('[role="dialog"]'), dialog);
    assert.deepEqual(attempts, [operationIds[0]]);

    await act(async () => {
      settle(
        Response.json({
          ok: true,
          data: {
            documentId: '50000000-0000-4000-8000-000000000005',
            versionId: '60000000-0000-4000-8000-000000000006',
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal((globalThis as typeof globalThis & { __refreshes: number }).__refreshes, 1);
    assert.deepEqual(attempts, [operationIds[0]]);

    await act(() => root.unmount());
    container.remove();
  });
} else {
  test('Customer upload dialog preserves exact retry state at runtime', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/customer/UploadDocumentDialog.runtime-preload.cjs'),
        join(process.cwd(), 'src/components/customer/UploadDocumentDialog.runtime.test.ts'),
      ],
      {
        env: { ...process.env, CUSTOMER_UPLOAD_DIALOG_RUNTIME_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
