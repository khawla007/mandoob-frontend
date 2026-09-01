import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

const componentPath = new URL('./ContactForm.tsx', import.meta.url);

test('contact form component exists before the rendered interaction contract runs', () => {
  assert.equal(existsSync(componentPath), true, 'ContactForm.tsx has not been implemented');
});

if (existsSync(componentPath)) {
  const browser = new Window({ url: 'https://app.example.test/contact' });
  Object.assign(globalThis, {
    self: browser,
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    HTMLTextAreaElement: browser.HTMLTextAreaElement,
    HTMLSelectElement: browser.HTMLSelectElement,
    HTMLButtonElement: browser.HTMLButtonElement,
    HTMLFormElement: browser.HTMLFormElement,
    Event: browser.Event,
    MouseEvent: browser.MouseEvent,
    FormData: browser.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  async function renderForm(props: Record<string, unknown> = {}) {
    const [{ act, createElement }, { createRoot }, { ContactForm }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./ContactForm'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(ContactForm, props)));
    return { act, container, root };
  }

  function setControlValue(
    control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string | boolean,
  ) {
    if (control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'checkbox') {
      const setter = Object.getOwnPropertyDescriptor(
        browser.HTMLInputElement.prototype,
        'checked',
      )?.set;
      setter?.call(control, value);
    } else {
      const prototype =
        control instanceof browser.HTMLTextAreaElement
          ? browser.HTMLTextAreaElement.prototype
          : control instanceof browser.HTMLSelectElement
            ? browser.HTMLSelectElement.prototype
            : browser.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value);
    }
    control.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
    control.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
  }

  function submit(container: HTMLElement) {
    container
      .querySelector('form')!
      .dispatchEvent(
        new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
      );
  }

  function fillValidForm(container: HTMLElement) {
    setControlValue(container.querySelector<HTMLInputElement>('#contact-fullName')!, 'Amina Noor');
    setControlValue(
      container.querySelector<HTMLInputElement>('#contact-email')!,
      'amina@example.com',
    );
    setControlValue(
      container.querySelector<HTMLInputElement>('#contact-phone')!,
      '+971 50 123 4567',
    );
    setControlValue(
      container.querySelector<HTMLSelectElement>('#contact-subject')!,
      'company_setup',
    );
    setControlValue(
      container.querySelector<HTMLTextAreaElement>('#contact-message')!,
      'Please help me set up my company.',
    );
    setControlValue(container.querySelector<HTMLInputElement>('#contact-consent')!, true);
  }

  test('renders labelled fields, valid legal links, cues, and focus styling hooks', async () => {
    const { act, container, root } = await renderForm();
    for (const id of ['fullName', 'email', 'phone', 'subject', 'message', 'consent']) {
      const control = container.querySelector<HTMLElement>(`#contact-${id}`)!;
      assert.ok(control);
      assert.equal(control.hasAttribute('required'), true, `${id} must be semantically required`);
      assert.ok(container.querySelector(`label[for="contact-${id}"]`));
    }
    assert.equal(container.querySelector('a[href="/privacy"]')?.textContent, 'Privacy Policy');
    assert.equal(container.querySelector('a[href="/terms"]')?.textContent, 'Terms of Service');
    assert.match(container.textContent ?? '', /all fields are required/i);
    assert.match(container.querySelector('form')?.className ?? '', /contact-form/u);
    assert.match(
      readFileSync(componentPath, 'utf8'),
      /result\.sent\s*\?\s*['"]A message was sent\./u,
      'result UI must explicitly describe real sent and no-send states',
    );
    await act(() => root.unmount());
    container.remove();
  });

  test('invalid submission exposes linked inline errors and focuses the summary', async () => {
    const { act, container, root } = await renderForm();
    await act(() => submit(container));
    const summary = container.querySelector<HTMLElement>('#contact-error-summary')!;
    assert.equal(document.activeElement, summary);
    assert.equal(summary.getAttribute('role'), 'alert');
    assert.equal(summary.getAttribute('tabindex'), '-1');
    const anchors = [...summary.querySelectorAll<HTMLAnchorElement>('a')];
    assert.deepEqual(
      anchors.map((anchor) => anchor.getAttribute('href')),
      [
        '#contact-fullName',
        '#contact-email',
        '#contact-phone',
        '#contact-subject',
        '#contact-message',
        '#contact-consent',
      ],
    );
    for (const anchor of anchors) {
      const control = container.querySelector<HTMLElement>(anchor.getAttribute('href')!)!;
      assert.equal(control.getAttribute('aria-invalid'), 'true');
      assert.match(control.getAttribute('aria-describedby') ?? '', /error/u);
    }
    anchors[0]!.click();
    assert.equal(document.activeElement, container.querySelector('#contact-fullName'));
    await act(() => root.unmount());
    container.remove();
  });

  test('announces pending work and disables duplicate submission', async () => {
    const { act, container, root } = await renderForm({
      demoOutcome: 'success',
      demoDelayMs: 40,
    });
    await act(() => fillValidForm(container));
    await act(() => {
      submit(container);
      submit(container);
    });
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-disabled'), 'true');
    assert.equal(container.querySelector('[role="status"]')?.textContent, 'Submitting securely…');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    const result = container.querySelector<HTMLElement>('[data-contact-result="success"]')!;
    assert.equal(document.activeElement, result);
    assert.match(result.textContent ?? '', /no message was sent/i);
    await act(() => root.unmount());
    container.remove();
  });

  test('uses the honest no-write unavailable adapter by default', async () => {
    const { act, container, root } = await renderForm();
    await act(() => fillValidForm(container));
    await act(async () => {
      submit(container);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const result = container.querySelector<HTMLElement>('[data-contact-result="unavailable"]')!;
    assert.ok(result);
    assert.match(result.textContent ?? '', /delivery status: no message was sent/i);
    assert.doesNotMatch(result.textContent ?? '', /synthetic contact preview/i);
    assert.equal(
      container.querySelector<HTMLInputElement>('#contact-fullName')?.value,
      'Amina Noor',
    );
    await act(() => root.unmount());
    container.remove();
  });

  for (const outcome of [
    'success',
    'duplicate',
    'rate_limited',
    'failure',
    'unavailable',
  ] as const) {
    test(`renders the honest ${outcome} state with safe recovery`, async () => {
      const { act, container, root } = await renderForm({ demoOutcome: outcome });
      await act(() => fillValidForm(container));
      await act(async () => {
        submit(container);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const result = container.querySelector<HTMLElement>(`[data-contact-result="${outcome}"]`)!;
      assert.ok(result);
      assert.match(result.textContent ?? '', /no message was sent/i);
      assert.equal(document.activeElement, result);

      const recovery = result.querySelector<HTMLButtonElement>('button');
      assert.ok(recovery, `${outcome} needs a retry or reset control`);
      await act(() => recovery.click());
      if (outcome === 'success') {
        assert.equal(
          container.querySelector<HTMLInputElement>('#contact-fullName')?.value,
          '',
          'success reset should clear fields',
        );
        assert.equal(document.activeElement, container.querySelector('#contact-fullName'));
      } else {
        assert.equal(container.querySelector(`[data-contact-result="${outcome}"]`), null);
        assert.equal(document.activeElement, container.querySelector('button[type="submit"]'));
      }
      await act(() => root.unmount());
      container.remove();
    });
  }
}
