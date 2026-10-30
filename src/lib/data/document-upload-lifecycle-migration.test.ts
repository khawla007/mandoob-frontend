import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const path = resolve('supabase/migrations/20260916040100_0093_document_upload_lifecycle.sql');
const authorityPath = resolve(
  'supabase/migrations/20260916040200_0094_document_upload_authority_lock_reconciliation.sql',
);
const lockPath = resolve(
  'supabase/migrations/20260916040300_0095_document_upload_lock_contention.sql',
);

function source(): string {
  assert.ok(existsSync(path), 'durable document upload migration is missing');
  assert.ok(existsSync(authorityPath), 'forward document authority reconciliation is missing');
  assert.ok(
    existsSync(lockPath),
    'forward nonblocking document lifecycle reconciliation is missing',
  );
  const cumulative = [
    readFileSync(path, 'utf8'),
    readFileSync(authorityPath, 'utf8'),
    readFileSync(lockPath, 'utf8'),
  ]
    .join('\n')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ');
  const latest = new Map<string, string>();
  const ddl = cumulative.replace(
    /create or replace function public\.([a-z0-9_]+)\([\s\S]*?\$\$;/gi,
    (definition, name: string) => {
      latest.set(name, definition);
      return '';
    },
  );
  return ddl + ' ' + [...latest.values()].join(' ');
}

function assertBoundary(sql: string): void {
  const authority = [
    ...sql.matchAll(
      /create or replace function public\._document_upload_lock_authority\([\s\S]*?\$\$;/gi,
    ),
  ].at(-1)?.[0];
  assert.ok(authority, 'effective authority helper exists');
  for (const table of ['document_upload_operations', 'document_lifecycle_audit']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(
      sql,
      new RegExp(
        `revoke all on (?:table )?public\\.${table} from public, anon, authenticated, service_role`,
        'i',
      ),
    );
  }
  for (const name of [
    'prepare_document_upload',
    'finalize_document_upload',
    'get_document_upload_receipt',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?security definer set search_path = ''`,
        'i',
      ),
    );
    assert.match(sql, new RegExp(`alter function public\\.${name}\\([^;]+ owner to postgres`, 'i'));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated`,
        'i',
      ),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`, 'i'),
    );
  }
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(
    authority,
    /public\.authorize_pro_company_access\(p_actor_id, p_tenant_id, p_company_id\)/i,
  );
  assert.match(authority, /from public\.pro_company_assignments[\s\S]*?for share/i);
  assert.match(authority, /from public\.pro_credentials[\s\S]*?for share/i);
  assert.ok(
    /expiry_date >= timezone\('Asia\/Dubai',pg_catalog\.now\(\)\)::date order by id for share nowait; if not found then/i.test(
      authority,
    ),
    'credential authority must be backed by a successfully locked live row',
  );
  assert.ok(
    /status='active' order by id for share nowait; if not found then/i.test(authority),
    'assignment authority must be backed by a successfully locked live row',
  );
  assert.match(sql, /current_version_id is distinct from[\s\S]*?expected_head/i);
  assert.match(
    sql,
    /from storage\.objects[\s\S]*?bucket_id = 'tenant-documents'[\s\S]*?for share/i,
  );
  assert.match(sql, /p_scan_state is distinct from 'clean'/i);
  assert.match(sql, /p_scan_provider is distinct from 'clamav'/i);
  assert.match(sql, /metadata ->> 'size'/i);
  assert.match(sql, /metadata ->> 'mimetype'/i);
  assert.match(sql, /before update or delete on public\.document_versions/i);
  assert.match(sql, /before update on public\.documents[\s\S]*?_document_upload_guard_document/i);
  assert.match(sql, /before update or delete on public\.document_lifecycle_audit/i);
  assert.match(sql, /before truncate on public\.document_lifecycle_audit/i);
  assert.equal(
    sql.match(/head\.id is distinct from r\.document_id/g)?.length,
    4,
    'all three terminal replay boundaries check the exact reserved document chain',
  );
  assert.doesNotMatch(sql, /alter table public\.tenant_audit_log/i);
  assert.doesNotMatch(
    sql,
    /for (?:share|update)(?! nowait)/i,
    'effective lifecycle row locks must not block while holding an inverse P303 chain',
  );
  assert.equal(
    sql.match(/exception when lock_not_available then/g)?.length,
    3,
    'all outer lifecycle RPCs translate lock contention into fixed sanitized conflict',
  );
}

test('durable publication migration enforces private RPC, lock, scan, storage and immutable boundaries', () => {
  assertBoundary(source());
});

test('boundary assertions detect removal of grants, locks, scan, storage and immutable protections', () => {
  const sql = source();
  for (const needle of [
    'revoke all on table public.document_upload_operations from public, anon, authenticated, service_role',
    'pg_catalog.pg_advisory_xact_lock',
    "p_scan_state is distinct from 'clean'",
    "p_scan_provider is distinct from 'clamav'",
    "metadata ->> 'size'",
    "metadata ->> 'mimetype'",
    'before update or delete on public.document_versions',
    'before update on public.documents',
    'head.id is distinct from r.document_id',
    'before truncate on public.document_lifecycle_audit',
    'nowait',
    'lock_not_available',
  ]) {
    assert.ok(sql.includes(needle), 'mutation target exists');
    assert.throws(() => assertBoundary(sql.replaceAll(needle, 'REMOVED')));
  }
});

test('rollback contract exercises real publication and distinguishes storage metadata simulation', () => {
  const sql = readFileSync(resolve('supabase/tests/document_upload_lifecycle.sql'), 'utf8');
  assert.match(sql, /SQL metadata simulation only/i);
  for (const label of [
    'PREPARED_NO_PUBLICATION',
    'REPLAY_STABLE',
    'AUDIT_FAILURE_ATOMIC',
    'STALE_LOGICAL_HEAD',
    'IMMUTABLE_VERSION',
    'REVOKED_AUTHORITY',
    'PRIVATE_ACLS',
  ]) {
    assert.ok(sql.includes(label), 'required behavioral assertion exists');
  }
  assert.match(sql, /public\.prepare_document_upload\(/);
  assert.match(sql, /public\.finalize_document_upload\(/);
  assert.match(sql, /rollback;/i);
});
