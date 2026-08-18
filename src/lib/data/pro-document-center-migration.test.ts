import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260813100000_0057_pro_document_center.sql',
);

const DOC_TYPES = [
  'passport',
  'visa',
  'emirates_id',
  'trade_license',
  'ejari',
  'moa',
  'shareholder_id',
  'other',
  'aoa',
  'bank_reference_letter',
  'noc',
  'cv_resume',
  'office_lease',
  'medical_certificate',
  'insurance_policy',
];
const APPROVED_VIEWS = [
  'all',
  'requested',
  'submitted',
  'approved',
  'rejected',
  'expiring',
  'overdue',
];
const APPROVED_SORTS = ['urgency', 'newest', 'oldest', 'due_date', 'expiry_date'];

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

function extractConstraintValues(sql: string, table: string): string[] {
  const constraint = new RegExp(
    `alter table public\\.${table} add constraint ${table}_doc_type_check check \\(doc_type in \\(([^)]*)\\)\\)`,
    'i',
  ).exec(executableSql(sql));
  assert.ok(constraint, `${table} must replace its named doc_type constraint`);
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function extractFunction(sql: string): string {
  const match = executableSql(sql).match(
    /create or replace function public\.list_pro_document_center\([\s\S]*?\) returns table \([\s\S]*?\) language sql stable security (?:invoker|definer)[\s\S]*?\$function\$;/i,
  );
  assert.ok(match, 'list_pro_document_center SQL function is missing');
  return match[0];
}

function extractExpiryFunction(sql: string): string {
  const match = executableSql(sql).match(
    /create or replace function public\.set_pro_document_expiry\([\s\S]*?\) returns table \([\s\S]*?\) language plpgsql volatile security invoker set search_path = '' as \$function\$[\s\S]*?\$function\$;/i,
  );
  assert.ok(match, 'set_pro_document_expiry transactional function is missing');
  return match[0];
}

function extractHistoryFunction(sql: string): string {
  const match = executableSql(sql).match(
    /create or replace function public\.get_pro_document_version_history\([\s\S]*?\) returns jsonb language sql stable security invoker set search_path = '' as \$function\$[\s\S]*?\$function\$;/i,
  );
  assert.ok(match, 'get_pro_document_version_history snapshot function is missing');
  return match[0];
}

function extractAllowedValues(fn: string, parameter: string, fallback: string): string[] {
  const allowed = new RegExp(`coalesce\\(${parameter},'${fallback}'\\) in \\(([^)]*)\\)`, 'i').exec(
    fn,
  );
  assert.ok(allowed, `${parameter} must validate an explicit token list`);
  return [...allowed[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function extractFunctionRoles(sql: string, verb: 'grant execute' | 'revoke all'): string[] {
  const normalized = executableSql(sql);
  const statement = new RegExp(
    `${verb} on function public\\.list_pro_document_center\\([\\s\\S]*?\\) (?:to|from) ([a-z_,]+);`,
    'i',
  ).exec(normalized);
  assert.ok(statement, `${verb} role statement is missing`);
  return statement[1].split(',');
}

function extractExpiryFunctionRoles(sql: string, verb: 'grant execute' | 'revoke all'): string[] {
  const statement = new RegExp(
    `${verb} on function public\\.set_pro_document_expiry\\([\\s\\S]*?\\) (?:to|from) ([a-z_,]+);`,
    'i',
  ).exec(executableSql(sql));
  assert.ok(statement, `expiry ${verb} role statement is missing`);
  return statement[1].split(',');
}

function extractHistoryFunctionRoles(sql: string, verb: 'grant execute' | 'revoke all'): string[] {
  const statement = new RegExp(
    `${verb} on function public\\.get_pro_document_version_history\\([\\s\\S]*?\\) (?:to|from) ([a-z_,]+);`,
    'i',
  ).exec(executableSql(sql));
  assert.ok(statement, `history ${verb} role statement is missing`);
  return statement[1].split(',');
}

function assertHistorySnapshotContract(sql: string): void {
  const normalized = executableSql(sql);
  const fn = extractHistoryFunction(sql);

  assert.match(fn, /\(p_tenant_id uuid,p_document_id uuid\) returns jsonb/i);
  assert.match(fn, /language sql stable security invoker set search_path = ''/i);
  assert.doesNotMatch(fn, /security definer/i);
  assert.match(
    fn,
    /from public\.documents d join public\.clients c on c\.id = d\.client[_]id and c\.tenant_id = d\.tenant_id where d\.id = p_document_id and d\.tenant_id = p_tenant_id and c\.tenant_id = p_tenant_id/i,
    'history ownership must validate document through its tenant-owned client in the snapshot',
  );
  assert.match(
    fn,
    /join public\.document_versions v on v\.document_id = owned\.document_id and v\.tenant_id = owned\.tenant_id/i,
    'every version must follow the owned document and tenant chain',
  );
  assert.match(
    fn,
    /left join public\.profiles uploader on uploader\.id = v\.uploaded_by and uploader\.tenant_id = owned\.tenant_id/i,
    'uploader names must be joined tenant-safely',
  );
  assert.match(
    fn,
    /left join public\.profiles reviewer on reviewer\.id = v\.reviewed_by and reviewer\.tenant_id = owned\.tenant_id/i,
    'reviewer names must be joined tenant-safely',
  );
  assert.match(fn, /count\(\*\) over\(\) as total/i);
  assert.match(
    fn,
    /row_number\(\) over \(order by v\.created_at desc,v\.id desc\) as newest_rank/i,
  );
  assert.match(
    fn,
    /jsonb_agg\([\s\S]*?order by ranked\.created_at desc,ranked\.version_id desc\)/i,
    'one JSON aggregate must materialize the complete deterministic snapshot',
  );
  assert.match(fn, /'versionNumber',ranked\.total - ranked\.newest_rank \+ 1/i);
  assert.match(
    fn,
    /'current',coalesce\(ranked\.version_id = ranked\.current_version_id,false\)/i,
    'history current flags must remain boolean when the document has no current head',
  );
  assert.match(fn, /'documentId',owned\.document_id/i);
  assert.match(fn, /'currentVersionId',owned\.current_version_id/i);
  assert.match(fn, /'total',coalesce\(versions\.total,0\)/i);
  assert.match(fn, /'versions',coalesce\(versions\.items,'\[\]'::jsonb\)/i);
  assert.doesNotMatch(fn, /storage_path/i, 'history payload must never contain storage paths');
  assert.doesNotMatch(fn, /\blimit\b|\boffset\b/i, 'snapshot aggregation must not paginate');

  assert.equal(
    normalized.match(/revoke all on function public\.get_pro_document_version_history\(/gi)?.length,
    1,
  );
  assert.equal(
    normalized.match(/grant execute on function public\.get_pro_document_version_history\(/gi)
      ?.length,
    1,
  );
  assert.deepEqual(extractHistoryFunctionRoles(sql, 'revoke all'), [
    'public',
    'anon',
    'authenticated',
  ]);
  assert.deepEqual(extractHistoryFunctionRoles(sql, 'grant execute'), ['service_role']);
}

function assertExpiryMutationContract(sql: string): void {
  const normalized = executableSql(sql);
  const fn = extractExpiryFunction(sql);

  assert.match(
    fn,
    /\(p_tenant_id uuid,p_document_id uuid,p_actor_id uuid,p_expires_on date\)/i,
    'expiry RPC must accept only scoped identifiers and the nullable date',
  );
  assert.match(fn, /returns table \(document_id uuid,client[_]id uuid,expires_on date\)/i);
  assert.match(fn, /language plpgsql volatile security invoker set search_path = ''/i);
  assert.doesNotMatch(fn, /security definer/i);
  assert.doesNotMatch(
    fn,
    /select d,c into/i,
    'PL/pgSQL must not assign multiple composite records through one INTO list',
  );
  assert.match(
    fn,
    /perform 1 from public\.tenants where id = p_tenant_id and status = 'active' for share/i,
    'expiry RPC must lock and require the active tenant first',
  );
  assert.match(
    fn,
    /perform 1 from public\.profiles where id = p_actor_id and tenant_id = p_tenant_id and role = 'pro' and status = 'active' for share/i,
    'expiry RPC must lock and require an active same-tenant PRO actor',
  );
  assert.match(
    fn,
    /raise exception using errcode = '42501',message = 'FORBIDDEN'/i,
    'invalid tenant or actor must use the stable forbidden outcome',
  );
  const tenantLock = fn.indexOf('from public.tenants');
  const actorLock = fn.indexOf('from public.profiles');
  const documentLock = fn.indexOf('from public.documents');
  const employeeLock = fn.indexOf('from public.employees');
  assert.ok(
    tenantLock < actorLock && actorLock < documentLock && documentLock < employeeLock,
    'row locks must follow tenant, actor, document/client, employee order',
  );
  assert.match(
    fn,
    /select d\.id,d\.tenant_id,d\.client[_]id,d\.doc_type,d\.employee_id,c\.id,c\.tenant_id into v_document_id,v_document_tenant_id,v_document_client[_]id,v_document_doc_type,v_document_employee_id,v_client[_]id,v_client_tenant_id from public\.documents d join public\.clients c on c\.id = d\.client[_]id where d\.id = p_document_id for update of d,c/i,
    'expiry RPC must use compile-safe scalar assignment and lock both ownership rows',
  );
  assert.match(fn, /v_document_tenant_id <> p_tenant_id/i);
  assert.match(fn, /v_client_tenant_id <> p_tenant_id/i);
  assert.match(fn, /errcode = 'MD404'/i, 'missing and foreign resources need one stable code');
  assert.match(
    fn,
    /select e\.id,e\.tenant_id,e\.client[_]id into v_employee_id,v_employee_tenant_id,v_employee_client[_]id from public\.employees e where e\.id = v_document_employee_id for share of e/i,
    'employee-linked ownership must be rechecked under a row lock',
  );
  assert.match(fn, /v_employee_tenant_id <> p_tenant_id/i);
  assert.match(fn, /v_employee_client[_]id <> v_document_client[_]id/i);
  assert.match(
    fn,
    /v_document_doc_type = 'trade_license' or \(v_document_employee_id is not null and v_document_doc_type in \('visa','emirates_id'\)\)/i,
    'externally-owned expiry types must be rejected inside the transaction',
  );
  assert.match(fn, /errcode = 'MD409'/i, 'externally-owned expiry needs a stable code');
  assert.match(
    fn,
    /update public\.documents d set expires_on = p_expires_on where d\.id = v_document_id and d\.tenant_id = p_tenant_id returning d\.id,d\.expires_on into v_updated_id,v_updated_expires_on/i,
    'expiry update must remain tenant scoped and capture the updated row',
  );
  assert.match(fn, /if not found then raise exception/i, 'zero-row updates must fail closed');
  assert.match(
    fn,
    /insert into public\.tenant_audit_log \(tenant_id,actor_id,action,source,details\) values \(p_tenant_id,p_actor_id,'updated','self_serve',jsonb_build_object\('entity','document','op','set_expiry','document_id',v_updated_id,'expires_on',v_updated_expires_on\)\)/i,
    'required tenant audit must be in the same transaction as the update',
  );
  assert.match(fn, /return query select v_updated_id,v_document_client[_]id,v_updated_expires_on/i);

  assert.equal(
    normalized.match(/revoke all on function public\.set_pro_document_expiry\(/gi)?.length,
    1,
  );
  assert.equal(
    normalized.match(/grant execute on function public\.set_pro_document_expiry\(/gi)?.length,
    1,
  );
  assert.deepEqual(extractExpiryFunctionRoles(sql, 'revoke all'), [
    'public',
    'anon',
    'authenticated',
  ]);
  assert.deepEqual(extractExpiryFunctionRoles(sql, 'grant execute'), ['service_role']);
}

function assertMigrationContract(sql: string): void {
  const normalized = executableSql(sql);

  assert.match(
    normalized,
    /alter table public\.documents add column if not exists expires_on date;/i,
    'documents.expires_on must be a nullable date',
  );
  assert.doesNotMatch(normalized, /expires_on date not null/i);

  for (const table of ['documents', 'document_requests']) {
    assert.match(
      normalized,
      new RegExp(
        `alter table public\\.${table} drop constraint if exists ${table}_doc_type_check`,
        'i',
      ),
    );
    assert.deepEqual(
      extractConstraintValues(sql, table),
      DOC_TYPES,
      `${table} doc_type values must preserve legacy values and add the approved values`,
    );
  }

  assert.match(
    normalized,
    /documents_tenant_expiry_idx on public\.documents \(tenant_id,expires_on,id\) where expires_on is not null/i,
  );
  assert.match(
    normalized,
    /document_requests_tenant_status_due_idx on public\.document_requests \(tenant_id,status,due_at,id\)/i,
  );
  assert.match(
    normalized,
    /document_versions_document_created_id_idx on public\.document_versions \(document_id,created_at desc,id desc\)/i,
  );

  const fn = extractFunction(sql);
  assert.match(fn, /\(p_tenant_id uuid,/i, 'p_tenant_id uuid must be the first argument');
  assert.match(fn, /p_view text default 'all'/i);
  assert.match(fn, /p_sort text default 'urgency'/i, 'urgency must be the default sort');
  for (const parameter of [
    'p_view text',
    'p_search text',
    ['p_client', 'id uuid'].join('_'),
    'p_doc_type text',
    'p_due_from date',
    'p_due_to date',
    'p_expiry_from date',
    'p_expiry_to date',
    'p_sort text',
    'p_focus_kind text',
    'p_focus_id uuid',
    'p_page integer',
    'p_page_size integer',
  ]) {
    assert.match(fn, new RegExp(parameter, 'i'), `RPC must accept ${parameter}`);
  }
  assert.match(fn, /language sql stable security invoker/i, 'RPC must be stable security invoker');
  assert.doesNotMatch(fn, /security definer/i);
  assert.deepEqual(
    extractAllowedValues(fn, 'p_view', 'all'),
    APPROVED_VIEWS,
    'view tokens must exactly match the locked contract',
  );
  assert.deepEqual(
    extractAllowedValues(fn, 'p_sort', 'urgency'),
    APPROVED_SORTS,
    'sort tokens must exactly match the locked contract',
  );
  assert.equal(
    fn.match(/\(now\(\) at time zone 'Asia\/Dubai'\)::date/gi)?.length,
    1,
    'Dubai today must be computed exactly once',
  );
  assert.doesNotMatch(
    fn,
    /\bcurrent_date\b/i,
    'session current_date must not drive business dates',
  );
  assert.match(fn, /\(now\(\) at time zone 'Asia\/Dubai'\)::date as dubai_today/i);
  assert.match(fn, /when 'requested' then unified\.entity_kind = 'request'/i);
  assert.match(
    fn,
    /when 'submitted' then unified\.entity_kind = 'document' and unified\.review_status = 'pending'/i,
  );
  assert.match(fn, /when 'approved' then unified\.review_status = 'approved'/i);
  assert.match(fn, /when 'rejected' then unified\.review_status = 'rejected'/i);
  assert.match(
    fn,
    /when 'expiring' then unified\.effective_expires_on between params\.dubai_today and params\.dubai_today \+ 30/i,
    'expiring must include Dubai today through day 30 only',
  );
  assert.match(
    fn,
    /when 'overdue' then unified\.entity_kind = 'request' and \(unified\.due_at at time zone 'Asia\/Dubai'\)::date < params\.dubai_today/i,
    'overdue must mean a pending request due before Dubai today',
  );
  assert.match(fn, /count\(\*\) over\(\)/i, 'RPC must return an exact pre-pagination count');
  assert.match(fn, /total_count bigint,effective_page integer\)/i);
  assert.match(
    fn,
    /page_bounds as materialized \(select coalesce\(least\(greatest\(p_page,1\),ceil\(max\(counted\.total_count\)::numeric \/ least\(greatest\(p_page_size,1\),50\)\)::integer\),1\) as effective_page from counted\)/i,
    'RPC must derive and clamp the effective page from the exact count',
  );
  assert.match(
    fn,
    /counted\.total_count,\(select effective_page from page_bounds\) as effective_page from counted/i,
    'every returned queue row must expose the clamped effective page',
  );
  assert.match(
    fn,
    /order by[\s\S]*params\.sort_name = 'urgency'[\s\S]*params\.dubai_today[\s\S]*entity_kind[\s\S]*entity_id[\s\S]*limit least\(greatest\(p_page_size,1\),50\)[\s\S]*offset \(\(\(select effective_page from page_bounds\)\s*-\s*1\)\s*\*\s*least\(greatest\(p_page_size,1\),50\)\)/i,
    'RPC must paginate from the clamped page with deterministic entity tie-breakers',
  );
  const urgencyBranches = [
    [
      "counted.entity_kind = 'request' and counted.request_status = 'pending' and (counted.due_at at time zone 'Asia/Dubai')::date < params.dubai_today",
      '0',
    ],
    ["counted.entity_kind = 'document' and counted.review_status = 'rejected'", '1'],
    ["counted.entity_kind = 'document' and counted.review_status = 'pending'", '2'],
    ["counted.entity_kind = 'request' and counted.request_status = 'pending'", '3'],
    ["counted.entity_kind = 'document' and counted.effective_expires_on is not null", '4'],
  ];
  const urgencyCase = fn.match(
    /case when params\.sort_name = 'urgency' then case([\s\S]*?)else 5\s+end end asc/i,
  );
  assert.ok(urgencyCase, 'urgency sort must define the complete actionable priority CASE');
  const parsedUrgencyBranches = [...urgencyCase[1].matchAll(/when (.*?) then (\d+)/gi)].map(
    ([, predicate, rank]) => [predicate.trim(), rank],
  );
  assert.deepEqual(
    parsedUrgencyBranches,
    urgencyBranches,
    'urgency must rank overdue, rejected/resubmission, pending review, awaiting upload, then expiry work',
  );
  assert.match(
    fn,
    /case when params\.sort_name = 'urgency' and counted\.entity_kind = 'request' then counted\.due_at end asc nulls last,case when params\.sort_name = 'urgency' and counted\.entity_kind = 'document' and counted\.review_status in \('rejected','pending'\) then counted\.current_version_created_at end asc nulls last,case when params\.sort_name = 'urgency' and counted\.entity_kind = 'document' and counted\.effective_expires_on is not null then counted\.effective_expires_on end asc nulls last/i,
    'each urgency class must retain its actionable date before entity and id tie-breakers',
  );
  assert.doesNotMatch(
    fn,
    /offset \(\(greatest\(p_page,1\)/i,
    'raw requested-page offset can erase total_count rows',
  );

  const ownedClientBranches = fn.match(
    /from public\.clients c join public\.(?:document_requests|documents) [rd] on [\s\S]*?where c\.tenant_id = p_tenant_id/gi,
  );
  assert.equal(
    ownedClientBranches?.length,
    2,
    'both request and document branches must start from tenant-owned clients',
  );
  assert.match(
    fn,
    /not exists \(select 1 from public\.documents existing where existing\.request_id = r\.id and existing\.tenant_id = c\.tenant_id and existing\.client[_]id = c\.id\)/i,
    'pending requests must exclude tenant-owned document heads',
  );
  assert.match(
    fn,
    /r\.status = 'pending'/i,
    'requested and overdue rows must originate from pending requests',
  );
  assert.match(
    fn,
    /left join public\.employees e on e\.id = d\.employee_id and e\.tenant_id = c\.tenant_id and e\.client[_]id = c\.id/i,
    'employee expiry ownership must follow the tenant-owned client chain',
  );
  assert.match(fn, /when d\.doc_type = 'trade_license' then c\.license_expiry/i);
  assert.match(fn, /when d\.doc_type = 'visa' and d\.employee_id is not null then e\.visa_expiry/i);
  assert.match(
    fn,
    /when d\.doc_type = 'emirates_id' and d\.employee_id is not null then e\.eid_expiry/i,
  );
  assert.match(fn, /else d\.expires_on/i);
  assert.match(fn, /requester\.full_name as requested_by_name/i);
  assert.match(fn, /reviewer\.full_name as reviewed_by_name/i);

  assert.doesNotMatch(
    normalized,
    /drop function if exists public\.list_pro_document_center/i,
    'new RPC must not be dropped before CREATE OR REPLACE',
  );
  assert.equal(
    normalized.match(/revoke all on function public\.list_pro_document_center\(/gi)?.length,
    1,
    'RPC must have exactly one execution revoke statement',
  );
  assert.equal(
    normalized.match(/grant execute on function public\.list_pro_document_center\(/gi)?.length,
    1,
    'RPC must have exactly one execution grant statement',
  );
  assert.deepEqual(
    extractFunctionRoles(sql, 'revoke all'),
    ['public', 'anon', 'authenticated'],
    'RPC execution must be explicitly revoked from all client roles',
  );
  assert.deepEqual(
    extractFunctionRoles(sql, 'grant execute'),
    ['service_role'],
    'only the page-authorized service-role DAL may execute the RPC',
  );
  assertHistorySnapshotContract(sql);
  assertExpiryMutationContract(sql);
}

function expectedClampedOffset(
  total: number,
  requestedPage: number,
  requestedSize: number,
): number {
  const pageSize = Math.min(Math.max(requestedSize, 1), 50);
  const lastPage = Math.max(Math.ceil(total / pageSize), 1);
  return (Math.min(Math.max(requestedPage, 1), lastPage) - 1) * pageSize;
}

function readMigration(): string {
  assert.ok(existsSync(migrationPath), `missing migration: ${migrationPath}`);
  return readFileSync(migrationPath, 'utf8');
}

function assertMutationRejected(
  sql: string,
  mutate: (source: string) => string,
  failure: RegExp,
): void {
  const mutation = mutate(sql);
  assert.notEqual(mutation, sql, 'mutation must alter only the in-memory migration');
  assert.throws(() => assertMigrationContract(mutation), failure);
}

test('PRO document center migration defines the tenant-scoped schema and RPC contract', () => {
  assertMigrationContract(readMigration());
});

test('PRO document center pagination clamps out-of-range pages while preserving large counts', () => {
  const fn = extractFunction(readMigration());
  assert.match(fn, /count\(\*\) over\(\)/i);
  assert.match(fn, /max\(counted\.total_count\)/i);
  assert.match(fn, /select effective_page from page_bounds/i);

  assert.deepEqual(
    [
      expectedClampedOffset(0, 999, 50),
      expectedClampedOffset(51, 999, 50),
      expectedClampedOffset(1_001, 999, 500),
    ],
    [0, 50, 1_000],
    'empty, out-of-range, capped, and provider-row-cap-sized datasets must clamp deterministically',
  );
});

test('PRO document center contract rejects weakened in-memory mutations', () => {
  const sql = readMigration();

  assertMutationRejected(
    sql,
    (source) => source.replace(/where c\.tenant_id = p_tenant_id/gi, 'where true'),
    /both request and document branches must start from tenant-owned clients/,
  );
  for (const mutation of [
    (source: string) => source.replace("and counted.request_status = 'pending'", ''),
    (source: string) =>
      source.replace("counted.review_status = 'rejected'", 'counted.review_status is not null'),
    (source: string) =>
      source.replace("counted.review_status = 'pending'", "counted.review_status = 'approved'"),
    (source: string) =>
      source.replace(
        "then 3\n    when counted.entity_kind = 'document'",
        "then 4\n    when counted.entity_kind = 'document'",
      ),
    (source: string) =>
      source.replace(
        'counted.effective_expires_on is not null then 4',
        'counted.effective_expires_on is null then 4',
      ),
    (source: string) =>
      source.replace(
        "counted.review_status in ('rejected', 'pending')",
        "counted.review_status = 'pending'",
      ),
  ]) {
    assertMutationRejected(sql, mutation, /urgency|actionable date/i);
  }
  assertMutationRejected(
    sql,
    (source) => source.replace(/, counted\.entity_id asc\nlimit/i, '\nlimit'),
    /deterministic entity tie-breakers/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/security invoker/i, 'security definer'),
    /stable security invoker/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/, 'overdue'/i, ''),
    /view tokens must exactly match the locked contract/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/\(now\(\) at time zone 'Asia\/Dubai'\)::date/i, 'current_date'),
    /Dubai today must be computed exactly once/,
  );
  assertMutationRejected(
    sql,
    (source) =>
      source.replace(
        /when 'overdue' then unified\.entity_kind = 'request'\s+and/i,
        "when 'overdue' then",
      ),
    /overdue must mean a pending request due before Dubai today/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/and r\.status = 'pending'/i, 'and true'),
    /requested and overdue rows must originate from pending requests/,
  );
  assertMutationRejected(
    sql,
    (source) =>
      source.replace(
        /offset \(\(\(select effective_page from page_bounds\) - 1\)\s+\* least\(greatest\(p_page_size, 1\), 50\)\)/i,
        'offset ((greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 50))',
      ),
    /clamped page|raw requested-page offset/,
  );
  assertMutationRejected(
    sql,
    (source) =>
      source.replace(
        /\(select effective_page from page_bounds\) as effective_page/i,
        'p_page as effective_page',
      ),
    /expose the clamped effective page/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/to service_role;/i, 'to authenticated, service_role;'),
    /only the page-authorized service-role DAL may execute the RPC/,
  );

  for (const [mutate, failure] of [
    [
      (source: string) => source.replace(/and status = 'active'\s+for share;/i, 'for share;'),
      /active tenant first/,
    ],
    [
      (source: string) => source.replace(/and role = 'pro'/i, "and role = 'customer'"),
      /active same-tenant PRO actor/,
    ],
    [
      (source: string) => source.replace(/for update of d, c/i, 'for update of d'),
      /lock both ownership rows/,
    ],
    [
      (source: string) =>
        source.replace(/insert into public\.tenant_audit_log/i, 'insert into public.auth_events'),
      /required tenant audit must be in the same transaction/,
    ],
    [
      (source: string) =>
        source.replace(
          /return query select v_updated_id, v_document_client[_]id, v_updated_expires_on/i,
          'return query select v_updated_id, null::uuid, v_updated_expires_on',
        ),
      /authoritative client|return query/,
    ],
    [
      (source: string) =>
        source.replace(
          /grant execute on function public\.set_pro_document_expiry\(\s*uuid, uuid, uuid, date\s*\) to service_role;/i,
          'grant execute on function public.set_pro_document_expiry(uuid, uuid, uuid, date) to authenticated, service_role;',
        ),
      /deepStrictEqual|service_role/,
    ],
  ] as const) {
    assertMutationRejected(sql, mutate, failure);
  }

  for (const [mutate, failure] of [
    [
      (source: string) =>
        source.replace(
          /coalesce\(ranked\.version_id = ranked\.current_version_id, false\)/i,
          'ranked.version_id = ranked.current_version_id',
        ),
      /current flags must remain boolean/,
    ],
    [
      (source: string) => source.replace(/and v\.tenant_id = owned\.tenant_id/i, ''),
      /every version must follow the owned document and tenant chain/,
    ],
    [
      (source: string) =>
        source.replace(/order by ranked\.created_at desc, ranked\.version_id desc/i, ''),
      /complete deterministic snapshot/,
    ],
    [
      (source: string) =>
        source.replace(
          /grant execute on function public\.get_pro_document_version_history\(\s*uuid, uuid\s*\) to service_role;/i,
          'grant execute on function public.get_pro_document_version_history(uuid, uuid) to authenticated, service_role;',
        ),
      /deepStrictEqual|service_role/,
    ],
  ] as const) {
    assertMutationRejected(sql, mutate, failure);
  }

  assert.equal(readMigration(), sql, 'in-memory mutations must not alter the migration on disk');
});
