import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeP112Canonical } from './canonical';

test('normalizes equivalent root canonicals without relaxing origin, query, or hash', () => {
  assert.equal(normalizeP112Canonical('https://mandoob.ae'), '/');
  assert.equal(normalizeP112Canonical('https://mandoob.ae/'), '/');
  assert.equal(normalizeP112Canonical('/about'), '/about');
  assert.throws(() => normalizeP112Canonical('https://example.invalid/'), /canonical rejected/u);
  assert.throws(() => normalizeP112Canonical('/about?noise=1'), /canonical rejected/u);
  assert.throws(() => normalizeP112Canonical('/about#noise'), /canonical rejected/u);
});
