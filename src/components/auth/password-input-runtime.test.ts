import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { Window } from 'happy-dom';

if (process.env.PASSWORD_INPUT_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/login' });
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

  test('password toggle is focus preserving, stateful, localized, and keyboard reachable', async () => {
    const [{ createElement, act }, { createRoot }, { PasswordInput }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./PasswordInput'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(PasswordInput, { defaultValue: 'Secret1!', 'aria-label': 'Password' }),
      ),
    );
    const input = container.querySelector('input') as HTMLInputElement;
    const button = container.querySelector('button') as HTMLButtonElement;
    input.focus();
    input.setSelectionRange(2, 5);
    const mouseDown = new browser.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    await act(() => {
      button.dispatchEvent(mouseDown as unknown as Event);
      button.click();
    });
    assert.equal(mouseDown.defaultPrevented, true);
    assert.equal(document.activeElement, input);
    assert.equal(input.selectionStart, 2);
    assert.equal(input.selectionEnd, 5);
    assert.equal(input.type, 'text');
    assert.equal(button.getAttribute('aria-label'), 'Hide password');
    assert.equal(button.tabIndex, 0);
    await act(() => button.click());
    assert.equal(input.type, 'password');
    assert.equal(button.getAttribute('aria-label'), 'Show password');
    await act(() => root.unmount());
    container.remove();
  });
} else {
  test('password input runtime accessibility behavior', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--require',
        join(process.cwd(), 'src/components/auth/password-input-runtime-preload.cjs'),
        fileURLToPath(import.meta.url),
      ],
      {
        env: { ...process.env, PASSWORD_INPUT_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
