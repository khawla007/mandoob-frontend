import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import type { ContactAdapter, ContactSubmissionResult } from '@/lib/public-contact/contracts';
import { createSyntheticContactAdapter } from '@/lib/public-contact/demo-adapter';

const componentPath = new URL('./ContactForm.tsx', import.meta.url);

test('contact form component exists before the rendered client interaction contract runs', () => {
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

  async function renderInjectedForm(
    adapter: ContactAdapter,
    delayMs = 0,
    onResultCommitted?: (result: ContactSubmissionResult) => void,
  ) {
    const [{ act, createElement }, { createRoot }, { ContactFormTestHarness }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./ContactForm'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(ContactFormTestHarness, { adapter, delayMs, onResultCommitted } as never),
      ),
    );
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

  test('PRO interest handoff preselects Other and explains fail-closed delivery', async () => {
    const { act, container, root } = await renderForm({ initialTopic: 'pro-interest' });
    assert.equal(container.querySelector<HTMLSelectElement>('#contact-subject')?.value, 'other');
    assert.match(container.textContent ?? '', /PRO interest.*delivery.*unavailable/iu);
    await act(() => root.unmount());
    container.remove();
  });

  test('renders labelled fields, valid legal links, cues, and focus styling hooks', async () => {
    const { act, container, root } = await renderForm();
    for (const id of ['fullName', 'email', 'phone', 'subject', 'message', 'consent']) {
      const control = container.querySelector<HTMLElement>(`#contact-${id}`)!;
      assert.ok(control);
      assert.equal(control.hasAttribute('required'), true, `${id} must be semantically required`);
      assert.ok(container.querySelector(`label[for="contact-${id}"]`));
    }
    assert.equal(
      container.querySelector('a[href="/legal/privacy"]')?.textContent,
      'Privacy Policy',
    );
    assert.equal(
      container.querySelector('a[href="/legal/terms"]')?.textContent,
      'Terms of Service',
    );
    assert.equal(container.querySelector('a[href="/privacy"]'), null);
    assert.equal(container.querySelector('a[href="/terms"]'), null);
    assert.match(container.textContent ?? '', /all fields are required/i);
    assert.match(container.querySelector('form')?.className ?? '', /contact-form/u);
    assert.equal(
      container.querySelector<HTMLInputElement>('#contact-phone')?.getAttribute('placeholder'),
      null,
      'the phone field must not present a plausible contact fixture',
    );
    assert.match(
      container.querySelector('#contact-phone-cue')?.textContent ?? '',
      /UAE mobile or landline number/u,
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
    await act(() =>
      setControlValue(
        container.querySelector<HTMLInputElement>('#contact-fullName')!,
        'Amina Noor',
      ),
    );
    assert.equal(
      document.activeElement,
      container.querySelector('#contact-fullName'),
      'editing a linked field must not return focus to the summary',
    );
    await act(() => root.unmount());
    container.remove();
  });

  test('announces pending work and disables duplicate submission', async () => {
    let adapterInvocations = 0;
    const syntheticSuccess = createSyntheticContactAdapter('success');
    const countingAdapter: ContactAdapter = {
      async submit(payload) {
        adapterInvocations += 1;
        return syntheticSuccess.submit(payload);
      },
    };
    const { act, container, root } = await renderInjectedForm(countingAdapter, 40);
    await act(() => fillValidForm(container));
    await act(() => {
      submit(container);
      submit(container);
    });
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-disabled'), 'true');
    assert.equal(
      container.querySelector('[role="status"]')?.textContent,
      'Preparing this no-send preview… No message has been sent.',
    );
    for (const control of container.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input, textarea, select')) {
      assert.equal(control.disabled, true, `${control.id} must be disabled while pending`);
    }
    const fullName = container.querySelector<HTMLInputElement>('#contact-fullName')!;
    fullName.focus();
    fullName.dispatchEvent(
      new browser.KeyboardEvent('keydown', { bubbles: true, key: 'X' }) as unknown as Event,
    );
    assert.equal(fullName.value, 'Amina Noor', 'pending values must remain immutable');
    assert.notEqual(
      document.activeElement,
      fullName,
      'disabled pending fields cannot receive focus',
    );
    const reset = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent === 'Reset',
    )!;
    assert.equal(reset.disabled, true, 'reset must be disabled while pending');
    assert.equal(adapterInvocations, 0, 'adapter should not run before the deterministic delay');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    assert.equal(adapterInvocations, 1, 'duplicate submit must invoke the adapter only once');
    const result = container.querySelector<HTMLElement>('[data-contact-result="success"]')!;
    assert.equal(document.activeElement, result);
    assert.match(result.textContent ?? '', /no message was sent/i);
    await act(() => root.unmount());
    container.remove();
  });

  test('commits a real sent result while mounted and renders the sent branch', async () => {
    let committed = 0;
    const realSuccess: ContactAdapter = {
      async submit() {
        return { status: 'success', sent: true, message: 'Your message was sent.' };
      },
    };
    const { act, container, root } = await renderInjectedForm(realSuccess, 0, () => {
      committed += 1;
    });
    await act(() => fillValidForm(container));
    await act(async () => {
      submit(container);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const result = container.querySelector<HTMLElement>('[data-contact-result="success"]')!;
    assert.equal(committed, 1);
    assert.match(result.textContent ?? '', /delivery status: a message was sent/i);
    assert.doesNotMatch(result.textContent ?? '', /no message was sent/i);
    await act(() => root.unmount());
    container.remove();
  });

  test('ignores adapter completion after unmount', async () => {
    let resolveResult!: (result: ContactSubmissionResult) => void;
    const pendingResult = new Promise<ContactSubmissionResult>((resolve) => {
      resolveResult = resolve;
    });
    let committed = 0;
    const deferredAdapter: ContactAdapter = { submit: async () => pendingResult };
    const { act, container, root } = await renderInjectedForm(deferredAdapter, 0, () => {
      committed += 1;
    });
    await act(() => fillValidForm(container));
    await act(() => submit(container));
    await act(() => root.unmount());
    await act(async () => {
      resolveResult({ status: 'success', sent: true, message: 'Your message was sent.' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(committed, 0, 'unmounted forms must ignore async completion');
    container.remove();
  });

  test('standalone reset clears every field and restores focus to full name', async () => {
    const { act, container, root } = await renderForm();
    await act(() => fillValidForm(container));
    container.querySelector<HTMLTextAreaElement>('#contact-message')!.focus();
    const reset = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Reset',
    )!;
    await act(() => reset.click());

    for (const selector of ['#contact-fullName', '#contact-email', '#contact-phone']) {
      assert.equal(container.querySelector<HTMLInputElement>(selector)?.value, '', selector);
    }
    assert.equal(container.querySelector<HTMLSelectElement>('#contact-subject')?.value, '');
    assert.equal(container.querySelector<HTMLTextAreaElement>('#contact-message')?.value, '');
    assert.equal(container.querySelector<HTMLInputElement>('#contact-consent')?.checked, false);
    assert.equal(document.activeElement, container.querySelector('#contact-fullName'));
    assert.equal(container.querySelector('#contact-error-summary'), null);
    assert.equal(container.querySelector('[data-contact-result]'), null);
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

  test('ignores synthetic demo props in the production client build', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      configurable: true,
      enumerable: true,
      value: 'production',
      writable: true,
    });
    try {
      const { act, container, root } = await renderForm({
        demoOutcome: 'success',
      });
      await act(() => fillValidForm(container));
      await act(async () => {
        submit(container);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const result = container.querySelector<HTMLElement>('[data-contact-result="unavailable"]')!;
      assert.ok(result);
      assert.match(result.textContent ?? '', /delivery status: no message was sent/i);
      assert.doesNotMatch(result.textContent ?? '', /synthetic contact preview/i);
      await act(() => root.unmount());
      container.remove();
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        configurable: true,
        enumerable: true,
        value: previousNodeEnv,
        writable: true,
      });
    }
  });

  test('danger tokens maintain AA contrast in light and dark form surfaces', () => {
    const css = readFileSync(
      new URL('../../app/(public)/public-theme.css', import.meta.url),
      'utf8',
    );
    assert.match(css, /\.site-public \{[^]*?--public-danger: #8f1d14;/u);
    assert.match(css, /\.dark \.site-public \{[^]*?--public-danger: #ffb4a8;/u);

    const lightDanger = hexLuminance('#8f1d14');
    const darkDanger = hexLuminance('#ffb4a8');
    for (const background of [oklchLuminance(0.995, 0.004, 45), oklchLuminance(0.985, 0.004, 45)]) {
      assert.ok(contrast(lightDanger, background) >= 4.5);
    }
    for (const background of [
      oklchLuminance(0.17, 0.008, 45),
      oklchLuminance(0.227, 0.008, 45),
      oklchLuminance(0.268, 0.008, 45),
    ]) {
      assert.ok(contrast(darkDanger, background) >= 4.5);
    }
  });

  for (const outcome of [
    'success',
    'duplicate',
    'rate_limited',
    'failure',
    'unavailable',
  ] as const) {
    test(`renders the honest ${outcome} state with safe recovery`, async () => {
      const { act, container, root } = await renderInjectedForm(
        createSyntheticContactAdapter(outcome),
      );
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

function hexLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function oklchLuminance(lightness: number, chroma: number, hue: number) {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: number, second: number) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
