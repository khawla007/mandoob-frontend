import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('apply page uses only the strict P1.08 handoff parser', () => {
  assert.match(page, /parseEstimatorApplicationHandoff/);
  assert.doesNotMatch(page, /normalizeEstimatorHandoff|QuestionnaireAnswers/);
});

test('demo outcome is selected server-side and never from query input', () => {
  assert.match(page, /MANDOOB_P109_DEMO_OUTCOME/);
  assert.doesNotMatch(page, /params\.get\(['"](?:outcome|demo)/);
});
