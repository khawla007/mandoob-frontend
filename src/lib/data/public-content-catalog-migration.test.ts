import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260916020000_0088_public_content_catalog_contracts.sql',
  import.meta.url,
);

test('P3.04 migration creates source-attributed versioned catalog contracts without seed facts', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  for (const table of [
    'catalog_sources',
    'catalog_versions',
    'catalog_authorities',
    'catalog_activities',
    'catalog_licence_types',
    'catalog_authority_activities',
    'catalog_packages',
    'catalog_package_prices',
    'content_operation_receipts',
    'content_audit_events',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, 'i'), table);
  }

  assert.match(sql, /currency text not null default 'AED'[\s\S]*check \(currency = 'AED'\)/i);
  assert.match(sql, /amount_minor bigint[\s\S]*amount_minor >= 0/i);
  assert.match(sql, /price_state[\s\S]*'priced'[\s\S]*'on_request'[\s\S]*'unavailable'/i);
  assert.match(sql, /effective_from date not null/i);
  assert.match(sql, /version_number bigint not null/i);
  assert.match(sql, /operation_id uuid not null/i);
  assert.match(sql, /unique \(actor_id, operation_id\)/i);
  assert.doesNotMatch(
    sql,
    /insert\s+into\s+public\.catalog_(?:authorities|activities|licence_types|packages|package_prices)/i,
  );
});

test('P3.04 migration exposes only approved published effective rows to anonymous readers', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  for (const table of [
    'catalog_sources',
    'catalog_versions',
    'catalog_authorities',
    'catalog_activities',
    'catalog_licence_types',
    'catalog_authority_activities',
    'catalog_packages',
    'catalog_package_prices',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }

  assert.match(sql, /grant select on table public\.catalog_authorities to anon/i);
  assert.match(sql, /status = 'published'/i);
  assert.match(sql, /approved_at is not null/i);
  assert.match(sql, /effective_from <= current_date/i);
  assert.match(sql, /effective_to is null or[\s\S]*effective_to >= current_date/i);
  assert.match(
    sql,
    /function public\.catalog_version_is_public[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    sql,
    /create policy cost_data_public_read_approved[\s\S]*source_id is not null[\s\S]*catalog_authority_id is not null[\s\S]*cost_data_version_is_public/i,
  );
  assert.match(sql, /grant select on table public\.cost_data to anon/i);
  assert.match(sql, /drop policy if exists cost_data_admin_all on public\.cost_data/i);
  assert.match(
    sql,
    /revoke all on table public\.content_operation_receipts from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.content_audit_events from public, anon, authenticated/i,
  );
});

test('P3.04 migration quarantines legacy cost rows from public authority', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(
    sql,
    /alter table public\.cost_data[\s\S]*add column if not exists catalog_version_id/i,
  );
  assert.match(sql, /add column if not exists source_id/i);
  assert.match(sql, /add column if not exists row_version bigint not null default 1/i);
  assert.match(
    sql,
    /update public\.cost_data[\s\S]*set active = false[\s\S]*where source_id is null/i,
  );
  assert.match(sql, /comment on column public\.cost_data\.source_id[\s\S]*not authoritative/i);
});

test('cost-data mutations are transactional, idempotent, audited, and concurrency checked', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /create or replace function public\.mutate_cost_data\(/i);
  assert.match(sql, /create or replace function public\.import_cost_data\(/i);
  assert.match(sql, /from public\.content_operation_receipts[\s\S]*request_hash/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /row_version = row_version \+ 1/i);
  assert.match(sql, /raise exception 'stale_version'/i);
  assert.match(sql, /insert into public\.content_audit_events/i);
  assert.match(sql, /jsonb_to_recordset/i);
  assert.match(sql, /grant execute on function public\.mutate_cost_data/i);
  assert.match(sql, /grant execute on function public\.import_cost_data/i);
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.(?:mutate|import)_cost_data[^;]+ to authenticated/i,
  );
});
