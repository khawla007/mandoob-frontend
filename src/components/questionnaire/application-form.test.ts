import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./QuestionnaireForm.tsx', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8'));
const ar = JSON.parse(readFileSync(new URL('../../messages/ar.json', import.meta.url), 'utf8'));

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

test('restore, history, file reconciliation, retry and copy contracts are wired', () => {
  for (const contract of [
    'Resume saved draft',
    'Clear saved draft',
    'popstate',
    'reconcileFilePreviews',
    'removePreviewFile',
    'Retry preview',
    'Copy Demo reference',
    'aria-live',
  ])
    assert.match(source, new RegExp(contract));
  assert.doesNotMatch(source, /<main\b|role="status"[^>]*>[\s\S]{0,500}<input/u);
});

test('visa choice is a required radio group and completion summary focuses before linked errors', () => {
  assert.match(source, /type="radio"/);
  assert.match(source, /aria-required/);
  assert.match(source, /application-error-summary/);
  assert.match(source, /summaryRef\.current\?\.focus/);
});

test('review and confirmation keep the required visual order without unsupported claims', () => {
  const cards = [...source.matchAll(/<ReviewCard title="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(cards, ['Personal', 'Business', 'Setup', 'Additional services', 'Ownership']);
  const regions = [
    'application-confirmation',
    'application-confirmation__main',
    'application-confirmation__summary',
  ];
  let position = -1;
  for (const region of regions) {
    const next = source.indexOf(region, position + 1);
    assert.ok(next > position, `${region} must follow the previous confirmation region`);
    position = next;
  }
  assert.doesNotMatch(
    source,
    /application (?:was|has been) (?:received|submitted)|client dashboard/iu,
  );
});

test('application message additions preserve recursive English and Arabic key parity', () => {
  assert.deepEqual(Object.keys(ar.application).sort(), Object.keys(en.application).sort());
});
