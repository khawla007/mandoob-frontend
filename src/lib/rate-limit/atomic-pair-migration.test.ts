import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261031005000_0125_atomic_rate_limit_pair.sql',
);

test('atomic pair migration locks both buckets and exposes only a redacted service-role RPC', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /create or replace function public\.rate_limit_consume_pair\(/iu);
  assert.match(sql, /returns jsonb/iu);
  assert.match(sql, /insert into public\.rate_limits[\s\S]*on conflict \(key\) do nothing/iu);
  assert.match(
    sql,
    /from public\.rate_limits[\s\S]*where limits\.key in \(p_first_key, p_second_key\)[\s\S]*order by limits\.key[\s\S]*for update/iu,
  );
  assert.match(sql, /first_allowed/iu);
  assert.match(sql, /second_allowed/iu);
  assert.doesNotMatch(sql, /execute\s+format|\bdynamic\b/iu);
  assert.match(
    sql,
    /revoke execute on function public\.rate_limit_consume_pair\([\s\S]*from public, anon, authenticated/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.rate_limit_consume_pair\([\s\S]*to service_role/iu,
  );
});

test('Task 3 inventory owns the atomic pair artifacts and Task 6 reserves migration 0126', () => {
  const plan = readFileSync(
    join(process.cwd(), 'docs/superpowers/plans/2026-10-31-phase-3-launch-security-wave-1.md'),
    'utf8',
  );

  for (const artifact of [
    'src/lib/rate-limit/legacy-route-unavailable.test.ts',
    'src/lib/rate-limit/atomic-pair-migration.test.ts',
    'supabase/migrations/20261031005000_0125_atomic_rate_limit_pair.sql',
    'supabase/tests/atomic_rate_limit_pair.sql',
  ]) {
    assert.match(plan, new RegExp(artifact.replaceAll('.', '\\.')));
  }
  assert.doesNotMatch(plan, /20261031010000_0125_launch_security_wave_1\.sql/u);
  assert.match(plan, /20261031010000_0126_launch_security_wave_1\.sql/u);
});
