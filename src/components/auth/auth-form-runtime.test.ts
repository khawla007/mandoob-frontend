import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Window } from 'happy-dom';

if (process.env.AUTH_FORM_RUNTIME_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/login' });
  Object.assign(globalThis, {
    self: browser,
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    ResizeObserver: browser.ResizeObserver,
    Event: browser.Event,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const setValue = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    );
    input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
    input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
  };

  test('login suppresses duplicate posts and releases its latch after HTTP and network failures', async () => {
    const [{ createElement, act }, { createRoot }, { LoginForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./LoginForm'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(LoginForm)));
    const inputs = container.querySelectorAll('input');
    await act(() => {
      setValue(inputs[0] as HTMLInputElement, 'person@example.com');
      setValue(inputs[1] as HTMLInputElement, 'Secret1!');
    });
    let calls = 0;
    let resolveFirst!: (response: Response) => void;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1)
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      throw new Error('offline');
    };
    const submit = () =>
      container
        .querySelector('form')!
        .dispatchEvent(
          new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
        );
    await act(async () => {
      submit();
      submit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls, 1);
    await act(async () => {
      resolveFirst(Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(container.querySelector('[role="alert"]')?.textContent, 'invalidCredentials');
    assert.equal(
      document.activeElement,
      container.querySelector('[role="alert"]'),
      'HTTP failure feedback must receive focus after it is committed',
    );
    await act(async () => {
      submit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls, 2, 'HTTP failure must release the latch');
    await act(async () => {
      submit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls, 3, 'network failure must release the latch');
    assert.equal(container.querySelector('[role="alert"]')?.textContent, 'networkError');
    await act(() => root.unmount());
    container.remove();
  });

  test('login runtime honors only the exact MFA re-enrollment handoff', async () => {
    const [{ createElement, act }, { createRoot }, { LoginForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./LoginForm'),
    ]);
    const routes = (globalThis as typeof globalThis & { __authFormRoutes: string[] })
      .__authFormRoutes;
    const login = async (next: string) => {
      browser.history.replaceState(null, '', `/login?next=${encodeURIComponent(next)}`);
      routes.length = 0;
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(() => root.render(createElement(LoginForm)));
      const inputs = container.querySelectorAll('input');
      await act(() => {
        setValue(inputs[0] as HTMLInputElement, 'person@example.com');
        setValue(inputs[1] as HTMLInputElement, 'Secret1!');
      });
      globalThis.fetch = async () => Response.json({ ok: true, redirectTo: '/admin' });
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(
            new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
          );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(() => root.unmount());
      container.remove();
      return [...routes];
    };

    assert.deepEqual(await login('/mfa/enroll'), ['/admin']);
    assert.deepEqual(await login('/reset-password'), ['/admin']);
  });
} else {
  test('auth form runtime submission behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/auth/auth-form-runtime-preload.cjs'),
        fileURLToPath(import.meta.url),
      ],
      { env: { ...process.env, AUTH_FORM_RUNTIME_CHILD: '1' }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
