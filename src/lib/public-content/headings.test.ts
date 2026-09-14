import assert from 'node:assert/strict';
import test from 'node:test';

import { headingAnchor, shouldShowTableOfContents } from './headings';

test('builds deterministic safe heading anchors', () => {
  assert.equal(headingAnchor('  Cost, tax & approvals  '), 'cost-tax-and-approvals');
  assert.equal(headingAnchor('<script>'), 'section');
});

test('shows a table of contents only for sufficiently long content', () => {
  assert.equal(shouldShowTableOfContents(['One', 'Two']), false);
  assert.equal(shouldShowTableOfContents(['One', 'Two', 'Three']), true);
});
