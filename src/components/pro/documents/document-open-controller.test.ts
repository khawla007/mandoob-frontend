import assert from 'node:assert/strict';
import test from 'node:test';

test('popup controller stops before the server action when the browser blocks the popup', async () => {
  let loaded: typeof import('./document-open-controller') | undefined;
  try {
    loaded = await import('./document-open-controller');
  } catch {}
  assert.ok(loaded);
  if (!loaded) return;

  let actionCalls = 0;
  let blocked = 0;
  const outcome = await loaded.openDocumentVersionWithPopup({
    openPopup: () => null,
    loadUrl: async () => {
      actionCalls += 1;
      return { ok: true, url: 'https://storage.test/signed' };
    },
    onBlocked: () => {
      blocked += 1;
    },
    onFailure: () => assert.fail('blocked popup must not report an action failure'),
  });

  assert.equal(outcome, 'blocked');
  assert.equal(actionCalls, 0);
  assert.equal(blocked, 1);
});

test('popup controller pre-opens synchronously, detaches opener, and navigates on success', async () => {
  const { openDocumentVersionWithPopup } = await import('./document-open-controller');
  const events: string[] = [];
  const popup = {
    opener: {} as unknown,
    location: { replace: (url: string) => events.push(`replace:${url}`) },
    close: () => events.push('close'),
  };
  let resolveAction: ((value: { ok: true; url: string }) => void) | undefined;
  const promise = openDocumentVersionWithPopup({
    openPopup: () => {
      events.push('open');
      return popup;
    },
    loadUrl: () => {
      events.push('action');
      return new Promise((resolve) => {
        resolveAction = resolve;
      });
    },
    onBlocked: () => assert.fail('popup was available'),
    onFailure: () => assert.fail('action succeeded'),
  });
  assert.deepEqual(events, ['open', 'action']);
  assert.equal(popup.opener, null);
  resolveAction?.({ ok: true, url: 'https://storage.test/signed' });

  assert.equal(await promise, 'opened');
  assert.deepEqual(events, ['open', 'action', 'replace:https://storage.test/signed']);
});

test('popup controller closes the placeholder and reports only a stable failure key', async () => {
  const { openDocumentVersionWithPopup } = await import('./document-open-controller');
  const failures: string[] = [];
  let closed = 0;
  const outcome = await openDocumentVersionWithPopup({
    openPopup: () => ({
      opener: null,
      location: { replace: () => assert.fail('failed action cannot navigate') },
      close: () => {
        closed += 1;
      },
    }),
    loadUrl: async () => ({ ok: false, messageKey: 'documents.errors.openFailed' }),
    onBlocked: () => assert.fail('popup was available'),
    onFailure: (key) => failures.push(key),
  });

  assert.equal(outcome, 'failed');
  assert.equal(closed, 1);
  assert.deepEqual(failures, ['documents.errors.openFailed']);
});
