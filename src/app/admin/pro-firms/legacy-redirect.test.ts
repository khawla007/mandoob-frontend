import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('legacy tenant UUID bookmark redirects to the validated company tenant filter', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/admin/pro-firms/[id]/page.tsx'), 'utf8');
  assert.match(source, /isUuid\(id\)/u);
  assert.match(source, /\/admin\/companies\?tenant=\$\{encodeURIComponent\(id\)\}/u);
  assert.doesNotMatch(source, /\/admin\/companies\/\$\{id\}/u);
});
