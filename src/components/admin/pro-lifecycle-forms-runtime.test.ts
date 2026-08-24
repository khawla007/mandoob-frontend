import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

if (process.env.PRO_LIFECYCLE_FORMS_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/admin/users/pro-id' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    Event: browser.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  test('review and term forms set aria-busy while their requests are pending', async () => {
    const [
      { createElement, act },
      { createRoot },
      { ProCredentialReviewForm },
      { ProCommercialTermForm },
    ] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./ProCredentialReviewForm'),
      import('./ProCommercialTermForm'),
    ]);
    const components = [
      createElement(ProCredentialReviewForm, {
        userId: '22222222-2222-4222-8222-222222222222',
        credentialId: '33333333-3333-4333-8333-333333333333',
        state: 'submitted',
        version: 1,
      }),
      createElement(ProCommercialTermForm, {
        userId: '22222222-2222-4222-8222-222222222222',
        termKind: 'pricing',
        term: {
          termId: '33333333-3333-4333-8333-333333333333',
          termKind: 'pricing',
          model: 'per_registration',
          currency: 'AED',
          amountMinor: 10000,
          retainerInterval: null,
          scope: 'all_registrations',
          effectiveFrom: '2026-08-01',
          effectiveTo: null,
          status: 'draft',
          version: 1,
        },
      }),
    ];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    for (const component of components) {
      const container = document.createElement('div');
      const root = createRoot(container);
      await act(() => root.render(component));
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(
            new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
          );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(container.querySelector('form')!.getAttribute('aria-busy'), 'true');
      await act(() => root.unmount());
    }
    globalThis.fetch = originalFetch;
  });
} else {
  test('lifecycle client forms pass rendered pending semantics', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/account/pro-credential-runtime-preload.cjs'),
        join(process.cwd(), 'src/components/admin/pro-lifecycle-forms-runtime.test.ts'),
      ],
      {
        env: { ...process.env, PRO_LIFECYCLE_FORMS_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
