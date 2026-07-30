import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('password reset emails return through the existing callback route', async () => {
  const route = await readFile(
    path.resolve(process.cwd(), 'src/app/api/v1/auth/forgot-password/route.ts'),
    'utf8',
  );

  assert.match(route, /\/callback\?next=\/reset-password/);
  assert.doesNotMatch(route, /\/auth\/callback\?next=\/reset-password/);
});
