import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('overview skeleton matches the hero, four/six instruments, and main/rail regions', async () => {
  const source = await readFile(
    new URL('./AdminCommandDashboardLoading.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /aria-busy="true"/u);
  assert.match(source, /admin-platform-signal/u);
  assert.match(source, /length: 4/u);
  assert.match(source, /length: 6/u);
  assert.match(source, /admin-signal-dashboard__main/u);
  assert.match(source, /admin-signal-dashboard__rail/u);
  assert.doesNotMatch(source, /Math\.random|LIVE/u);
});
