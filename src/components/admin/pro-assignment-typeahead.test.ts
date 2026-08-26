import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./ProAssignmentTypeahead.tsx', import.meta.url), 'utf8');
const form = readFileSync(new URL('./CompanyAssignmentForm.tsx', import.meta.url), 'utf8');

test('assignment uses a bounded server-backed accessible typeahead without a client superset', () => {
  assert.match(form, /<ProAssignmentTypeahead/u);
  assert.doesNotMatch(form, /availablePros/u);
  assert.match(component, /query\.trim\(\)\.length < 2/u);
  assert.match(component, /setTimeout[\s\S]*250/u);
  assert.match(component, /AbortController/u);
  assert.match(component, /if \(selectedId\) return/u);
  assert.match(component, /limit=20/u);
  assert.match(component, /role="combobox"/u);
  assert.match(component, /aria-controls/u);
  assert.match(component, /aria-activedescendant/u);
  assert.match(component, /role="listbox"/u);
  assert.match(component, /role="option"/u);
  assert.match(component, /onKeyDown/u);
  assert.match(component, /typeahead\.loading/u);
  assert.match(component, /typeahead\.empty/u);
  assert.match(component, /typeahead\.error/u);
  assert.match(component, /eligibility\.codes/u);
  assert.match(form, /label=\{[\s\S]*replacementProLabel/u);
});
