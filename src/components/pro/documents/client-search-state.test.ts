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
