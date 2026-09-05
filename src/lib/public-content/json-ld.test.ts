import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './json-ld';

test('JSON-LD serialization escapes script-breakout characters', () => {
  const serialized = serializeJsonLd({ headline: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(serialized, /</u);
  assert.match(serialized, /\\u003c\/script>/u);
  assert.deepEqual(JSON.parse(serialized), {
    headline: '</script><script>alert(1)</script>',
  });
});
