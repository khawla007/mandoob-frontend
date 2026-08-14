import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260814100000_0058_document_review_ownership.sql',
);

const ECMASCRIPT_TRIM_CODE_POINTS = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
  0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  0xfeff,
];

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

function extractTrimCharacters(sql: string): string {
  const match = extractFunction(sql).match(
    /v_trim_characters constant text := U&'((?:\\[0-9a-f]{4})+)'/i,
  );
  assert.ok(match, 'deterministic ECMAScript whitespace trim set is missing');
  return match[1].replace(/\\([0-9a-f]{4})/gi, (_, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}

function trimWithSqlCharacterSet(value: string, trimCharacters: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && trimCharacters.includes(value[start])) start += 1;
  while (end > start && trimCharacters.includes(value[end - 1])) end -= 1;
  return value.slice(start, end);
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
  assert.deepEqual(
    [...extractTrimCharacters(sql)].map((character) => character.codePointAt(0)),
    ECMASCRIPT_TRIM_CODE_POINTS,
  );

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
    /select v\.id,v\.tenant_id,v\.document_id,v\.review_status,d\.id,d\.tenant_id,d\.client_id,d\.request_id,d\.current_version_id,c\.id,c\.tenant_id into v_version_id,v_version_tenant_id,v_version_document_id,v_version_review_status,v_document_id,v_document_tenant_id,v_document_client_id,v_request_id,v_document_current_version_id,v_client_id,v_client_tenant_id/i,
    'the locked review snapshot must capture both version status and document head',
  );
  assert.match(
    fn,
    /if v_version_review_status <> 'pending' or v_document_current_version_id is distinct from p_version_id then raise exception using errcode = 'MD409',message = 'document_review_conflict'; end if/i,
    'only the locked pending current head may be reviewed',
  );
  assert.ok(
    fn.indexOf('v_version_tenant_id <> p_tenant_id') <
      fn.indexOf("v_version_review_status <> 'pending'"),
    'tenant ownership must be validated before reporting a review-state conflict',
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

  assert.match(fn, /p_status is null or p_status not in \('approved','rejected'\)/i);
  assert.match(
    fn,
    /v_trimmed_note := case when p_note is null then null else btrim\(p_note,v_trim_characters\) end/i,
  );
  assert.match(fn, /p_status = 'rejected'[\s\S]*?coalesce\(v_trimmed_note,''\) = ''/i);
  assert.match(fn, /char_length\(coalesce\(v_trimmed_note,''\)\) > 280/i);
  assert.doesNotMatch(fn, /\[\[:space:\]\]/i, 'locale-dependent whitespace classes are forbidden');
  assert.match(fn, /errcode = 'MD422'/i);

  assert.match(
    fn,
    /update public\.document_versions v set review_status = p_status,review_note = v_trimmed_note,reviewed_by = p_actor_id,reviewed_at = p_reviewed_at where v\.id = p_version_id and v\.tenant_id = p_tenant_id and v\.document_id = v_document_id and v\.review_status = 'pending' returning v\.id into v_updated_version_id/i,
    'review update must repeat the authorized version scope and require a returned row',
  );
  assert.match(fn, /if v_updated_version_id is null then raise exception/i);
  assert.doesNotMatch(fn, /\bdelete\s+from\b/i, 'review RPC must preserve all append-only parents');

  assert.match(
    fn,
    /update public\.documents d set current_version_id = p_version_id,updated_at = p_reviewed_at where d\.id = v_document_id and d\.tenant_id = p_tenant_id and d\.client_id = v_document_client_id and d\.current_version_id = p_version_id returning d\.id into v_updated_document_id/i,
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

test('review SQL trim set rejects NBSP and BOM-only notes deterministically', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const trimCharacters = extractTrimCharacters(sql);

  assert.equal(trimWithSqlCharacterSet('\u00a0', trimCharacters), '');
  assert.equal(trimWithSqlCharacterSet('\ufeff', trimCharacters), '');
  assert.equal(trimWithSqlCharacterSet('\u00a0\ufeff\u2029', trimCharacters), '');
  assert.equal(trimWithSqlCharacterSet('\u00a0Readable\ufeff', trimCharacters), 'Readable');
});

test('review contract rejects mutations that weaken chain, locks, grants, or append-only history', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const mutations = [
    sql.replace('v_client_tenant_id <> p_tenant_id', 'false'),
    sql.replace('for update of v, d, c', ''),
    sql.replace('v_request_client_id <> v_document_client_id', 'false'),
    sql.replace("v_version_review_status <> 'pending'", 'false'),
    sql.replace('v_document_current_version_id is distinct from p_version_id', 'false'),
    sql.replace("and v.review_status = 'pending'", ''),
    sql.replace('and d.current_version_id = p_version_id', ''),
    sql.replace('p_status is null\n    or ', ''),
    sql.replace('\\00A0', ''),
    sql.replace('\\2000', ''),
    sql.replace('\\FEFF', ''),
    sql.replace('review_note = v_trimmed_note', 'review_note = p_note'),
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
