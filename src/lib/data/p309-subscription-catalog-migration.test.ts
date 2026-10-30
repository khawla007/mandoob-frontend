import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260922094000_p309_subscription_catalog.sql'),
  'utf8',
);

test('catalog migration is versioned, snapshotted, replay safe, and service-only', () => {
  for (const table of [
    'subscription_catalog_versions',
    'subscription_plan_prices',
    'subscription_plan_allowances',
    'subscription_addons',
    'subscription_provider_enablement',
    'subscription_provider_price_mappings',
    'subscription_period_snapshots',
    'subscription_usage',
  ])
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'iu'));
  assert.match(
    sql,
    /p309_consume_plan_allowance[\s\S]*security definer[\s\S]*set search_path = ''/iu,
  );
  assert.match(sql, /unique[\s\S]*operation_id/iu);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/iu);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/iu);
});

test('demo catalog has exact AED seed and cannot be live-enabled even by an override', () => {
  assert.match(sql, /p309-demo-aed-v1/);
  assert.match(sql, /'demo'[\s\S]*'AED'/u);
  for (const value of [
    '19900',
    '199000',
    '49900',
    '499000',
    '99900',
    '999000',
    '5368709120',
    '26843545600',
    '107374182400',
  ])
    assert.match(sql, new RegExp(value));
  assert.match(
    sql,
    /v_class = 'demo'[\s\S]*destination in \('live','production'\)[\s\S]*LIVE_DEMO_FORBIDDEN/iu,
  );
  assert.match(
    sql,
    /v_class = 'local'[\s\S]*destination = 'production'[\s\S]*PRODUCTION_LOCAL_FORBIDDEN/iu,
  );
});

test('Tap enablement is independent while Stripe mappings are exact', () => {
  assert.match(sql, /subscription_provider_enablement/);
  assert.match(sql, /subscription_provider_price_mappings/);
  assert.match(
    sql,
    /provider text not null check \(provider = 'stripe'\)[\s\S]*currency[\s\S]*amount_minor[\s\S]*interval/iu,
  );
  assert.match(sql, /subscription_provider_enablement[\s\S]*provider in \('stripe','tap'\)/iu);
});

test('invoice and finance-export owning transactions call entitlement enforcement', () => {
  assert.match(sql, /p309_enforce_invoice_allowance[\s\S]*p309_consume_plan_allowance/iu);
  assert.match(sql, /p309_consume_finance_export[\s\S]*p309_consume_plan_allowance/iu);
});
