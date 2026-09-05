import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public loading and missing boundaries stay inside the shared shell', async () => {
  const [loading, missing] = await Promise.all([
    readFile(new URL('./loading.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./not-found.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(loading, /PublicContentLoading/);
  assert.match(missing, /Page not found/);
  assert.match(missing, /href="\/"/);
  assert.doesNotMatch(`${loading}${missing}`, /window\.|document\.|fetch\(/);
});
