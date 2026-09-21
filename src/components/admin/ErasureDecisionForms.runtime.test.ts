import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Window } from 'happy-dom';

if (process.env.ERASURE_DECISION_CHILD === '1') {
  const browser = new Window({ url: 'https://app.example.test/admin/erasure-requests/request-id' });
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLFormElement: browser.HTMLFormElement,
    Event: browser.Event,
    FormData: browser.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  test('erasure decisions cancel when dismissed and dispatch when confirmed', async () => {
    const [{ createElement, act }, { createRoot }, { ErasureDecisionForms }, messages] =
      await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('./ErasureDecisionForms'),
        import('@/messages/en.json').then((module) => module.default),
      ]);
    const prompts: string[] = [];
    Object.assign(globalThis, {
      confirm: (message: string) => {
        prompts.push(message);
        return false;
      },
    });
    let actions = 0;
    let submittedRequestId: FormDataEntryValue | null = null;
    const action = async (formData: FormData) => {
      actions += 1;
      submittedRequestId = formData.get('requestId');
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        createElement(ErasureDecisionForms, {
          requestId: '11111111-1111-4111-8111-111111111111',
          canReview: true,
          approveLabel: messages.admin.erasure.detail.approveExecute,
          rejectLabel: messages.admin.erasure.detail.rejectRequest,
          rejectionReasonLabel: messages.admin.erasure.detail.rejectionReason,
          confirmApprove: messages.admin.erasure.detail.confirmApprove,
          confirmReject: messages.admin.erasure.detail.confirmReject,
          approveAction: action,
          rejectAction: action,
        }),
      ),
    );
    const forms = [...container.querySelectorAll('form')];
    assert.equal(forms.length, 2);
    for (const form of forms) {
      const event = new browser.Event('submit', { bubbles: true, cancelable: true });
      await act(() => form.dispatchEvent(event as unknown as Event));
      assert.equal(event.defaultPrevented, true);
    }
    assert.equal(actions, 0);
    assert.deepEqual(prompts, [
      messages.admin.erasure.detail.confirmApprove,
      messages.admin.erasure.detail.confirmReject,
    ]);
    Object.assign(globalThis, { confirm: () => true });
    await act(async () => {
      forms[0].dispatchEvent(
        new browser.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event,
      );
    });
    assert.equal(actions, 1);
    assert.equal(submittedRequestId, '11111111-1111-4111-8111-111111111111');
    await act(() => root.unmount());
    container.remove();
  });
} else {
  test('erasure decision confirmation runtime behavior', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        env: { ...process.env, ERASURE_DECISION_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
