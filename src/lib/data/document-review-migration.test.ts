import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260814100000_0058_document_review_ownership.sql',
);

function executableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function extractFunction(sql: string): string {
  const match = executableSql(sql).match(
    /create or replace function public\.review_document_version\([\s\S]*?\) returns table \([\s\S]*?\) language plpgsql volatile security invoker set search_path = '' as \$function\$[\s\S]*?\$function\$;/i,
  );
  assert.ok(match, 'transactional review_document_version function is missing');
  return match[0];
}

function assertReviewContract(sql: string): void {
  const normalized = executableSql(sql);
  const fn = extractFunction(sql);

  assert.match(
    fn,
    /\(p_tenant_id uuid,p_actor_id uuid,p_version_id uuid,p_status text,p_note text,p_reviewed_at timestamptz\)/i,
  );
  assert.match(
    fn,
    /returns table \(document_id uuid,client_id uuid,fulfilled_request_id uuid,review_status text\)/i,
  );
  assert.match(fn, /language plpgsql volatile security invoker set search_path = ''/i);
  assert.doesNotMatch(fn, /security definer/i);

  assert.match(fn, /from public\.tenants where id = p_tenant_id and status = 'active' for share/i);
  assert.match(
    fn,
    /from public\.profiles where id = p_actor_id and tenant_id = p_tenant_id and role = 'pro' and status = 'active' for share/i,
  );
  assert.ok(fn.indexOf('from public.tenants') < fn.indexOf('from public.profiles'));
  assert.ok(fn.indexOf('from public.profiles') < fn.indexOf('from public.document_versions'));

  assert.match(
    fn,
    /from public\.document_versions v join public\.documents d on d\.id = v\.document_id join public\.clients c on c\.id = d\.client_id where v\.id = p_version_id for update of v,d,c/i,
    'version, document, and client must be locked as one authoritative chain',
  );
  assert.match(
    fn,
    /v_version_tenant_id <> p_tenant_id[\s\S]*?v_document_tenant_id <> p_tenant_id[\s\S]*?v_client_tenant_id <> p_tenant_id[\s\S]*?v_version_document_id <> v_document_id[\s\S]*?v_document_client_id <> v_client_id/i,
    'every ownership edge and tenant discriminator must be checked',
  );
  assert.match(
    fn,
    /from public\.document_requests r where r\.id = v_request_id for update of r/i,
    'the optional linked request must be locked before mutation',
  );
  assert.match(
    fn,
    /v_request_tenant_id <> p_tenant_id[\s\S]*?v_request_client_id <> v_document_client_id/i,
    'linked request ownership must match the locked document chain',
  );

  assert.match(fn, /p_status not in \('approved','rejected'\)/i);
  assert.match(fn, /p_status = 'rejected'[\s\S]*?btrim\(coalesce\(p_note,''\)\) = ''/i);
  assert.match(fn, /char_length\(btrim\(coalesce\(p_note,''\)\)\) > 280/i);
  assert.match(fn, /errcode = 'MD422'/i);

  assert.match(
    fn,
    /update public\.document_versions v set review_status = p_status,review_note = case when p_note is null then null else btrim\(p_note\) end,reviewed_by = p_actor_id,reviewed_at = p_reviewed_at where v\.id = p_version_id and v\.tenant_id = p_tenant_id and v\.document_id = v_document_id returning v\.id into v_updated_version_id/i,
    'review update must repeat the authorized version scope and require a returned row',
  );
  assert.match(fn, /if v_updated_version_id is null then raise exception/i);
  assert.doesNotMatch(fn, /\bdelete\s+from\b/i, 'review RPC must preserve all append-only parents');

  assert.match(
    fn,
    /update public\.documents d set current_version_id = p_version_id,updated_at = p_reviewed_at where d\.id = v_document_id and d\.tenant_id = p_tenant_id and d\.client_id = v_document_client_id returning d\.id into v_updated_document_id/i,
    'approval must update only the locked document head and require a returned row',
  );
  assert.match(
    fn,
    /update public\.document_requests r set status = 'fulfilled',updated_at = p_reviewed_at where r\.id = v_request_id and r\.tenant_id = p_tenant_id and r\.client_id = v_document_client_id and r\.status = 'pending' returning r\.id into v_fulfilled_request_id/i,
    'request fulfillment must be scoped and may only transition pending to fulfilled',
  );
  assert.match(fn, /v_request_status = 'cancelled'[\s\S]*?v_fulfilled_request_id := null/i);
  assert.doesNotMatch(fn, /status\s*<>\s*'fulfilled'|neq\s*\(\s*'status'/i);

  assert.match(
    fn,
    /insert into public\.tenant_audit_log \(tenant_id,actor_id,action,source,details\) values \(p_tenant_id,p_actor_id,'updated','self_serve',jsonb_build_object\('entity','document','op','review','version_id',p_version_id,'document_id',v_document_id,'review_status',p_status,'fulfilled_request_id',v_fulfilled_request_id\)\)/i,
    'the required review audit must be inserted inside the mutation transaction',
  );
  assert.match(
    fn,
    /return query select v_document_id,v_document_client_id,v_fulfilled_request_id,p_status/i,
  );

  assert.match(
    normalized,
    /revoke all on function public\.review_document_version\(uuid,uuid,uuid,text,text,timestamptz\) from public,anon,authenticated/i,
  );
  assert.match(
    normalized,
    /grant execute on function public\.review_document_version\(uuid,uuid,uuid,text,text,timestamptz\) to service_role/i,
  );
  assert.equal(
    normalized.match(/grant execute on function public\.review_document_version/gi)?.length,
    1,
  );
}

test('review migration exists and enforces the atomic ownership contract', () => {
  assert.equal(existsSync(migrationPath), true, 'forward review migration is missing');
  assertReviewContract(readFileSync(migrationPath, 'utf8'));
});

test('review contract rejects mutations that weaken chain, locks, grants, or append-only history', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const mutations = [
    sql.replace('v_client_tenant_id <> p_tenant_id', 'false'),
    sql.replace('for update of v, d, c', ''),
    sql.replace('v_request_client_id <> v_document_client_id', 'false'),
    sql.replace("and r.status = 'pending'", "and r.status <> 'fulfilled'"),
    sql.replace('to service_role;', 'to authenticated;'),
    sql.replace(
      'return query select',
      'delete from public.document_versions where id = p_version_id; return query select',
    ),
    sql.replace(
      'return query select',
      'delete from public.documents where id = v_document_id; return query select',
    ),
    sql.replace(
      'return query select',
      'delete from public.document_requests where id = v_request_id; return query select',
    ),
    sql.replace(
      'return query select',
      'delete from public.clients where id = v_document_client_id; return query select',
    ),
  ];

  for (const mutated of mutations) {
    assert.throws(() => assertReviewContract(mutated));
  }
});
