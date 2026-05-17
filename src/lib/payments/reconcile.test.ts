import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapTapChargeToPaymentStatus } from './reconcile';

const NOW = new Date('2026-05-07T08:00:00.000Z');

test('mapTapChargeToPaymentStatus maps CAPTURED to succeeded', () => {
  assert.equal(
    mapTapChargeToPaymentStatus({
      currentStatus: 'initiated',
      tapStatus: 'CAPTURED',
      paymentCreatedAt: '2026-05-07T07:00:00.000Z',
      now: NOW,
    }),
    'succeeded',
  );
});

test('mapTapChargeToPaymentStatus maps FAILED and DECLINED to failed', () => {
  for (const tapStatus of ['FAILED', 'DECLINED']) {
    assert.equal(
      mapTapChargeToPaymentStatus({
        currentStatus: 'initiated',
        tapStatus,
        paymentCreatedAt: '2026-05-07T07:00:00.000Z',
        now: NOW,
      }),
      'failed',
    );
  }
});

test('mapTapChargeToPaymentStatus maps VOID to voided', () => {
  assert.equal(
    mapTapChargeToPaymentStatus({
      currentStatus: 'initiated',
      tapStatus: 'VOID',
      paymentCreatedAt: '2026-05-07T07:00:00.000Z',
      now: NOW,
    }),
    'voided',
  );
});

test('mapTapChargeToPaymentStatus leaves active statuses initiated before abandoned cutoff', () => {
  for (const tapStatus of ['INITIATED', 'IN_PROGRESS', 'AUTHORIZED']) {
    assert.equal(
      mapTapChargeToPaymentStatus({
        currentStatus: 'initiated',
        tapStatus,
        paymentCreatedAt: '2026-05-07T07:30:01.000Z',
        now: NOW,
      }),
      'initiated',
    );
  }
});

test('mapTapChargeToPaymentStatus marks active statuses abandoned after cutoff', () => {
  assert.equal(
    mapTapChargeToPaymentStatus({
      currentStatus: 'initiated',
      tapStatus: 'INITIATED',
      paymentCreatedAt: '2026-05-07T06:59:59.000Z',
      now: NOW,
    }),
    'abandoned',
  );
});

test('mapTapChargeToPaymentStatus no-ops existing terminal statuses', () => {
  for (const currentStatus of ['succeeded', 'failed', 'refunded', 'partially_refunded', 'abandoned', 'voided']) {
    assert.equal(
      mapTapChargeToPaymentStatus({
        currentStatus,
        tapStatus: 'CAPTURED',
        paymentCreatedAt: '2026-05-07T06:00:00.000Z',
        now: NOW,
      }),
      currentStatus,
    );
  }
});
