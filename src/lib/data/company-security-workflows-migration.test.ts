import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260818110000_0064_company_security_workflows.sql',
);

function normalizedSql() {
  return readFileSync(migrationPath, 'utf8').replace(/\s+/gu, ' ').trim();
}

test('durable erasure preparation deletes employee-owned documents regardless of uploader', () => {
  const sql = normalizedSql();
  assert.match(sql, /create table public\.erasure_cleanup_jobs/u);
  assert.match(sql, /create or replace function public\.prepare_erasure_cleanup/u);
  assert.match(sql, /subject_kind in \('employee', 'customer'\)/u);
  assert.match(sql, /d\.tenant_id = p_tenant_id and d\.company_id = v_company_id/u);
  assert.match(
    sql,
    /if v_request\.subject_kind = 'employee' then[\s\S]*d\.employee_id = v_employee_id/u,
  );
  assert.match(sql, /for update of d, v/u);
  assert.match(
    sql,
    /select coalesce\(pg_catalog\.array_agg\(d\.id\)[\s\S]*from public\.documents d[\s\S]*d\.employee_id = v_employee_id/u,
  );
  assert.match(
    sql,
    /set current_version_id = null[\s\S]*d\.employee_id = v_employee_id[\s\S]*delete from public\.document_versions/u,
  );
  assert.match(
    sql,
    /delete from public\.document_versions v using public\.documents d[\s\S]*d\.employee_id = v_employee_id/u,
  );
  assert.match(sql, /else[\s\S]*owned\.uploaded_by = p_subject_user_id/u);
  assert.match(sql, /order by remaining\.created_at desc, remaining\.id desc/u);
  assert.match(sql, /update public\.documents[\s\S]*current_version_id = replacement\.id/u);
  assert.match(sql, /delete from public\.document_versions[\s\S]*uploaded_by = p_subject_user_id/u);
  assert.match(sql, /delete from public\.documents[\s\S]*not exists/u);
  assert.match(sql, /where e\.id = v_employee_id[\s\S]*e\.profile_id = p_subject_user_id/u);
  assert.match(sql, /array_agg\(distinct owned\.storage_path/u);
  assert.match(sql, /insert into public\.tenant_audit_log/u);
  assert.match(
    sql,
    /drop function public\.execute_employee_erasure_cleanup\(uuid, uuid, uuid, uuid, uuid\)/u,
  );
});

test('erasure jobs persist exact paths and gate completion on storage plus auth', () => {
  const sql = normalizedSql();
  assert.match(sql, /erasure_cleanup_jobs[\s\S]*storage_paths text\[\] not null/u);
  assert.match(sql, /storage_deleted_at timestamptz/u);
  assert.match(sql, /auth_anonymized_at timestamptz/u);
  assert.match(sql, /completion_notification_queued_at timestamptz/u);
  assert.match(sql, /on conflict \(request_id\)[\s\S]*storage_paths/u);
  assert.match(sql, /create or replace function public\.mark_erasure_cleanup_step/u);
  assert.match(sql, /create or replace function public\.complete_erasure_cleanup/u);
  assert.match(sql, /storage_deleted_at is null or[\s\S]*auth_anonymized_at is null/u);
  assert.match(sql, /p_step not in \('storage', 'auth', 'notification'\)/u);
  assert.match(
    sql,
    /unnest\(v_storage_paths\)[\s\S]*storage_path not like p_tenant_id::text \|\| '\/' \|\| v_company_id::text/u,
  );
  for (const fn of [
    'prepare_erasure_cleanup',
    'mark_erasure_cleanup_step',
    'complete_erasure_cleanup',
  ]) {
    assert.match(
      sql,
      new RegExp(`${fn}[\\s\\S]*security definer set search_path = pg_catalog, public`, 'u'),
    );
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, 'u'));
  }
});

test('customer and employee anonymization are atomic with erasure metadata preparation', () => {
  const sql = normalizedSql();
  const prepare = sql.slice(
    sql.indexOf('create or replace function public.prepare_erasure_cleanup'),
  );
  assert.match(prepare, /update public\.employees/u);
  assert.match(prepare, /update public\.profiles/u);
  assert.match(
    prepare,
    /update public\.profiles profile[\s\S]*profile\.id = p_subject_user_id[\s\S]*profile\.tenant_id = p_tenant_id/u,
  );
  assert.match(prepare, /update public\.customer_profiles/u);
  assert.match(prepare, /linked_company_id = v_company_id/u);
  assert.match(prepare, /update public\.erasure_requests[\s\S]*status = 'approved'/u);
});

