import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import React from 'react';
import { Window } from 'happy-dom';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;

if (reactServer) {
  test('MFA enrollment passes explicit-start interaction contracts', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'mfa-enroll-'));
    const preloadPath = join(temporaryDirectory, 'preload.cjs');
    try {
      writeFileSync(
        preloadPath,
        `const Module = require('node:module');
const requireFromProject = Module.createRequire(process.cwd() + '/package.json');
const React = requireFromProject('react');
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'next-intl') return {
    useTranslations: (namespace) => (key) => globalThis.__messages[namespace + '.' + key] ?? key,
  };
  if (request === 'next/link') return function Link({children, href, ...props}) {
    return React.createElement('a', {...props, href}, children);
  };
  if (request === '@/lib/supabase/browser') return {
    getSupabaseBrowserClient: () => ({
      auth: {mfa: {unenroll: async ({factorId}) => {
        globalThis.__unenrollCalls.push(factorId);
        return globalThis.__unenrollResult;
      }}},
    }),
  };
  return load.call(this, request, parent, isMain);
};`,
      );
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--require', preloadPath, '--test-reporter=spec', import.meta.filename],
        { encoding: 'utf8', env: { ...process.env, MFA_ENROLL_CLIENT: '1' } },
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
} else if (process.env.MFA_ENROLL_CLIENT === '1') {
  const browser = new Window({ url: 'https://app.example.test/mfa/enroll' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLButtonElement: browser.HTMLButtonElement,
    Event: browser.Event,
    MouseEvent: browser.MouseEvent,
    FormData: browser.FormData,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
    __messages: {
      'auth.startMfaSetup': 'Start setup',
      'auth.startingMfaSetup': 'Starting…',
      'auth.mfaEnrollmentReady': 'No security change happens until you start setup.',
      'auth.mfaChallengeRequired': 'Confirm your existing authenticator before changing MFA setup.',
      'auth.mfa.enroll.states.challengeRequired':
        'Confirm your existing authenticator before changing MFA setup.',
      'auth.completeMfaChallenge': 'Complete MFA challenge',
      'auth.mfaEnrollmentUnavailable':
        'Setup availability could not be confirmed. Refresh before continuing.',
      'auth.cancelMfaSetup': 'Cancel setup',
      'auth.cancellingMfaSetup': 'Cancelling…',
      'auth.mfaEnrollmentCancelled': 'Setup was cancelled.',
      'auth.totpQrAlt': 'QR code for authenticator setup',
      'auth.cannotScan': "Can't scan? Enter secret manually",
      'auth.twoFactorCode': '6-digit code',
      'auth.verifying': 'Verifying…',
      'auth.enableTwoFactor': 'Enable two-factor',
      'auth.recoveryCodesSaved': "I've saved them — continue",
      'auth.longCopy.recoveryCodesIntro':
        'Save these one-time recovery codes somewhere safe. Each works exactly once.',
      'errors.mfaEnrollmentFailed': 'Could not start enrollment',
      'errors.mfaEnrollmentRateLimited': 'Too many attempts. Wait before trying again.',
      'errors.mfaEnrollmentCleanupFailed':
        'Setup could not be cancelled safely. Refresh before retrying.',
      'errors.mfaEnrollmentStateUncertain':
        'Setup status could not be confirmed. Refresh before retrying.',
      'errors.verificationFailed': 'Verification failed',
    },
    __unenrollCalls: [] as string[],
    __unenrollResult: { error: null } as { error: unknown },
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  }

  async function renderCard(props: Record<string, unknown> = {}) {
    const [{ act, createElement }, { createRoot }, { MfaEnrollCard }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./MfaEnrollCard'),
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(MfaEnrollCard, props)));
    return { act, container, root };
  }

  async function assertFeedbackFocused(
    act: (callback: () => void | Promise<void>) => Promise<void>,
    container: HTMLElement,
  ) {
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    assert.equal(document.activeElement, container.querySelector('[role=alert]'));
  }

  test('mount is non-mutating and presents an explicit enrollment action', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    };
    const { act, container, root } = await renderCard();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    assert.equal(calls, 0);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    assert.equal(button.textContent, 'Start setup');
    assert.equal(button.type, 'button');
    assert.equal(button.disabled, false);
    assert.equal(container.querySelector('img'), null);
    assert.match(container.textContent ?? '', /No security change happens/u);
    await act(() => root.unmount());
    container.remove();
  });

  test('explicit action has an accessible pending state and reveals enrollment details once', async () => {
    const request = deferred<Response>();
    const paths: string[] = [];
    globalThis.fetch = async (input, init) => {
      paths.push(String(input));
      assert.equal(init?.method, 'POST');
      return request.promise;
    };
    const { act, container, root } = await renderCard();
    const button = container.querySelector<HTMLButtonElement>('button')!;
    await act(() => {
      button.click();
      button.click();
    });
    assert.deepEqual(paths, ['/api/v1/auth/mfa/enroll']);
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.textContent, 'Starting…');
    await act(async () =>
      request.resolve(
        Response.json({
          factorId: 'factor-1',
          qrCode: 'data:image/svg+xml,qr',
          uri: 'otpauth://totp/example',
          secret: 'SECRET',
        }),
      ),
    );
    assert.equal(
      container.querySelector('img')?.getAttribute('alt'),
      'QR code for authenticator setup',
    );
    assert.equal(container.querySelector('input[name=code]')?.getAttribute('inputmode'), 'numeric');
    assert.equal(paths.length, 1);
    await act(() => root.unmount());
    container.remove();
  });

  test('failed enrollment reports an error and restores the explicit retry action', async () => {
    globalThis.fetch = async () =>
      Response.json(
        { code: 'MFA_ENROLL_FAILED', error: 'private provider diagnostic' },
        { status: 400 },
      );
    const { act, container, root } = await renderCard();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    assert.equal(
      container.querySelector('[role=alert]')?.textContent,
      'Could not start enrollment',
    );
    await assertFeedbackFocused(act, container);
    assert.doesNotMatch(container.textContent ?? '', /private provider diagnostic/u);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-busy'), 'false');
    assert.equal(button.textContent, 'Start setup');
    await act(() => root.unmount());
    container.remove();
  });

  test('challenge-required responses and existing enrollment offer only the challenge route', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({ code: 'AAL2_REQUIRED' }, { status: 403 });
    };
    const first = await renderCard();
    await first.act(async () =>
      first.container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    assert.equal(first.container.querySelector('a')?.getAttribute('href'), '/mfa/challenge');
    assert.equal(first.container.querySelector('button'), null);
    assert.match(first.container.textContent ?? '', /Confirm your existing authenticator/u);
    await first.act(() => first.root.unmount());
    first.container.remove();

    const existing = await renderCard({ challengeRequired: true });
    assert.equal(existing.container.querySelector('a')?.getAttribute('href'), '/mfa/challenge');
    assert.equal(existing.container.querySelector('button'), null);
    assert.equal(calls, 1);
    await existing.act(() => existing.root.unmount());
    existing.container.remove();
  });

  test('uncertain server factor state fails closed without an enrollment action', async () => {
    const unavailable = await renderCard({ enrollmentUnavailable: true });
    assert.equal(unavailable.container.querySelector('button'), null);
    assert.equal(unavailable.container.querySelector('a'), null);
    assert.equal(
      unavailable.container.querySelector('[role=alert]')?.textContent,
      'Setup availability could not be confirmed. Refresh before continuing.',
    );
    await unavailable.act(() => unavailable.root.unmount());
    unavailable.container.remove();
  });

  test('transport and malformed-success failures stay localized and clean known factors', async () => {
    globalThis.fetch = async () => {
      throw new Error('private transport diagnostic');
    };
    const transport = await renderCard();
    await transport.act(async () =>
      transport.container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    assert.equal(
      transport.container.querySelector('[role=alert]')?.textContent,
      'Setup status could not be confirmed. Refresh before retrying.',
    );
    await assertFeedbackFocused(transport.act, transport.container);
    assert.equal(transport.container.querySelector('button'), null);
    assert.doesNotMatch(transport.container.textContent ?? '', /private transport diagnostic/u);
    await transport.act(() => transport.root.unmount());
    transport.container.remove();

    (globalThis as typeof globalThis & { __unenrollCalls: string[] }).__unenrollCalls = [];
    globalThis.fetch = async () =>
      Response.json({ factorId: 'orphan-factor', qrCode: null, secret: 'SECRET' });
    const malformed = await renderCard();
    await malformed.act(async () =>
      malformed.container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    assert.deepEqual(
      (globalThis as typeof globalThis & { __unenrollCalls: string[] }).__unenrollCalls,
      ['orphan-factor'],
    );
    assert.equal(
      malformed.container.querySelector('[role=alert]')?.textContent,
      'Could not start enrollment',
    );
    assert.equal(malformed.container.querySelector<HTMLButtonElement>('button')?.disabled, false);
    await malformed.act(() => malformed.root.unmount());
    malformed.container.remove();
  });

  test('malformed success without a usable factor id fails closed', async () => {
    globalThis.fetch = async () =>
      Response.json({ factorId: null, qrCode: 'data:image/svg+xml,qr', secret: 'SECRET' });
    const malformed = await renderCard();
    await malformed.act(async () =>
      malformed.container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    assert.equal(
      malformed.container.querySelector('[role=alert]')?.textContent,
      'Setup status could not be confirmed. Refresh before retrying.',
    );
    assert.equal(malformed.container.querySelector('button'), null);
    await malformed.act(() => malformed.root.unmount());
    malformed.container.remove();
  });

  test('cancel removes the created unverified factor before setup can restart', async () => {
    (globalThis as typeof globalThis & { __unenrollCalls: string[] }).__unenrollCalls = [];
    globalThis.fetch = async () =>
      Response.json({
        factorId: 'factor-to-remove',
        qrCode: 'data:image/svg+xml,qr',
        secret: 'SECRET',
      });
    const { act, container, root } = await renderCard();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    const cancel = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Cancel setup',
    )!;
    await act(async () => cancel.click());
    assert.deepEqual(
      (globalThis as typeof globalThis & { __unenrollCalls: string[] }).__unenrollCalls,
      ['factor-to-remove'],
    );
    assert.equal(container.querySelector('img'), null);
    assert.equal(container.querySelector<HTMLButtonElement>('button')?.textContent, 'Start setup');
    await act(() => root.unmount());
    container.remove();
  });

  test('cleanup failure is terminal and hides the QR secret and actions', async () => {
    const runtime = globalThis as typeof globalThis & {
      __unenrollResult: { error: unknown };
    };
    runtime.__unenrollResult = { error: new Error('private cleanup diagnostic') };
    globalThis.fetch = async () =>
      Response.json({
        factorId: 'factor-cleanup-fails',
        qrCode: 'data:image/svg+xml,qr',
        secret: 'PRIVATE-SECRET',
      });
    const { act, container, root } = await renderCard();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    const cancel = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Cancel setup',
    )!;
    await act(async () => cancel.click());
    assert.equal(
      container.querySelector('[role=alert]')?.textContent,
      'Setup could not be cancelled safely. Refresh before retrying.',
    );
    assert.equal(container.querySelector('img'), null);
    assert.doesNotMatch(container.textContent ?? '', /PRIVATE-SECRET/u);
    assert.equal(container.querySelector('button'), null);
    runtime.__unenrollResult = { error: null };
    await act(() => root.unmount());
    container.remove();
  });

  async function renderVerification(response: () => Promise<Response>) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          factorId: 'verify-factor',
          qrCode: 'data:image/svg+xml,qr',
          secret: 'SECRET',
        });
      }
      return response();
    };
    const rendered = await renderCard();
    await rendered.act(async () =>
      rendered.container.querySelector<HTMLButtonElement>('button')!.click(),
    );
    const input = rendered.container.querySelector<HTMLInputElement>('input[name=code]')!;
    input.value = '123456';
    return { ...rendered, input };
  }

  test('verification success validates recovery codes and guards duplicate submit', async () => {
    const verify = deferred<Response>();
    let verificationCalls = 0;
    const rendered = await renderVerification(async () => {
      verificationCalls += 1;
      return verify.promise;
    });
    const form = rendered.container.querySelector('form')!;
    await rendered.act(() => {
      form.dispatchEvent(
        new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
      );
      form.dispatchEvent(
        new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
      );
    });
    assert.equal(verificationCalls, 1);
    const verifyButton =
      rendered.container.querySelector<HTMLButtonElement>('button[type=submit]')!;
    assert.equal(verifyButton.getAttribute('aria-busy'), 'true');
    await rendered.act(async () =>
      verify.resolve(Response.json({ recoveryCodes: ['one', 'two'] })),
    );
    assert.match(rendered.container.textContent ?? '', /one/u);
    assert.equal(rendered.container.querySelector('img'), null);
    await rendered.act(() => rendered.root.unmount());
    rendered.container.remove();
  });

  test('known verification errors remain retryable without exposing server copy', async () => {
    const rendered = await renderVerification(async () =>
      Response.json(
        { code: 'MFA_INVALID_CODE', error: 'private verification diagnostic' },
        { status: 401 },
      ),
    );
    await rendered.act(async () =>
      rendered.container
        .querySelector('form')!
        .dispatchEvent(
          new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
        ),
    );
    assert.equal(
      rendered.container.querySelector('[role=alert]')?.textContent,
      'Verification failed',
    );
    await assertFeedbackFocused(rendered.act, rendered.container);
    assert.doesNotMatch(rendered.container.textContent ?? '', /private verification diagnostic/u);
    assert.ok(rendered.container.querySelector('img'));
    await rendered.act(() => rendered.root.unmount());
    rendered.container.remove();
  });

  test('verification transport and malformed success become terminal state uncertainty', async () => {
    for (const response of [
      async () => Promise.reject(new Error('private transport failure')),
      async () => Response.json({ recoveryCodes: [1, 2] }),
    ]) {
      const rendered = await renderVerification(response);
      await rendered.act(async () =>
        rendered.container
          .querySelector('form')!
          .dispatchEvent(
            new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
          ),
      );
      assert.equal(
        rendered.container.querySelector('[role=alert]')?.textContent,
        'Setup status could not be confirmed. Refresh before retrying.',
      );
      await assertFeedbackFocused(rendered.act, rendered.container);
      assert.equal(rendered.container.querySelector('img'), null);
      assert.equal(rendered.container.querySelector('button'), null);
      await rendered.act(() => rendered.root.unmount());
      rendered.container.remove();
    }
  });

  test('stale factor verification cleans up before returning to a fresh explicit start', async () => {
    (globalThis as typeof globalThis & { __unenrollCalls: string[] }).__unenrollCalls = [];
    const rendered = await renderVerification(async () =>
      Response.json({ code: 'MFA_CHALLENGE_FAILED' }, { status: 400 }),
    );
    await rendered.act(async () =>
      rendered.container
        .querySelector('form')!
        .dispatchEvent(
          new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
        ),
    );
    assert.deepEqual(
      (globalThis as typeof globalThis & { __unenrollCalls: string[] }).__unenrollCalls,
      ['verify-factor'],
    );
    assert.equal(rendered.container.querySelector('img'), null);
    assert.equal(
      rendered.container.querySelector<HTMLButtonElement>('button')?.textContent,
      'Start setup',
    );
    await rendered.act(() => rendered.root.unmount());
    rendered.container.remove();
  });
}
