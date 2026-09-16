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

test('individual Auth session revocation is ownership-bound and service-role-only', () => {
  const source = readFileSync(migrationPath, 'utf8');

  assert.match(
    source,
    /function public\.revoke_user_auth_session\(\s*p_user_id uuid,\s*p_session_id uuid\s*\)/iu,
  );
  assert.match(
    source,
    /delete from auth\.sessions[\s\S]*where session\.id = p_session_id[\s\S]*and session\.user_id = p_user_id/iu,
  );
  assert.match(source, /security definer\s+set search_path = ''/iu);
  assert.match(
    source,
    /revoke all on function public\.revoke_user_auth_session\(uuid, uuid\) from public, anon, authenticated/iu,
  );
  assert.match(
    source,
    /grant execute on function public\.revoke_user_auth_session\(uuid, uuid\) to service_role/iu,
  );
  assert.doesNotMatch(source, /pg_catalog\.exists/iu);
});

test('global Auth session revocation is user-bound and service-role-only', () => {
  const source = readFileSync(migrationPath, 'utf8');

  assert.match(source, /function public\.revoke_all_user_auth_sessions\(\s*p_user_id uuid\s*\)/iu);
  assert.match(source, /delete from auth\.sessions[\s\S]*where session\.user_id = p_user_id/iu);
  assert.match(source, /security definer\s+set search_path = ''/iu);
  assert.match(
    source,
    /revoke all on function public\.revoke_all_user_auth_sessions\(uuid\) from public, anon, authenticated/iu,
  );
  assert.match(
    source,
    /grant execute on function public\.revoke_all_user_auth_sessions\(uuid\) to service_role/iu,
  );
});
