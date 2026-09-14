import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Window } from 'happy-dom';

if (process.env.AUTH_RECOVERY_RUNTIME_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/verify-otp' });
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

  const setValue = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    );
    input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
    input.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
  };

  test('OTP supports paste, typing, populated and empty Backspace, and arrow focus', async () => {
    const [{ createElement, act }, { createRoot }, { OtpForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./OtpForm'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(OtpForm, { email: 'person@example.com' })));
    const inputs = [...container.querySelectorAll('input')] as HTMLInputElement[];
    assert.equal(document.activeElement, inputs[0]);

    await act(() => setValue(inputs[0]!, '1'));
    assert.equal(inputs[0]!.value, '1');
    assert.equal(document.activeElement, inputs[1]);

    inputs[0]!.focus();
    await act(() =>
      inputs[0]!.dispatchEvent(
        new browser.KeyboardEvent('keydown', {
          key: 'Backspace',
          bubbles: true,
        }) as unknown as Event,
      ),
    );
    await act(() => setValue(inputs[0]!, ''));
    assert.equal(document.activeElement, inputs[0], 'clearing a populated digit must not advance');

    await act(() => setValue(inputs[0]!, '1'));
    inputs[1]!.focus();
    await act(() =>
      inputs[1]!.dispatchEvent(
        new browser.KeyboardEvent('keydown', {
          key: 'Backspace',
          bubbles: true,
        }) as unknown as Event,
      ),
    );
    assert.equal(inputs[0]!.value, '');
    assert.equal(document.activeElement, inputs[0]);

    await act(() =>
      inputs[0]!.dispatchEvent(
        new browser.KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
        }) as unknown as Event,
      ),
    );
    assert.equal(document.activeElement, inputs[1]);
    await act(() =>
      inputs[1]!.dispatchEvent(
        new browser.KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          bubbles: true,
        }) as unknown as Event,
      ),
    );
    assert.equal(document.activeElement, inputs[0]);

    const group = container.querySelector('[role="group"]')!;
    const paste = new browser.Event('paste', {
      bubbles: true,
      cancelable: true,
    }) as unknown as Event & {
      clipboardData: { getData(type: string): string };
    };
    paste.clipboardData = { getData: () => '12a3456' };
    await act(() => group.dispatchEvent(paste));
    assert.equal(inputs.map((input) => input.value).join(''), '123456');
    assert.equal(document.activeElement, inputs[5]);

    let calls = 0;
    let resolveVerify!: (response: Response) => void;
    globalThis.fetch = async () => {
      calls += 1;
      return new Promise<Response>((resolve) => {
        resolveVerify = resolve;
      });
    };
    const form = container.querySelector('form')!;
    const resend = container.querySelector('button[type="button"]') as HTMLButtonElement;
    await act(async () => {
      form.dispatchEvent(
        new browser.Event('submit', {
          bubbles: true,
          cancelable: true,
        }) as unknown as Event,
      );
      resend.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls, 1, 'verify and resend must share one in-flight operation latch');
    await act(async () => {
      resolveVerify(Response.json({ code: 'INVALID_OTP' }, { status: 401 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(() => root.unmount());
    container.remove();
  });
} else {
  test('auth recovery runtime behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/auth/auth-recovery-runtime-preload.cjs'),
        fileURLToPath(import.meta.url),
      ],
      { env: { ...process.env, AUTH_RECOVERY_RUNTIME_CHILD: '1' }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
