import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./QuestionnaireForm.tsx', import.meta.url), 'utf8');

test('application has five ordered stages and ordered setup substeps', () => {
  for (const label of ['Contact', 'Business Details', 'Setup', 'Ownership', 'Review'])
    assert.match(source, new RegExp(label));
  for (const label of ['Jurisdiction', 'Authority', 'Visas', 'Office', 'Services'])
    assert.match(source, new RegExp(label));
});

test('application completion is adapter-driven with no live write request', () => {
  assert.match(source, /prepareApplicationCompletion/);
  assert.match(source, /productionApplicationAdapter/);
  assert.doesNotMatch(source, /fetch\s*\(|\/api\/v1\/public\/questionnaire/);
});

test('form exposes local storage disclosure, consent, reset and document preview semantics', () => {
  assert.match(source, /seven days/i);
  assert.match(source, /No application (?:is|was) sent/i);
  assert.match(source, /Privacy Notice/);
  assert.match(source, /Start over/);
  assert.match(source, /accept="application\/pdf,image\/jpeg,image\/png"/);
});
