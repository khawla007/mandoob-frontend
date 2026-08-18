import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('Tap reconciliation poller resumes pending refunds through the company atomic RPC', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/api/v1/cron/reconcile-tap-payments/route.ts'),
    'utf8',
  );
  assert.match(source, /from\('refunds'\)[\s\S]*eq\('status', 'pending'\)/u);
  assert.match(source, /not\('provider_refund_id', 'is', null\)/u);
  assert.match(source, /from\('payments'\)[\s\S]*eq\('tenant_id', row\.tenant_id\)/u);
  assert.match(source, /from\('invoices'\)[\s\S]*eq\('tenant_id', row\.tenant_id\)/u);
  assert.match(source, /companyId: invoice\.company_id/u);
  assert.match(source, /getRefund\(providerRefundId, config\)/u);
  assert.match(source, /rpc\(\s*'reconcile_company_refund'/u);
  assert.match(source, /p_company_id: input\.companyId/u);
  assert.match(source, /result\?\.refund_id !== input\.refundId/u);
  assert.match(source, /drainPendingRefundPages<RefundRow>/u);
  assert.match(source, /MAX_REFUND_PAGES = 20/u);
  assert.match(source, /created_at\.gt\.\$\{cursor\.createdAt\}/u);
  assert.match(source, /id\.gt\.\$\{cursor\.id\}/u);
  assert.match(source, /order\('created_at', \{ ascending: true \}\)[\s\S]*order\('id'/u);
  assert.match(source, /from\('refund_reconciliation_state'\)/u);
  assert.match(source, /initialCursor: persistedCursor/u);
  assert.match(source, /persistRefundCursor\(supabase, result\.nextCursor\)/u);
  assert.doesNotMatch(source, /nextCursor:\s*_nextCursor/u);
  assert.match(source, /cursor_created_at: cursor\?\.createdAt/u);
  assert.match(source, /cursor_id: cursor\?\.id/u);
});

test('refund reconciliation cursor is service-role-only durable state', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260818110000_0064_company_security_workflows.sql'),
    'utf8',
  );
  assert.match(migration, /create table public\.refund_reconciliation_state/u);
  assert.match(migration, /cursor_created_at timestamptz/u);
  assert.match(migration, /cursor_id uuid/u);
  assert.match(
    migration,
    /alter table public\.refund_reconciliation_state enable row level security/u,
  );
  assert.match(migration, /revoke all on table public\.refund_reconciliation_state from public/u);
  assert.match(
    migration,
    /grant select, insert, update on table public\.refund_reconciliation_state to service_role/u,
  );
});
