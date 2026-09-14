import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('Legal route separates unavailable from true missing and preserves the public component', () => {
  assert.match(source, /resolveLegalPageState/u);
  assert.match(source, /status === 'missing'[\s\S]*notFound\(\)/u);
  assert.match(source, /status === 'unavailable'/u);
  assert.match(source, /PublicContentState/u);
  assert.match(source, /<PublicCmsPage page=\{state\.data\} kind="legal"/u);
});

test('Legal route serializes approved schema safely and never renders CMS script slots', () => {
  assert.match(source, /serializeJsonLd/u);
  assert.doesNotMatch(source, /scriptHead|scriptBodyStart|scriptBodyEnd/u);
});
