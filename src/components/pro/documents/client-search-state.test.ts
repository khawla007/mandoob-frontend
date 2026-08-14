import assert from 'node:assert/strict';
import test from 'node:test';

test('client search state submits only a selected canonical id and clears stale selection on edit', async () => {
  let loaded: typeof import('./client-search-state') | undefined;
  try {
    loaded = await import('./client-search-state');
  } catch {}
  assert.ok(loaded);
  if (!loaded) return;

  const selected = {
    id: '11111111-1111-4111-8111-111111111111',
    companyName: 'Acme Client',
  };
  const state = loaded.createClientSearchState(selected, [selected]);
  assert.equal(loaded.clientSearchSubmissionValue(state), selected.id);
  assert.equal(state.text, selected.companyName);

  const edited = loaded.changeClientSearchText(state, 'Acme Client x');
  assert.equal(edited.selected, null);
  assert.equal(loaded.clientSearchSubmissionValue(edited), '');

  const chosen = loaded.selectClientSearchOption(edited, selected);
  assert.equal(chosen.text, selected.companyName);
  assert.equal(loaded.clientSearchSubmissionValue(chosen), selected.id);
});

test('client search result state remains bounded and exposes listbox results', async () => {
  const { createClientSearchState, receiveClientSearchResults } =
    await import('./client-search-state');
  const options = Array.from({ length: 60 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    companyName: `Client ${index}`,
  }));
  const state = receiveClientSearchResults(createClientSearchState(null, []), options);
  assert.equal(state.results.length, 50);
  assert.equal(state.open, true);
});

test('client search reconciles a later route selection and clears a stale canonical id on reset', async () => {
  const {
    clientSearchPropsRevision,
    createClientSearchState,
    reconcileClientSearchProps,
    clientSearchSubmissionValue,
  } = await import('./client-search-state');
  const first = {
    id: '11111111-1111-4111-8111-111111111111',
    companyName: 'First Client',
  };
  const second = {
    id: '22222222-2222-4222-8222-222222222222',
    companyName: 'Second Client',
  };

  const initial = createClientSearchState(first, [first, second]);
  const changed = reconcileClientSearchProps(initial, second, [second]);
  assert.equal(changed.text, second.companyName);
  assert.equal(clientSearchSubmissionValue(changed), second.id);

  const reset = reconcileClientSearchProps(changed, null, [first, second]);
  assert.equal(reset.text, '');
  assert.equal(clientSearchSubmissionValue(reset), '');
  assert.equal(reset.open, false);
  assert.notEqual(
    clientSearchPropsRevision(second, [second]),
    clientSearchPropsRevision(null, [first, second]),
  );
});

test('client search ignores results returned for text that has since changed', async () => {
  const { changeClientSearchText, createClientSearchState, receiveClientSearchResults } =
    await import('./client-search-state');
  const searching = changeClientSearchText(createClientSearchState(null, []), 'Acme');
  const edited = changeClientSearchText(searching, 'Acme Holdings');
  const stale = receiveClientSearchResults(edited, 'Acme', [
    {
      id: '11111111-1111-4111-8111-111111111111',
      companyName: 'Acme LLC',
    },
  ]);

  assert.deepEqual(stale, edited);
});

test('request generation rejects stale success and stale failure but accepts the current response', async () => {
  const {
    beginClientSearchRequest,
    createClientSearchRequestGate,
    invalidateClientSearchRequest,
    isCurrentClientSearchResponse,
  } = await import('./client-search-state');

  let gate = createClientSearchRequestGate('Acme');
  const first = beginClientSearchRequest(gate, 'Acme');
  gate = first.gate;
  gate = invalidateClientSearchRequest(gate, 'Acme Holdings');

  assert.equal(isCurrentClientSearchResponse(gate, first.request, 'success'), false);
  assert.equal(isCurrentClientSearchResponse(gate, first.request, 'failure'), false);

  const current = beginClientSearchRequest(gate, 'Acme Holdings');
  gate = current.gate;
  assert.equal(isCurrentClientSearchResponse(gate, current.request, 'success'), true);
  assert.equal(isCurrentClientSearchResponse(gate, current.request, 'failure'), true);
});

test('editing A to B immediately releases A pending state while deferred requests overlap', async () => {
  const {
    beginClientSearchRequest,
    createClientSearchRequestGate,
    invalidateClientSearchRequest,
    isClientSearchRequestPending,
    isCurrentClientSearchResponse,
  } = await import('./client-search-state');
  let releaseA!: (value: 'failure') => void;
  let releaseB!: (value: 'success') => void;
  const deferredA = new Promise<'failure'>((resolve) => {
    releaseA = resolve;
  });
  const deferredB = new Promise<'success'>((resolve) => {
    releaseB = resolve;
  });

  let gate = createClientSearchRequestGate('A');
  const first = beginClientSearchRequest(gate, 'A');
  gate = first.gate;
  assert.equal(isClientSearchRequestPending(gate, first.request), true);

  gate = invalidateClientSearchRequest(gate, 'B');
  assert.equal(isClientSearchRequestPending(gate, first.request), false);

  const second = beginClientSearchRequest(gate, 'B');
  gate = second.gate;
  assert.equal(isClientSearchRequestPending(gate, second.request), true);

  const staleFailure = deferredA.then((outcome) =>
    isCurrentClientSearchResponse(gate, first.request, outcome),
  );
  const currentSuccess = deferredB.then((outcome) =>
    isCurrentClientSearchResponse(gate, second.request, outcome),
  );
  releaseA('failure');
  assert.equal(await staleFailure, false);
  assert.equal(isClientSearchRequestPending(gate, second.request), true);
  releaseB('success');
  assert.equal(await currentSuccess, true);
});

test('client search action failures retain their shared localized message keys', async () => {
  const { resolveClientSearchActionError } = await import('./client-search-state');
  const errors = {
    'documents.errors.validation': 'تحقق من عبارة البحث.',
    'documents.errors.forbidden': 'ليست لديك صلاحية البحث.',
    'documents.errors.unexpected': 'تعذر إكمال البحث.',
  };

  assert.equal(
    resolveClientSearchActionError('documents.errors.validation', errors),
    errors['documents.errors.validation'],
  );
  assert.equal(
    resolveClientSearchActionError('documents.errors.forbidden', errors),
    errors['documents.errors.forbidden'],
  );
  assert.equal(
    resolveClientSearchActionError('unknown.key', errors),
    errors['documents.errors.unexpected'],
  );
});
