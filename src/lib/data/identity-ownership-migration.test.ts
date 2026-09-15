import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260916010000_0088_identity_metadata_trigger_hardening.sql',
);

test('profile metadata trigger has a fixed search path and a narrow execution boundary', () => {
  const source = readFileSync(migrationPath, 'utf8');

  assert.match(source, /security definer\s+set search_path = ''/iu);
  assert.match(
    source,
    /revoke all on function public\.sync_profile_to_auth_metadata\(\) from public, anon, authenticated/iu,
  );
  assert.match(
    source,
    /grant execute on function public\.sync_profile_to_auth_metadata\(\) to service_role/iu,
  );
  assert.match(
    source,
    /alter function public\.sync_profile_to_auth_metadata\(\) owner to postgres/iu,
  );
  assert.match(source, /coalesce\(auth_user\.raw_app_meta_data/iu);
  assert.doesNotMatch(source, /pg_catalog\.coalesce/iu);
  assert.match(source, /pg_catalog\.jsonb_build_object/iu);
});
