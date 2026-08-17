import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260818100000_0063_employee_passport_uniqueness.sql'),
  'utf8',
);

test('employee passport hashes are nullable and unique per company when present', () => {
  assert.match(migration, /add column passport_no_hash text null/i);
  assert.match(
    migration,
    /create unique index employee_company_passport_hash_unique[\s\S]*company_id, passport_no_hash[\s\S]*where passport_no_hash is not null/i,
  );
  assert.match(migration, /existing development rows remain null/i);
  assert.match(migration, /passport_no_hash is null or passport_no_hash ~ '\^\[a-f0-9\]\{64\}\$'/i);
});

test('employee mutations are revoked from browser roles and permissive write policy is removed', () => {
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.employees[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(migration, /drop policy if exists employees_pro_write on public\.employees/i);
  assert.doesNotMatch(
    migration,
    /create policy [^\n]+ on public\.employees for (?:all|insert|update|delete)/i,
  );
});

test('atomic employee role creation persists the server-derived passport hash', () => {
  assert.match(
    migration,
    /insert into public\.employees[\s\S]*passport_no_encrypted, passport_no_hash[\s\S]*p_role_data ->> 'passport_no_hash'/i,
  );
});

test('employee self passport RPC locks and updates only the asserted live ownership chain', () => {
  assert.match(
    migration,
    /create or replace function public\.update_employee_self_passport\([\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    migration,
    /from public\.profiles[\s\S]*id = p_actor_profile_id[\s\S]*tenant_id = p_expected_tenant_id[\s\S]*role::text = 'employee'[\s\S]*status::text = 'active'[\s\S]*for update/i,
  );
  assert.match(
    migration,
    /from public\.employees[\s\S]*profile_id = p_actor_profile_id[\s\S]*tenant_id = p_expected_tenant_id[\s\S]*company_id = p_expected_company_id[\s\S]*status::text = 'active'[\s\S]*for update/i,
  );
  assert.match(
    migration,
    /update public\.employees[\s\S]*passport_no_encrypted = p_passport_no_encrypted[\s\S]*passport_no_hash = p_passport_no_hash[\s\S]*where id = v_employee_id[\s\S]*returning id into v_employee_id/i,
  );
  assert.match(
    migration,
    /raise exception using errcode = '42501', message = 'EMPLOYEE_SCOPE_MISMATCH'/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.update_employee_self_passport\([\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.update_employee_self_passport\([\s\S]*to service_role/i,
  );
});
