import assert from 'node:assert/strict';
import test from 'node:test';

test('resolvePrimaryDocumentAction chooses exactly one next action for every queue state', async () => {
  let loaded: typeof import('./document-action-state') | undefined;
  try {
    loaded = await import('./document-action-state');
  } catch {
    // The first TDD run intentionally reaches this branch before implementation.
  }
  assert.ok(loaded);
  if (!loaded) return;

  const base = {
    entityKind: 'document' as const,
    documentId: '44444444-4444-4444-8444-444444444444',
    versionId: '77777777-7777-4777-8777-777777777777',
    reviewStatus: null,
  };
  assert.equal(loaded.resolvePrimaryDocumentAction({ ...base, entityKind: 'request' }), 'company');
  assert.equal(
    loaded.resolvePrimaryDocumentAction({ ...base, reviewStatus: 'pending' }),
    'approve',
  );
  assert.equal(loaded.resolvePrimaryDocumentAction({ ...base, reviewStatus: 'approved' }), 'open');
  assert.equal(
    loaded.resolvePrimaryDocumentAction({ ...base, reviewStatus: 'rejected' }),
    'company',
  );
  assert.equal(loaded.resolvePrimaryDocumentAction({ ...base, versionId: null }), 'history');
  assert.equal(
    loaded.resolvePrimaryDocumentAction({
      ...base,
      documentId: null,
      versionId: null,
    }),
    'company',
  );
});

test('review feedback has one accessible target and moves inside an open reject dialog', async () => {
  const { resolveReviewFeedbackTarget } = await import('./document-action-state');
  assert.equal(resolveReviewFeedbackTarget(false), 'row');
  assert.equal(resolveReviewFeedbackTarget(true), 'dialog');
});
