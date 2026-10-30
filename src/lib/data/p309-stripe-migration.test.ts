import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260922095000_p309_stripe_integration.sql',
    import.meta.url,
  ),
  'utf8',
);

test('Stripe effects, customer authority, and events are durable and service-only', () => {
  for (const name of [
    'stripe_customer_mappings',
    'stripe_subscription_operations',
    'stripe_provider_events',
    'p309_reserve_stripe_operation',
    'p309_attach_stripe_operation',
    'p309_reserve_stripe_event',
    'p309_apply_stripe_subscription_event',
    'p309_claim_stripe_operation_recovery',
  ])
    assert.match(sql, new RegExp(name));
  assert.match(sql, /security definer set search_path = ''/u);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/u);
  assert.match(sql, /unique \(destination, provider_event_id\)/u);
  assert.match(sql, /unique \(destination, stripe_customer_id\)/u);
  assert.match(sql, /for update skip locked/u);
});

test('atomic apply uses mapping authority, exact price facts, total event order, and P3.10', () => {
  assert.match(
    sql,
    /from public\.stripe_customer_mappings[\s\S]*stripe_customer_id=p_stripe_customer_id/u,
  );
  assert.match(
    sql,
    /from public\.subscription_provider_price_mappings[\s\S]*provider_price_id=p_provider_price_id/u,
  );
  assert.match(sql, /v_mapping\.amount_minor<>p_amount_minor/u);
  assert.match(sql, /v_mapping\.currency<>upper\(p_currency\)/u);
  assert.match(sql, /v_mapping\.interval<>p_interval/u);
  assert.match(sql, /\(v_event\.provider_created,v_event\.provider_event_id,v_event\.body_hash\)/u);
  assert.match(sql, /insert into public\.subscription_period_snapshots/u);
  assert.match(sql, /public\.publish_domain_event/u);
  assert.doesNotMatch(sql, /metadata_tenant_id\s*:=/u);
});

test('inbound events recheck active effective provider policy and live catalog class', () => {
  const apply = sql.slice(
    sql.indexOf('create or replace function public.p309_apply_stripe_subscription_event'),
    sql.indexOf('insert into public.event_contract_registrations'),
  );
  assert.match(apply, /subscription_provider_enablement/u);
  assert.match(apply, /c\.state='active'/u);
  assert.match(apply, /c\.effective_from<=/u);
  assert.match(apply, /catalog_class='demo'[\s\S]*\('live','production'\)/u);
  assert.match(apply, /catalog_class='local'[\s\S]*destination='production'/u);
});

test('Stripe operation reservation enforces the authoritative PRO company scope in SQL', () => {
  const reserve = sql.slice(
    sql.indexOf('create or replace function public.p309_reserve_stripe_operation'),
    sql.indexOf('create or replace function public.p309_attach_stripe_operation'),
  );
  assert.match(reserve, /p_company_id uuid/u);
  assert.match(reserve, /p309_assert_pro_finance_scope\(p_actor_id,p_tenant_id,p_company_id\)/u);
  assert.ok(
    reserve.indexOf('p309_assert_pro_finance_scope') <
      reserve.indexOf('stripe_subscription_operations where operation_id'),
  );
});

test('delinquency grace and completed pending changes are reconciled atomically', () => {
  const apply = sql.slice(
    sql.indexOf('create or replace function public.p309_apply_stripe_subscription_event'),
    sql.indexOf('insert into public.event_contract_registrations'),
  );
  assert.match(apply, /p_status='past_due'[\s\S]*interval '7 days'/u);
  assert.match(apply, /grace_until=excluded\.grace_until/u);
  assert.match(apply, /pending_plan[\s\S]*pending_cadence[\s\S]*pending_effective_at/u);
  assert.match(apply, /case when public\.subscriptions\.pending_plan=excluded\.plan/u);
});

test('demo/live and local/production are fail-closed', () => {
  assert.match(sql, /catalog_class='demo'[\s\S]*p_destination in \('live','production'\)/u);
  assert.match(sql, /catalog_class='local'[\s\S]*p_destination='production'/u);
  assert.match(sql, /PROVIDER_UNAVAILABLE/u);
});
