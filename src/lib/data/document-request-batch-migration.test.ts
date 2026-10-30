import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const path = resolve(
  process.cwd(),
  'supabase/migrations/20260916041100_0103_document_request_batch_replay.sql',
);
const fixturePath = resolve(process.cwd(), 'supabase/tests/document_request_batch_replay.sql');
const contentionRunnerPath = resolve(
  process.cwd(),
  'supabase/tests/run_document_request_batch_assignment_contention.sh',
);

test('batch request migration is service-only, atomic, scoped and replay-safe', () => {
  const sql = readFileSync(path, 'utf8').replace(/\s+/gu, ' ');
  assert.match(
    sql,
    /alter table public\.document_requests add column if not exists custom_type_label text/iu,
  );
  assert.match(sql, /create table public\.document_request_batch_operations/iu);
  assert.match(sql, /operation_id uuid primary key/iu);
  assert.match(sql, /request_fingerprint text not null/iu);
  assert.match(sql, /request_ids jsonb not null/iu);
  assert.match(sql, /enable row level security/iu);
  assert.match(
    sql,
    /revoke all on table public\.document_request_batch_operations from public, anon, authenticated, service_role/iu,
  );
  assert.match(sql, /create or replace function public\.create_document_request_batch\(/iu);
  assert.match(sql, /security definer set search_path = ''/iu);
  assert.match(
    sql,
    /alter function public\.create_document_request_batch\([^;]+ owner to postgres/iu,
  );
  assert.match(sql, /jsonb_array_length\(p_items\) between 1 and 25/iu);
  assert.match(sql, /from public\.tenants[\s\S]*status = 'active'[\s\S]*for share/iu);
  assert.match(
    sql,
    /from public\.profiles[\s\S]*role = 'pro'[\s\S]*status = 'active'[\s\S]*for share/iu,
  );
  assert.match(
    sql,
    /from public\.pro_company_assignments[\s\S]*pro_profile_id = p_actor_id[\s\S]*company_id = p_company_id[\s\S]*status = 'active'[\s\S]*for share/iu,
  );
  const canonicalLock = sql.indexOf(
    'perform public.lock_company_assignment_resources(p_company_id, array[p_actor_id])',
  );
  const firstRowLock = sql.indexOf('for share');
  assert.ok(canonicalLock >= 0 && canonicalLock < firstRowLock);
  assert.match(
    sql,
    /digest\([\s\S]*p_actor_id[\s\S]*p_tenant_id[\s\S]*p_company_id[\s\S]*p_items/iu,
  );
  assert.match(sql, /request_fingerprint <> v_fingerprint[\s\S]*operation_id_conflict/iu);
  assert.match(sql, /returning id[\s\S]*jsonb_agg/iu);
  assert.match(sql, /insert into public\.tenant_audit_log/iu);
  assert.match(sql, /'request_ids', v_request_ids/iu);
  assert.match(
    sql,
    /revoke all on function public\.create_document_request_batch\([^;]+ from public, anon, authenticated, service_role/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.create_document_request_batch\([^;]+ to service_role/iu,
  );
  assert.match(
    sql,
    /revoke insert, update, delete, truncate, references, trigger on table public\.document_requests from public, anon, authenticated, service_role/iu,
  );
  assert.doesNotMatch(sql, /grant (?:select, )?insert on table public\.document_request/iu);
  assert.doesNotMatch(sql, /execute format|storage_path|object_path/iu);
});

test('batch request has a deterministic held-session assignment contention runner', () => {
  const shell = readFileSync(contentionRunnerPath, 'utf8').replace(/\s+/gu, ' ');
  const holder = readFileSync(
    resolve(
      process.cwd(),
      'supabase/tests/document_request_batch_assignment_contention_holder.sql',
    ),
    'utf8',
  ).replace(/\s+/gu, ' ');
  const release = readFileSync(
    resolve(
      process.cwd(),
      'supabase/tests/document_request_batch_assignment_contention_release.sql',
    ),
    'utf8',
  ).replace(/\s+/gu, ' ');
  assert.match(shell, /DATABASE_URL is required/iu);
  assert.match(shell, /document_request_batch_assignment_contention_holder\.sql/iu);
  assert.match(shell, /document_request_batch_assignment_contention_release\.sql/iu);
  assert.match(shell, /document_request_batch_assignment_contention_teardown\.sql/iu);
  assert.match(shell, /NO_DEADLOCK_OR_TIMEOUT/iu);
  assert.match(holder, /lock_company_assignment_resources\(/iu);
  assert.match(holder, /BATCH_CANONICAL_LOCK_HELD/iu);
  assert.match(holder, /create_document_request_batch\(/iu);
  assert.match(release, /release_company_pro\(/iu);
  assert.match(release, /lock_timeout='8s'/iu);
});

test('batch request rollback fixture covers replay, conflicts and privilege boundaries', () => {
  const sql = readFileSync(fixturePath, 'utf8').replace(/\s+/gu, ' ');
  for (const marker of [
    'FIRST_BATCH_ATOMIC',
    'ONE_AUDIT_ONE_RECEIPT',
    'ORDERED_REPLAY_NO_DUPLICATES',
    'CONFLICT_NO_FRAGMENTS',
    'INACTIVE_ACTOR_DENIED',
    'FOREIGN_ACTOR_DENIED',
    'UNASSIGNED_ACTOR_DENIED',
    'DIRECT_TABLE_MUTATION_DENIED',
    'ANON_RPC_DENIED',
    'AUTHENTICATED_RPC_DENIED',
    'SERVICE_ROLE_POSITIVE_CONTROL',
    'DOCUMENT_REQUEST_BATCH_ROLLBACK_PASS',
  ]) {
    assert.match(sql, new RegExp(marker, 'u'));
  }
  assert.match(sql, /\\set ON_ERROR_STOP on/iu);
  assert.match(sql, /begin;[\s\S]*rollback;/iu);
  assert.doesNotMatch(sql, /create function pg_temp\.expect_rpc_privilege_denied/iu);
  assert.match(
    sql,
    /not has_function_privilege\( 'anon', 'public\.create_document_request_batch\(uuid,uuid,uuid,uuid,jsonb\)', 'EXECUTE' \)[\s\S]*'ANON_RPC_DENIED'/iu,
  );
  assert.match(
    sql,
    /not has_function_privilege\( 'authenticated', 'public\.create_document_request_batch\(uuid,uuid,uuid,uuid,jsonb\)', 'EXECUTE' \)[\s\S]*'AUTHENTICATED_RPC_DENIED'/iu,
  );
  assert.match(
    sql,
    /has_function_privilege\( 'service_role', 'public\.create_document_request_batch\(uuid,uuid,uuid,uuid,jsonb\)', 'EXECUTE' \)/iu,
  );
  assert.match(sql, /from pg_catalog\.pg_proc[\s\S]*proacl/iu);
  assert.match(
    sql,
    /aclexplode\(procedure\.proacl\)[\s\S]*acl\.grantee = 0[\s\S]*acl\.privilege_type = 'EXECUTE'/iu,
  );
  assert.match(
    sql,
    /aclexplode\(procedure\.proacl\) acl[\s\S]*acl\.grantee = 'service_role'::regrole[\s\S]*acl\.privilege_type = 'EXECUTE'[\s\S]*'SERVICE_ROLE_POSITIVE_CONTROL'/iu,
  );
  assert.doesNotMatch(sql, /proacl::text\s+like/iu);
  assert.doesNotMatch(sql, /set local role (?:anon|authenticated)/iu);
});
