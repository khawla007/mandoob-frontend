import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Window } from 'happy-dom';

if (process.env.MFA_RUNTIME_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/mfa/enroll' });
  Object.assign(globalThis, {
    self: browser,
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    Event: browser.Event,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const globals = globalThis as typeof globalThis & {
    __mfaListFactorsResult: unknown;
    __mfaRoutes: string[];
  };
  const setValue = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    );
    input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
    input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
  };

  test('MFA enrollment mount performs no network or factor mutation', async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return Response.json({});
    };
    const [{ createElement, act }, { createRoot }, { MfaEnrollCard }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./MfaEnrollCard'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(MfaEnrollCard)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(fetchCalls, 0);
    assert.equal(
      (globalThis as typeof globalThis & { __mfaUnenrollCalls: number }).__mfaUnenrollCalls,
      0,
    );
    assert.match(container.textContent ?? '', /start/u);
    await act(() => root.unmount());
  });

  test('MFA challenge renders verified, missing, generic, and proven-session discovery states', async () => {
    const [{ createElement, act }, { createRoot }, { MfaChallengeForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./MfaChallengeForm'),
    ]);
    for (const [result, expected] of [
      [{ data: { totp: [{ id: 'factor-1', status: 'verified' }] }, error: null }, 'instructions'],
      [{ data: { totp: [] }, error: null }, 'noFactor'],
      [{ data: null, error: { status: 503 } }, 'states.failure'],
      [{ data: null, error: { status: 401 } }, 'states.sessionExpired'],
    ] as const) {
      globals.__mfaListFactorsResult = result;
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(() => root.render(createElement(MfaChallengeForm)));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      assert.match(container.textContent ?? '', new RegExp(expected.replace('.', '\\.')));
      if (expected === 'noFactor') {
        await act(() => (container.querySelector('button') as HTMLButtonElement).click());
        const authenticatorButton = [...container.querySelectorAll('button')].find(
          (button) => button.textContent === 'useAuthenticator',
        )!;
        await act(() => authenticatorButton.click());
        assert.match(container.textContent ?? '', /noFactor/u);
        assert.equal(container.querySelector('form'), null);
      }
      if (expected === 'states.sessionExpired') {
        assert.equal(container.querySelector('a')?.getAttribute('href'), '/login');
      }
      await act(() => root.unmount());
      container.remove();
    }
  });

  test('MFA challenge handles rate limits and uses fixed success destinations', async () => {
    const [{ createElement, act }, { createRoot }, { MfaChallengeForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./MfaChallengeForm'),
    ]);
    globals.__mfaListFactorsResult = {
      data: { totp: [{ id: 'factor-1', status: 'verified' }] },
      error: null,
    };
    const render = async (url: string) => {
      browser.history.replaceState(null, '', url);
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(() => root.render(createElement(MfaChallengeForm)));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      return { container, root };
    };
    const submit = (container: HTMLElement) =>
      container
        .querySelector('form')!
        .dispatchEvent(
          new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
        );

    let view = await render('/mfa/challenge?next=/account');
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return Response.json({});
    };
    await act(() => setValue(view.container.querySelector('input')!, '123'));
    await act(() => submit(view.container));
    assert.match(view.container.textContent ?? '', /states\.invalidOrExpired/u);
    assert.equal(fetchCalls, 0);

    globalThis.fetch = async () => Response.json({ code: 'RATE_LIMITED' }, { status: 429 });
    await act(() => setValue(view.container.querySelector('input')!, '123456'));
    await act(async () => {
      submit(view.container);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(view.container.textContent ?? '', /states\.rateLimited/u);
    await act(() => view.root.unmount());
    view.container.remove();

    globals.__mfaRoutes.length = 0;
    view = await render('/mfa/challenge?next=/account');
    globalThis.fetch = async () => Response.json({ ok: true, redirectTo: '/admin' });
    await act(() => setValue(view.container.querySelector('input')!, '123456'));
    await act(async () => {
      submit(view.container);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.deepEqual(globals.__mfaRoutes, ['/account']);
    await act(() => view.root.unmount());
    view.container.remove();

    globals.__mfaRoutes.length = 0;
    view = await render('/mfa/challenge?next=/admin');
    const recoveryButton = [...view.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'useRecovery',
    )!;
    await act(() => recoveryButton.click());
    await act(() => setValue(view.container.querySelector('input')!, 'abcde-fghij'));
    await act(async () => {
      submit(view.container);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.deepEqual(globals.__mfaRoutes, ['/login']);
    await act(() => view.root.unmount());
    view.container.remove();

    view = await render('/mfa/challenge');
    globalThis.fetch = async () =>
      Response.json({ code: 'MFA_RECOVERY_REPAIR_REQUIRED' }, { status: 502 });
    await act(() => {
      [...view.container.querySelectorAll('button')]
        .find((button) => button.textContent === 'useRecovery')!
        .click();
    });
    await act(() => setValue(view.container.querySelector('input')!, 'abcde-fghij'));
    await act(async () => {
      submit(view.container);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(view.container.textContent ?? '', /states\.repairRequired/u);
    assert.deepEqual(
      [...view.container.querySelectorAll('a')].map((link) => link.getAttribute('href')),
      ['/login', '/contact'],
    );
    await act(() => view.root.unmount());
    view.container.remove();
  });

  test('MFA enrollment sends every post-verification finalization failure to login', async () => {
    const [{ createElement, act }, { createRoot }, { MfaEnrollCard }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./MfaEnrollCard'),
    ]);
    const run = async (failureCode: string) => {
      const responses = [
        Response.json({
          factorId: 'factor-1',
          qrCode: 'data:image/svg+xml,test',
          secret: 'SECRET',
        }),
        Response.json({ code: failureCode }, { status: 502 }),
      ];
      globalThis.fetch = async () => responses.shift()!;
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(() => root.render(createElement(MfaEnrollCard)));
      await act(async () => {
        (container.querySelector('button') as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(() => setValue(container.querySelector('input')!, '123456'));
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(
            new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
          );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const snapshot = {
        text: container.textContent ?? '',
        links: [...container.querySelectorAll('a')].map((link) => link.getAttribute('href')),
      };
      await act(() => root.unmount());
      container.remove();
      return snapshot;
    };

    const clean = await run('MFA_ENROLL_FINALIZATION_FAILED');
    assert.match(clean.text, /states\.cleanRollback/u);
    assert.doesNotMatch(clean.text, /start|retry/u);
    assert.deepEqual(clean.links, ['/login']);

    const repair = await run('MFA_ENROLL_REPAIR_REQUIRED');
    assert.match(repair.text, /states\.repairRequired/u);
    assert.doesNotMatch(repair.text, /retry/u);
    assert.deepEqual(repair.links, ['/login', '/contact']);

    globalThis.fetch = async () => Response.json({ code: 'AAL2_REQUIRED' }, { status: 403 });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(MfaEnrollCard)));
    await act(async () => {
      (container.querySelector('button') as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(container.textContent ?? '', /states\.challengeRequired/u);
    assert.doesNotMatch(container.textContent ?? '', /retry/u);
    assert.equal(container.querySelector('a')?.getAttribute('href'), '/mfa/challenge');
    await act(() => root.unmount());
    container.remove();
  });
} else {
  test('MFA runtime behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/auth/mfa-runtime-preload.cjs'),
        fileURLToPath(import.meta.url),
      ],
      { env: { ...process.env, MFA_RUNTIME_CHILD: '1' }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
