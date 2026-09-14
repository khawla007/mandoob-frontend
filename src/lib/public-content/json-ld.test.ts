import assert from 'node:assert/strict';
import test from 'node:test';

import { hasJsonLdContent, serializeJsonLd } from './json-ld';

test('JSON-LD serialization escapes script-breakout characters', () => {
  const serialized = serializeJsonLd({ headline: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(serialized, /</u);
  assert.match(serialized, /\\u003c\/script>/u);
  assert.deepEqual(JSON.parse(serialized), {
    headline: '</script><script>alert(1)</script>',
  });
});

test('renders only non-empty JSON-LD objects', () => {
  assert.equal(hasJsonLdContent(null), false);
  assert.equal(hasJsonLdContent({}), false);
  assert.equal(hasJsonLdContent({ '@type': 'WebPage' }), true);
});
