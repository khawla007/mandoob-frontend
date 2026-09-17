import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

function source(): string {
  const directory = 'supabase/migrations';
  const files = readdirSync(directory).filter((name) =>
    /^2026091604\d{4}_.*document_upload_wallclock_authority\.sql$/.test(name),
  );
  assert.equal(files.length, 1, 'one forward upload wall-clock authority migration is required');
  return readFileSync(`${directory}/${files[0]}`, 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ');
}

test('upload business date uses actual Dubai clock, with no caller-controlled override', () => {
  const sql = source();
  assert.match(
    sql,
    /function public\._document_upload_business_date\(\) returns date language sql volatile security definer set search_path = ''/,
  );
  assert.match(sql, /clock_timestamp\(\).*?'Asia\/Dubai'/);
  assert.doesNotMatch(
    sql,
    /current_setting|set_config|pg_catalog\.now\(|transaction_timestamp\(|statement_timestamp\(/,
  );
});

test('freshness requires current verified PRO licence and NOWAIT credential locks', () => {
  const sql = source();
  for (const needle of [
    "status='active'",
    "actor.role='pro'",
    "credential_type='pro_license'",
    "state='verified'",
    'expiry_date >= public._document_upload_business_date()',
    'order by id for share nowait',
    "errcode='DU403'",
    "errcode='DU409'",
    'lock_not_available',
  ]) {
    assert.ok(sql.includes(needle), `freshness invariant missing: ${needle}`);
  }
});

test('all actor RPCs check freshness after their original delegate and before returning', () => {
  const sql = source();
  for (const name of [
    'prepare_document_upload',
    'finalize_document_upload',
    'get_document_upload_receipt',
  ]) {
    assert.match(
      sql,
      new RegExp(`alter function public\\.${name}\\([^;]+ rename to _document_upload_[a-z_]+`),
    );
    const body = sql.match(
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$`,
      ),
    )?.[1];
    assert.ok(body, `missing ${name} wrapper`);
    assert.match(
      body,
      /:= public\._document_upload_[a-z_]+\([\s\S]*?perform public\._document_upload_current_pro_credential\(p_actor_id\);[\s\S]*?return /,
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`),
    );
  }
});

test('forward helpers and delegates remain owner-only; unrelated authority and cleanup are unchanged', () => {
  const sql = source();
  for (const name of [
    '_document_upload_business_date',
    '_document_upload_current_pro_credential',
  ]) {
    assert.match(sql, new RegExp(`alter function public\\.${name}\\([^;]* owner to postgres`));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}\\([^;]* from public, anon, authenticated, service_role`,
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /create or replace function public\.(?:authorize_pro_company_access|_document_upload_lock_authority|_document_upload_lock_resource|.*document_access.*|.*document_upload_cleanup.*)\(/,
  );
  assert.doesNotMatch(sql, /disable trigger|delete from|truncate|grant .* on (?:table )?public\./);
});
