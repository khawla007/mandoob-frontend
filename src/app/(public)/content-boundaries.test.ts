import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public missing boundary preserves HTTP status while shared links own pending presentation', async () => {
  const loadingUrl = new URL('./loading.tsx', import.meta.url);
  const missing = await readFile(new URL('./not-found.tsx', import.meta.url), 'utf8');
  const pending = await readFile(
    new URL('../../components/site/PublicLinkPendingIndicator.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(existsSync(loadingUrl), false);
  assert.match(missing, /Page not found/);
  assert.match(missing, /href="\/"/);
  assert.match(
    missing,
    /export const metadata[\s\S]*robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/u,
  );
  assert.doesNotMatch(missing, /window\.|document\.|fetch\(/);
  assert.match(pending, /useLinkStatus/u);
  assert.match(pending, /role="status"/u);
  assert.match(pending, /Loading page/u);
});
