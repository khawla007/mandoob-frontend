import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const path = 'supabase/migrations/20260916030000_0093_company_settings_transactions.sql';
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

test('settings transaction migration exists', () => assert.ok(sql, 'settings migration missing'));
test('settings authorization is locked and freshly checked before replay', () => {
  assert.match(sql, /lock_company_assignment_resources/);
  assert.match(sql, /public\.has_current_pro_credential\(p_actor_profile_id\)/);
  assert.match(sql, /tenant_id = p_tenant_id and role = 'pro' and status = 'active'/);
  assert.match(sql, /public\.tenants where id = p_tenant_id and status = 'active'/);
  assert.match(
    sql,
    /public\.company_profiles where id = p_company_id and tenant_id = p_tenant_id\s+and status not in \('suspended','churned'\)/,
  );
  const mutate = sql.slice(sql.indexOf('create function public.mutate_assigned_company_settings'));
  assert.ok(
    mutate.indexOf('authorize_assigned_company_settings') <
      mutate.indexOf('select * into v_replay'),
  );
});
test('replay uses normalized input and stable fingerprint, not randomized ciphertext', () => {
  assert.match(sql, /sha256\(pg_catalog\.convert_to\(jsonb_build_object\(/);
  assert.match(sql, /'secret_fingerprint', p_replacement_secret_fingerprint/);
  assert.match(sql, /SETTINGS_OPERATION_CONFLICT/);
  assert.match(sql, /STALE_SETTINGS_VERSION/);
  assert.match(sql, /primary key \(tenant_id, operation_id\)/);
});
test('all sections atomically preserve blank credentials, update version and audit', () => {
  assert.match(
    sql,
    /password_encrypted = coalesce\(p_replacement_secret_encrypted, public\.tenant_smtp_config\.password_encrypted\)/,
  );
  assert.match(
    sql,
    /access_token_encrypted = coalesce\(p_replacement_secret_encrypted, public\.tenant_whatsapp_config\.access_token_encrypted\)/,
  );
  assert.match(sql, /insert into public\.tenant_audit_log/);
  assert.match(sql, /version = version \+ 1/);
  assert.match(sql, /SETTINGS_CREDENTIAL_REQUIRED/);
});
test('redacted snapshot explicitly selects fields and grants only trusted service boundary', () => {
  const snapshot = sql.slice(
    sql.indexOf('create function public.read_assigned_company_settings'),
    sql.indexOf('create function public.mutate_assigned_company_settings'),
  );
  assert.match(snapshot, /'has_password'/);
  assert.match(snapshot, /'has_token'/);
  assert.doesNotMatch(snapshot, /to_jsonb\(s\)|to_jsonb\(w\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
});
test('database strictly validates complete section shape and HTTP(S) URLs', () => {
  assert.match(sql, /jsonb_object_keys/);
  assert.match(sql, /v_keys <> v_expected/);
  assert.match(sql, /https\?:\/\//);
  assert.match(sql, /jsonb_typeof\(p_input->'enabled'\) <> 'boolean'/);
  assert.match(sql, /octet_length\(p_input::text\) > 16384/);
});
test('HTTP URL authority validation rejects credentials, invalid hosts, brackets and ports', () => {
  assert.match(sql, /create function public\.is_valid_company_settings_http_url/);
  assert.match(sql, /public\.is_valid_company_settings_http_url\(v_value\)/);
  assert.match(sql, /pg_catalog\.family\(v_host::inet\) <> 6/);
  assert.match(sql, /v_port::integer not between 1 and 65535/);
  assert.match(sql, /v_authority ~ '@'/);
  assert.match(sql, /char_length\(v_host\) > 253/);
});
