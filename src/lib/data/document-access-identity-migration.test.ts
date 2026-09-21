import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

function source(): string {
  return readdirSync('supabase/migrations')
    .sort()
    .filter((name) => /document_access/.test(name))
    .map((name) => readFileSync(`supabase/migrations/${name}`, 'utf8'))
    .join('\n')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ');
}
function identityBoundary(sql: string): void {
  assert.match(
    sql,
    /'objectId',\s*r\.object_id/,
    'allowed context requires independent reservation object identity',
  );
  assert.match(
    sql,
    /'extension',\s*r\.extension/,
    'allowed context requires independent reservation extension',
  );
  assert.match(sql, /rename to _document_access_resolve_before_provider_identity/);
  assert.match(
    sql,
    /result\s*:=\s*public\._document_access_resolve_before_provider_identity\(p_actor_id,p_tenant_id,p_company_id,p_document_id,p_version_id,p_lifetime_seconds\)/,
  );
  assert.match(sql, /if result->>'status'\s*(?:<>|!=)\s*'allowed' then return result; end if/);
  for (const expression of [
    "r.operation_id=(result->>'operationId')::uuid",
    'r.tenant_id=p_tenant_id',
    'r.company_id=p_company_id',
    'r.document_id=p_document_id',
    'r.reserved_version_id=p_version_id',
    "r.tenant_id=(result->>'tenantId')::uuid",
    "r.company_id=(result->>'companyId')::uuid",
    "r.document_id=(result->>'documentId')::uuid",
    "r.reserved_version_id=(result->>'versionId')::uuid",
    "r.request_id is not distinct from (result->>'requestId')::uuid",
    "r.mime_type=result->>'mimeType'",
    "r.size_bytes=(result->>'sizeBytes')::bigint",
    "result->>'storageBucket'='tenant-documents'",
    "r.storage_path=result->>'storagePath'",
    "r.sha256=result->>'sha256'",
    "r.storage_path=r.tenant_id::text||'/'||r.company_id::text||'/documents/'||r.operation_id::text||'/'||r.object_id::text||'.'||r.extension",
  ])
    assert.ok(sql.includes(expression), `reservation provenance missing: ${expression}`);
  assert.match(
    sql,
    /revoke all on function public\._document_access_resolve_before_provider_identity\(uuid,uuid,uuid,uuid,uuid,integer\) from public, anon, authenticated, service_role/,
  );
  const forward = sql.slice(
    sql.indexOf('rename to _document_access_resolve_before_provider_identity'),
  );
  assert.match(forward, /security definer set search_path = ''/);
  assert.match(
    forward,
    /alter function public\.resolve_document_access\(uuid,uuid,uuid,uuid,uuid,integer\) owner to postgres/,
  );
  assert.match(
    forward,
    /revoke all on function public\.resolve_document_access\(uuid,uuid,uuid,uuid,uuid,integer\) from public, anon, authenticated, service_role/,
  );
  assert.match(
    forward,
    /grant execute on function public\.resolve_document_access\(uuid,uuid,uuid,uuid,uuid,integer\) to service_role/,
  );
  assert.doesNotMatch(
    forward,
    /split_part|regexp_matches|substring|alter table|grant select|create or replace function public\.(?:finalize_document_access_grant|_document_access_context)/i,
  );
}
test('allowed private access carries independent canonical reservation identities', () =>
  identityBoundary(source()));
test('identity boundary rejects removal of independent values and ownership predicates', () => {
  const sql = source();
  identityBoundary(sql);
  for (const needle of [
    "'objectId'",
    "'extension'",
    'r.tenant_id=p_tenant_id',
    'r.company_id=p_company_id',
    'r.document_id=p_document_id',
    'r.reserved_version_id=p_version_id',
    "r.operation_id=(result->>'operationId')::uuid",
    "r.tenant_id=(result->>'tenantId')::uuid",
    "r.company_id=(result->>'companyId')::uuid",
    "r.document_id=(result->>'documentId')::uuid",
    "r.reserved_version_id=(result->>'versionId')::uuid",
    "r.request_id is not distinct from (result->>'requestId')::uuid",
    "r.sha256=result->>'sha256'",
    "r.mime_type=result->>'mimeType'",
    "r.size_bytes=(result->>'sizeBytes')::bigint",
    "result->>'storageBucket'='tenant-documents'",
    "r.storage_path=result->>'storagePath'",
    'r.object_id::text',
    'revoke all on function public._document_access_resolve_before_provider_identity',
  ]) {
    assert.throws(() => identityBoundary(sql.replaceAll(needle, 'REMOVED')), needle);
  }
});