test('refund intent is unique before provider work and reconciliation is one atomic ledger transition', () => {
  const sql = normalizedSql();
  assert.match(sql, /alter table public\.refunds add column if not exists idempotency_key text/u);
  assert.match(sql, /unique index[\s\S]*on public\.refunds \(tenant_id, idempotency_key\)/u);
  assert.match(sql, /create or replace function public\.prepare_company_refund/u);
  assert.match(sql, /for update of i, p/u);
  assert.match(sql, /i\.tenant_id = p_tenant_id and i\.company_id = p_company_id/u);
  assert.match(sql, /on conflict \(tenant_id, idempotency_key\)/u);
  assert.match(sql, /create or replace function public\.reconcile_company_refund/u);
  assert.match(sql, /update public\.refunds/u);
  assert.match(sql, /update public\.payments/u);
  assert.match(sql, /update public\.invoices/u);
  assert.match(sql, /insert into public\.tenant_audit_log/u);
});

test('concurrent refund operation keys reselect and validate one canonical invoice intent', () => {
  const sql = normalizedSql();
  const prepare = sql.slice(
    sql.indexOf('create or replace function public.prepare_company_refund'),
    sql.indexOf('create or replace function public.reconcile_company_refund'),
  );
  assert.match(
    prepare,
    /on conflict \(tenant_id, idempotency_key\)[\s\S]*do nothing[\s\S]*select r\.\* into v_refund/u,
  );
  assert.doesNotMatch(prepare, /do update set idempotency_key/u);
  assert.match(
    prepare,
    /v_refund\.payment_id <> v_payment\.id[\s\S]*v_refund\.amount_minor <> p_amount_minor[\s\S]*v_refund\.reason is distinct from p_reason/u,
  );
  assert.match(prepare, /refund_idempotency_conflict/u);
});

test('refund workflow RPCs are service-role only with fixed search paths', () => {
  const sql = normalizedSql();
  for (const fn of ['prepare_company_refund', 'reconcile_company_refund']) {
    assert.match(
      sql,
      new RegExp(`${fn}[\\s\\S]*security definer set search_path = pg_catalog, public`, 'u'),
    );
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, 'u'));
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*service_role`, 'u'),
    );
  }
});

test('manual payment and invoice void transitions update ledger and audit atomically', () => {
  const sql = normalizedSql();
  for (const fn of ['mark_company_invoice_paid', 'void_company_invoice']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, 'u'));
    assert.match(
      sql,
      new RegExp(`${fn}[\\s\\S]*security definer set search_path = pg_catalog, public`, 'u'),
    );
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, 'u'));
  }
  assert.match(sql, /mark_company_invoice_paid[\s\S]*insert into public\.payments/u);
  assert.match(sql, /mark_company_invoice_paid[\s\S]*update public\.invoices/u);
  assert.match(sql, /void_company_invoice[\s\S]*update public\.invoices/u);
  assert.match(sql, /i\.tenant_id = p_tenant_id and i\.company_id = p_company_id/u);
  assert.match(sql, /insert into public\.tenant_audit_log/u);
});

test('invoice creation persists the invoice and audit event in one company-scoped transaction', () => {
  const sql = normalizedSql();
  assert.match(sql, /create or replace function public\.create_company_invoice/u);
  assert.match(sql, /company_profiles[\s\S]*tenant_id = p_tenant_id[\s\S]*id = p_company_id/u);
  assert.match(sql, /create_company_invoice[\s\S]*insert into public\.invoices/u);
  assert.match(sql, /create_company_invoice[\s\S]*insert into public\.tenant_audit_log/u);
  assert.match(
    sql,
    /create_company_invoice[\s\S]*security definer set search_path = pg_catalog, public/u,
  );
  assert.match(sql, /revoke all on function public\.create_company_invoice/u);
});

test('application updates require the live actor assignment and exact company ownership', () => {
  const sql = normalizedSql();
  assert.match(sql, /create or replace function public\.update_company_service_case_with_audit/u);
  assert.match(
    sql,
    /pro_company_assignments[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id[\s\S]*pro_profile_id = p_actor_id[\s\S]*status = 'active'/u,
  );
  assert.match(
    sql,
    /update public\.service_cases[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id/u,
  );
  assert.match(sql, /insert into public\.tenant_audit_log[\s\S]*p_company_id/u);
  assert.match(
    sql,
    /update_company_service_case_with_audit[\s\S]*security definer set search_path = pg_catalog, public/u,
  );
  assert.match(sql, /revoke all on function public\.update_company_service_case_with_audit/u);
});
