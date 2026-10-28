import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const fixturePath = join(process.cwd(), 'supabase/tests/p3_10_operational_runtime.sql');

test('operational runtime fixture is transactional and covers the 0114-0116 boundaries', () => {
  assert.ok(existsSync(fixturePath), 'operational runtime SQL fixture is missing');
  const sql = readFileSync(fixturePath, 'utf8').toLowerCase();

  assert.match(sql, /\bbegin;/u);
  assert.match(sql, /\brollback;\s*$/u);
  assert.match(sql, /public\.write_operational_projection/u);
  assert.match(sql, /'state',\s*'replayed'/u);
  assert.match(sql, /runtime_reference_scope_denied/u);
  assert.match(sql, /public\.cancel_leased_event_job/u);
  assert.match(sql, /set local role authenticated/u);
  assert.match(sql, /permission denied/u);
  assert.match(sql, /runtime_fixture_assertions=\d+/u);
});
