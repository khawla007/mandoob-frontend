import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

declare global {
  // eslint-disable-next-line no-var
  var __TEST_LOCALE__: 'en' | 'ar';
  // eslint-disable-next-line no-var
  var __TEST_REFRESHES__: number;
}

if (process.env.PRO_CREDENTIAL_CREATE_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/admin/users/pro-id' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    Event: browser.Event,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  test('create draft latches duplicates, reuses ambiguous operation IDs, rotates success, and announces EN and AR', async () => {
    const [{ createElement, act }, { createRoot }, { ProCredentialCreateDraftForm }] =
      await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('./ProCredentialCreateDraftForm'),
      ]);

    for (const [locale, successCopy] of [
      ['en', 'Credential draft created.'],
      ['ar', 'تم إنشاء مسودة بيانات الاعتماد.'],
    ] as const) {
      globalThis.__TEST_LOCALE__ = locale;
      globalThis.__TEST_REFRESHES__ = 0;
      const requests: Array<{ operationId: string; resolve: (response: Response) => void }> = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { operationId: string };
        return new Promise<Response>((resolve) =>
          requests.push({ operationId: body.operationId, resolve }),
        );
      };
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(() =>
        root.render(
          createElement(ProCredentialCreateDraftForm, {
            userId: '22222222-2222-4222-8222-222222222222',
          }),
        ),
      );
      const submit = () => (container.querySelector('button') as HTMLButtonElement).click();

      await act(async () => {
        submit();
        submit();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(requests.length, 1, `${locale} same-tick duplicate ${container.innerHTML}`);
      const firstOperation = requests[0]!.operationId;
      await act(async () => requests[0]!.resolve(new Response(null, { status: 503 })));

      await act(async () => {
        submit();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(requests[1]!.operationId, firstOperation, `${locale} ambiguous retry`);
      await act(async () => requests[1]!.resolve(new Response('{}', { status: 200 })));
      const status = container.querySelector('[role="status"]');
      assert.equal(status?.getAttribute('aria-live'), 'polite');
      assert.equal(status?.textContent, successCopy);
      assert.equal(globalThis.__TEST_REFRESHES__, 1);

      await act(async () => {
        submit();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.notEqual(
        requests[2]!.operationId,
        firstOperation,
        `${locale} confirmed success rotates`,
      );
      await act(async () => requests[2]!.resolve(new Response('{}', { status: 200 })));
      await act(() => root.unmount());
      container.remove();
      globalThis.fetch = originalFetch;
    }
  });
} else {
  test('credential create draft rendered retry and accessibility behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/admin/pro-credential-create-runtime-preload.cjs'),
        join(process.cwd(), 'src/components/admin/pro-credential-create-runtime.test.ts'),
      ],
      {
        env: { ...process.env, PRO_CREDENTIAL_CREATE_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
