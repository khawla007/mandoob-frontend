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
  for (const parameter of [
    'p_view text',
    'p_search text',
    'p_client_id uuid',
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
  assert.match(fn, /count\(\*\) over\(\)/i, 'RPC must return an exact pre-pagination count');
  assert.match(
    fn,
    /order by[\s\S]*entity_kind[\s\S]*entity_id[\s\S]*limit least\(greatest\(p_page_size,1\),50\)[\s\S]*offset \(\(greatest\(p_page,1\)\s*-\s*1\)\s*\*\s*least\(greatest\(p_page_size,1\),50\)\)/i,
    'RPC must use deterministic entity tie-breakers and validated server pagination',
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
    /not exists \(select 1 from public\.documents existing where existing\.request_id = r\.id and existing\.tenant_id = c\.tenant_id and existing\.client_id = c\.id\)/i,
    'pending requests must exclude tenant-owned document heads',
  );
  assert.match(fn, /r\.status = 'pending'/i);
  assert.match(
    fn,
    /left join public\.employees e on e\.id = d\.employee_id and e\.tenant_id = c\.tenant_id and e\.client_id = c\.id/i,
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

  assert.match(normalized, /revoke all on function public\.list_pro_document_center\(/i);
  assert.match(normalized, /from public,anon;/i);
  assert.match(
    normalized,
    /grant execute on function public\.list_pro_document_center\([\s\S]*?to authenticated,service_role;/i,
  );
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

test('PRO document center contract rejects weakened in-memory mutations', () => {
  const sql = readMigration();

  assertMutationRejected(
    sql,
    (source) => source.replace(/where c\.tenant_id = p_tenant_id/gi, 'where true'),
    /both request and document branches must start from tenant-owned clients/,
  );
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

  assert.equal(readMigration(), sql, 'in-memory mutations must not alter the migration on disk');
});
