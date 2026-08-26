import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

const browser = new Window({ url: 'https://app.example.test/account/role' });
const confirmableBrowser = browser as unknown as { confirm(message?: string): boolean };
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLAnchorElement: browser.HTMLAnchorElement,
  HTMLButtonElement: browser.HTMLButtonElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  File: browser.File,
  FormData: browser.FormData,
  IS_REACT_ACT_ENVIRONMENT: true,
});

async function runtime() {
  const [{ createElement, act }, { createRoot }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
  ]);
  return { createElement, act, createRoot };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
  input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
}

if (process.env.PRO_CREDENTIAL_RUNTIME_CHILD === '1') {
  test('credential form keeps dirty visible values while submitting an authoritative prop version', async () => {
    const { createElement, act, createRoot } = await runtime();
    const { ProCredentialForm } = await import('./ProCredentialForm');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const credential = {
      credentialId: '11111111-1111-4111-8111-111111111111',
      issuingAuthority: 'Original Authority',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      version: 1,
    };
    await act(() =>
      root.render(
        createElement(ProCredentialForm, {
          mode: 'edit',
          credential,
          hasStoredIdentifier: true,
        }),
      ),
    );
    const identifier = container.querySelector<HTMLInputElement>('#credential-identifier')!;
    const authority = container.querySelector<HTMLInputElement>('#credential-authority')!;
    assert.equal(identifier.getAttribute('aria-describedby'), 'credential-identifier-help');
    assert.equal(authority.hasAttribute('aria-describedby'), false);
    assert.equal(
      container.querySelector('#credential-issue-date')!.hasAttribute('aria-describedby'),
      false,
    );
    assert.equal(
      container.querySelector('#credential-expiry-date')!.hasAttribute('aria-describedby'),
      false,
    );
    await act(() => {
      setInputValue(identifier, 'NEW-9988');
      setInputValue(authority, 'Dirty Authority');
    });

    await act(() =>
      root.render(
        createElement(ProCredentialForm, {
          mode: 'edit',
          credential: { ...credential, version: 2 },
          hasStoredIdentifier: true,
        }),
      ),
    );
    assert.equal(container.querySelector('#credential-identifier'), identifier, 'form remounted');
    assert.equal(identifier.value, 'NEW-9988');
    assert.equal(authority.value, 'Dirty Authority');

    let submitted: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ credential: { version: 3 } }), { status: 200 });
    };
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(
          new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
        );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    globalThis.fetch = originalFetch;
    assert.equal((submitted as Record<string, unknown> | null)?.expectedVersion, 2);
    await act(() => root.unmount());
    container.remove();
  });

  test('shared dirty guard confirms only same-origin client anchor navigation and cleans up', async () => {
    const { createElement, act, createRoot } = await runtime();
    browser.location.href = 'https://app.example.test/account/role';
    const { useUnsavedChangesGuard } = await import('./use-unsaved-changes-guard');
    function Harness() {
      useUnsavedChangesGuard(true, 'Leave?');
      useUnsavedChangesGuard(true, 'Leave?');
      return createElement(
        'div',
        null,
        createElement('a', { id: 'internal', href: '/account' }, 'Internal'),
        createElement('a', { id: 'hash', href: '#details' }, 'Hash'),
        createElement('a', { id: 'external', href: 'https://outside.example' }, 'External'),
        createElement('a', { id: 'new-tab', href: '/account', target: '_blank' }, 'New tab'),
        createElement('a', { id: 'download', href: '/file.pdf', download: true }, 'Download'),
        createElement('form', null, createElement('button', { type: 'submit' }, 'Submit')),
      );
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(Harness)));
    let confirmations = 0;
    confirmableBrowser.confirm = () => {
      confirmations += 1;
      return false;
    };
    const click = (selector: string) => {
      const event = new browser.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      container.querySelector(selector)!.dispatchEvent(event as unknown as Event);
      return event.defaultPrevented;
    };
    assert.equal(click('#internal'), true);
    assert.equal(confirmations, 1);
    for (const selector of ['#hash', '#external', '#new-tab', '#download', 'button']) {
      assert.equal(click(selector), false, selector);
    }
    assert.equal(confirmations, 1);
    confirmableBrowser.confirm = () => {
      confirmations += 1;
      return true;
    };
    assert.equal(click('#internal'), false);
    assert.equal(confirmations, 2);

    const unload = new browser.Event('beforeunload', { cancelable: true });
    browser.dispatchEvent(unload);
    assert.equal(unload.defaultPrevented, true);

    const internal = container.querySelector('#internal')!;
    await act(() => root.unmount());
    confirmableBrowser.confirm = () => {
      confirmations += 1;
      return false;
    };
    const afterCleanup = new browser.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    internal.dispatchEvent(afterCleanup as unknown as Event);
    assert.equal(afterCleanup.defaultPrevented, false);
    assert.equal(confirmations, 2);
    container.remove();
  });

  test('selected evidence activates the guard and only describes an error after it renders', async () => {
    const { createElement, act, createRoot } = await runtime();
    browser.location.href = 'https://app.example.test/account/role';
    const { ProCredentialEvidenceForm } = await import('./ProCredentialEvidenceForm');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(
          'div',
          null,
          createElement(ProCredentialEvidenceForm, {
            credentialId: '11111111-1111-4111-8111-111111111111',
            version: 1,
            evidence: [],
            locale: 'en',
          }),
          createElement('a', { id: 'leave-evidence', href: '/account' }, 'Leave'),
        ),
      ),
    );
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
    assert.equal(
      input.getAttribute('aria-describedby'),
      'credential-evidence-help-11111111-1111-4111-8111-111111111111',
    );
    await act(async () => {
      const transfer = new browser.DataTransfer();
      transfer.items.add(
        new browser.File([new Uint8Array(10 * 1024 * 1024 + 1)], 'licence.pdf', {
          type: 'application/pdf',
        }),
      );
      input.files = transfer.files as unknown as FileList;
      input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    let confirmations = 0;
    confirmableBrowser.confirm = () => {
      confirmations += 1;
      return false;
    };
    const leave = new browser.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    container.querySelector('#leave-evidence')!.dispatchEvent(leave as unknown as Event);
    assert.equal(leave.defaultPrevented, true);
    assert.equal(confirmations, 1);

    assert.match(input.getAttribute('aria-describedby') ?? '', /error-summary/u);
    assert.ok(container.querySelector('[role=alert] a[href^="#credential-evidence-"]'));
    await act(() => root.unmount());
    container.remove();
  });
} else {
  test('credential client islands pass rendered interaction behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/account/pro-credential-runtime-preload.cjs'),
        join(process.cwd(), 'src/components/account/pro-credential-runtime.test.ts'),
      ],
      {
        env: { ...process.env, PRO_CREDENTIAL_RUNTIME_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(
      result.status,
      0,
      `Rendered client process failed:\n${result.stdout}\n${result.stderr}`,
    );
  });
}
