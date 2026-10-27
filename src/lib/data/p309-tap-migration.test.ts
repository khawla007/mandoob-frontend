import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const path = 'supabase/migrations/20260922093000_p309_tap_integration.sql';

test('Tap migration owns durable effects, exact destinations, replay ledger and fenced claims', () => {
  const sql = readFileSync(join(process.cwd(), path), 'utf8');
  for (const table of [
    'payment_provider_attempts',
    'tap_provider_destinations',
    'tap_provider_events',
  ])
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'u'));
  for (const column of [
    'payload_hash',
    'provider_effect_key',
    'provider_effect_hash',
    'effect_lease_token',
    'effect_lease_expires_at',
    'provider_occurred_at',
    'last_provider_occurred_at',
    'last_provider_event_id',
    'lease_token',
    'lease_expires_at',
    'compensation_effect_key',
    'compensation_reference',
    'expected_invoice_version',
  ])
    assert.match(sql, new RegExp(column, 'u'));
  assert.match(sql, /unique \(provider, provider_effect_key\)/u);
  assert.match(sql, /unique \(destination_hash\)/u);
  assert.match(sql, /unique \(destination_id, provider_event_id\)/u);
  assert.match(sql, /for update skip locked/u);
  assert.doesNotMatch(sql, /claim_event_jobs|event_jobs|lease_event_job/u);
});

test('Tap RPCs are service-only, fixed search path, and atomically validate the full chain', () => {
  const sql = readFileSync(join(process.cwd(), path), 'utf8');
  for (const name of [
    'p309_reserve_payment_attempt',
    'p309_attach_payment_attempt',
    'p309_reconcile_payment_attempt',
    'p309_reserve_tap_event',
    'p309_reconcile_tap_event',
    'p309_claim_tap_recovery',
    'p309_complete_tap_recovery',
    'p309_claim_tap_compensation',
    'p309_attach_tap_compensation',
    'p309_reconcile_tap_compensation',
    'p309_complete_tap_compensation',
    'p309_claim_tap_event_recovery',
    'p309_get_refund_result',
  ]) {
    assert.match(sql, new RegExp(`create function public\\.${name}`, 'u'));
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public`, 'u'),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to service_role`, 'u'),
    );
  }
  assert.match(sql, /security definer set search_path = ''/u);
  assert.doesNotMatch(sql, /pg_catalog\.(?:coalesce|least|greatest)/u);
  for (const relation of [
    'company_profiles',
    'customer_profiles',
    'invoices',
    'payments',
    'refunds',
  ])
    assert.match(sql, new RegExp(`public\\.${relation}`, 'u'));
  assert.match(sql, /REFUND_EXCEEDS_CAPTURE/u);
  assert.match(sql, /provider_effect_hash/u);
  assert.match(sql, /finance_journals/u);
  assert.match(sql, /finance_journal_entries/u);
  assert.match(sql, /update public\.payments set status=v_target/u);
  assert.doesNotMatch(sql, /\('CAPTURED','AUTHORIZED'\)/u);
  assert.match(sql, /v_target='succeeded' and v_invoice_status<>'open'/u);
  assert.match(sql, /compensation_required/u);
  assert.match(sql, /create function public\.p309_claim_tap_compensation/u);
  assert.match(sql, /create function public\.p309_reconcile_tap_compensation/u);
  assert.match(sql, /state='compensation_required'[\s\S]*?provider_event/u);
  assert.match(sql, /from public\.payment_allocations[\s\S]*?for update/u);
  assert.match(sql, /from public\.finance_credit_notes[\s\S]*?for update/u);
  assert.match(sql, /from public\.refund_allocations[\s\S]*?for update/u);
  assert.match(sql, /v_collectible:=v_invoice\.amount_minor-v_allocated-v_credited\+v_refunded/u);
  assert.match(sql, /if v_collectible<=0 then raise exception/u);
  assert.match(sql, /'ownsEffect',false/u);
  assert.match(sql, /effect_lease_expires_at<=pg_catalog\.clock_timestamp\(\)/u);
  assert.match(sql, /create function public\.p309_reconcile_claimed_refund/u);
  assert.match(sql, /recovery_lease_expires_at<=pg_catalog\.clock_timestamp\(\)/u);
  assert.match(sql, /message='STALE_FENCE'/u);
  assert.match(
    sql,
    /p309_attach_refund_effect_recovery\([\s\S]*?p_worker_id uuid,p_lease_token uuid/u,
  );
  assert.match(sql, /v\.state='reserved'[\s\S]*?'reserved',true/u);
  assert.match(
    sql,
    /\(v_event\.provider_occurred_at,v_event\.provider_event_id,v_event\.body_hash\)/u,
  );
  assert.match(sql, /v_attempt\.state='failed'[\s\S]*?CAPTURED/u);
  assert.match(
    sql,
    /attempt\.state='attached' or attempt\.effect_lease_expires_at<pg_catalog\.clock_timestamp\(\)/u,
  );
});

test('provider replay fixture behaviorally covers replay, ordering, journals and stale fences', () => {
  const fixture = readFileSync(
    join(process.cwd(), 'supabase/tests/p309_provider_replay.sql'),
    'utf8',
  );
  for (const marker of [
    'OUTSTANDING_NOT_AUTHORITATIVE',
    'DUPLICATE_EFFECT_OWNER',
    'FAILURE_POSTED_JOURNAL',
    'MISMATCHED_AMOUNT_ACCEPTED',
    'MISMATCHED_CURRENCY_ACCEPTED',
    'MISMATCHED_CHARGE_ACCEPTED',
    'LATER_CAPTURE_BLOCKED',
    'STALE_EVENT_APPLIED',
    'VOID_RACE_POSTED_PAYMENT',
    'REFUND_DOUBLE_CLAIMED',
    'STALE_REFUND_WORKER_MUTATED',
    'STALE_REFUND_FENCE_RECONCILED',
    'REFUND_FAILURE_POSTED_JOURNAL',
    'RESERVATION_RECEIPT_NOT_AUTHORITATIVE',
    'VOID_CAPTURE_NOT_COMPENSATABLE',
    'VOID_CAPTURE_EVENT_DISPOSITION_MISSING',
    'COMPENSATION_DOUBLE_CLAIMED',
    'STALE_COMPENSATION_FENCE_RECONCILED',
    'COMPENSATION_NOT_TERMINAL',
    'CHANGED_EXPECTED_VERSION_ACCEPTED',
    'STRANDED_EVENT_NOT_CLAIMED',
    'STALE_EVENT_WORKER_RECONCILED',
    'REFUND_DURABLE_RESULT_MISMATCH',
    'TERMINAL_CREATE_FAILURE_NOT_RELEASED',
  ])
    assert.match(fixture, new RegExp(marker, 'u'));
  assert.match(fixture, /begin;[\s\S]*rollback;/u);
});
