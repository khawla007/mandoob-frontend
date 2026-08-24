import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { Window } from 'happy-dom';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;

if (reactServer) {
  test('PRO assignment typeahead passes rendered interaction contracts', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/admin/pro-assignment-typeahead-runtime-preload.cjs'),
        fileURLToPath(import.meta.url),
      ],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
} else {
  const browser = new Window({ url: 'https://app.example.test/admin/companies' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    Event: browser.Event,
    KeyboardEvent: browser.KeyboardEvent,
    MouseEvent: browser.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const rows = [
    {
      proProfileId: '11111111-1111-4111-8111-111111111111',
      fullName: 'Disabled',
      eligibility: { eligible: false, codes: ['PRO_ALREADY_ASSIGNED'] },
    },
    {
      proProfileId: '22222222-2222-4222-8222-222222222222',
      fullName: 'Eligible',
      eligibility: { eligible: true, codes: [] },
    },
  ];
  const change = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    );
    input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 280));

  test('debounces, suppresses stale results, skips disabled options, and selects by keyboard', async () => {
    const [{ act, createElement }, { createRoot }, { ProAssignmentTypeahead }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./ProAssignmentTypeahead'),
    ]);
    const requests: Array<{ resolve(value: Response): void; signal?: AbortSignal }> = [];
    globalThis.fetch = async (_input, init) =>
      new Promise<Response>((resolve) =>
        requests.push({ resolve, signal: init?.signal ?? undefined }),
      );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(ProAssignmentTypeahead, {
          companyId: 'company',
          label: 'PRO',
          name: 'proProfileId',
          error: 'Required',
          errorId: 'pro-error',
        }),
      ),
    );
    const input = container.querySelector<HTMLInputElement>('[role=combobox]')!;
    assert.equal(input.required, true);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.match(input.getAttribute('aria-describedby') ?? '', /-status pro-error$/u);
    assert.equal(container.querySelector('#pro-error')?.textContent, 'Required');
    await act(() => change(input, 'Al'));
    assert.equal(requests.length, 0);
    await act(wait);
    assert.equal(requests.length, 1);
    await act(() => change(input, 'Ali'));
    await act(wait);
    assert.equal(requests[0]?.signal?.aborted, true);
    assert.equal(requests.length, 2);
    await act(async () => requests[1]!.resolve(new Response(JSON.stringify({ rows }))));
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    await act(async () =>
      requests[0]!.resolve(
        new Response(JSON.stringify({ rows: [{ ...rows[1], fullName: 'Stale' }] })),
      ),
    );
    assert.equal(container.textContent?.includes('Stale'), false);
    await act(() =>
      input.dispatchEvent(
        new browser.KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
        }) as unknown as Event,
      ),
    );
    assert.equal(input.getAttribute('aria-activedescendant')?.endsWith('-1'), true);
    await act(() =>
      input.dispatchEvent(
        new browser.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as Event,
      ),
    );
    assert.equal(
      container.querySelector<HTMLInputElement>('input[type=hidden]')?.value,
      rows[1]!.proProfileId,
    );
    await act(wait);
    assert.equal(requests.length, 2, 'selection refetched');
    await act(() => root.unmount());
    container.remove();
  });

  test('Escape closes results and mouse cannot select a disabled option', async () => {
    const [{ act, createElement }, { createRoot }, { ProAssignmentTypeahead }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./ProAssignmentTypeahead'),
    ]);
    globalThis.fetch = async () => new Response(JSON.stringify({ rows }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(ProAssignmentTypeahead, {
          companyId: 'company',
          label: 'PRO',
          name: 'proProfileId',
        }),
      ),
    );
    const input = container.querySelector<HTMLInputElement>('[role=combobox]')!;
    assert.equal(input.hasAttribute('aria-invalid'), false);
    assert.doesNotMatch(input.getAttribute('aria-describedby') ?? '', /error/u);
    await act(() => change(input, 'Alix'));
    await act(wait);
    const options = container.querySelectorAll('[role=option]');
    await act(() =>
      options[0]!.dispatchEvent(
        new browser.MouseEvent('mousedown', { bubbles: true }) as unknown as Event,
      ),
    );
    assert.equal(container.querySelector<HTMLInputElement>('input[type=hidden]')?.value, '');
    await act(() =>
      input.dispatchEvent(
        new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event,
      ),
    );
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    await act(() => change(input, 'Ali'));
    await act(wait);
    await act(() =>
      container
        .querySelectorAll('[role=option]')[1]!
        .dispatchEvent(new browser.MouseEvent('mousedown', { bubbles: true }) as unknown as Event),
    );
    assert.equal(
      container.querySelector<HTMLInputElement>('input[type=hidden]')?.value,
      rows[1]!.proProfileId,
    );
    await act(() => root.unmount());
    container.remove();
  });
}
