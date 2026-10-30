import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { z } from 'zod';
import {
  FINANCE_ACTION_ERROR_CODES,
  financeCommandMetaSchema,
  financeActionResultSchema,
  invoiceLineInputSchema,
  invoiceSnapshotSchema,
  moneySchema,
  paymentAllocationSchema,
  paymentAllocationForCurrencySchema,
  persistedMoneySchema,
  refundReceiptSchema,
  refundReceiptForCurrencySchema,
  sanitizeFinanceError,
} from './contracts';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const INVOICE_ID = '44444444-4444-4444-8444-444444444444';
const PAYMENT_ID = '55555555-5555-4555-8555-555555555555';
const ALLOCATION_ID = '66666666-6666-4666-8666-666666666666';
const REFUND_ID = '77777777-7777-4777-8777-777777777777';

const validLine = {
  description: 'Government filing',
  quantity: 2,
  unitAmountMinor: 10_000,
  discountMinor: 500,
  taxCategory: 'standard',
  taxBasis: 'exclusive',
  vatBasisPoints: 500,
  currency: 'AED',
} as const;

const validSnapshot = {
  invoiceId: INVOICE_ID,
  tenantId: TENANT_ID,
  companyId: COMPANY_ID,
  customerProfileId: CUSTOMER_ID,
  version: 1,
  status: 'open',
  currency: 'AED',
  subtotalMinor: 19_500,
  vatMinor: 975,
  totalMinor: 20_475,
  allocatedMinor: 0,
  creditedMinor: 0,
  outstandingMinor: 20_475,
  refundedMinor: 0,
  dueDate: '2026-10-31',
  finalizedAt: '2026-10-09T08:00:00.000Z',
  voidedAt: null,
  lines: [validLine],
} as const;

describe('strict finance inputs', () => {
  test('requires strict replay-safe command metadata', () => {
    const input = {
      actorId: CUSTOMER_ID,
      operationId: ALLOCATION_ID,
      expectedVersion: 0,
      payloadHash: 'a'.repeat(64),
    };
    assert.deepEqual(financeCommandMetaSchema.parse(input), input);
    for (const invalid of [
      { ...input, operationId: 'not-a-uuid' },
      { ...input, actorId: 'not-a-uuid' },
      { ...input, expectedVersion: -1 },
      { ...input, expectedVersion: 0.5 },
      { ...input, payloadHash: 'raw-payload' },
      { ...input, providerResponse: 'raw-canary' },
    ]) {
      assert.equal(financeCommandMetaSchema.safeParse(invalid).success, false);
    }
  });

  test('accepts only safe integer minor units and Task 1 ISO currencies', () => {
    assert.deepEqual(moneySchema.parse({ amountMinor: Number.MAX_SAFE_INTEGER, currency: 'AED' }), {
      amountMinor: Number.MAX_SAFE_INTEGER,
      currency: 'AED',
    });
    for (const amountMinor of [1.25, 0.1 + 0.2, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(moneySchema.safeParse({ amountMinor, currency: 'AED' }).success, false);
    }
    assert.equal(moneySchema.safeParse({ amountMinor: 1, currency: 'ZZZ' }).success, false);
    assert.equal(moneySchema.safeParse({ amountMinor: 1, currency: 'aed' }).success, false);
  });

  test('distinguishes generic safe money from DB-persisted amount bounds', () => {
    assert.equal(
      moneySchema.safeParse({ amountMinor: Number.MAX_SAFE_INTEGER, currency: 'AED' }).success,
      true,
    );
    for (const amountMinor of [-100_000_000_000, 100_000_000_000]) {
      assert.equal(persistedMoneySchema.safeParse({ amountMinor, currency: 'AED' }).success, true);
    }
    for (const amountMinor of [-100_000_000_001, 100_000_000_001]) {
      assert.equal(persistedMoneySchema.safeParse({ amountMinor, currency: 'AED' }).success, false);
    }
  });

  test('rejects excess fields, unknown enums, invalid tax provenance, and excessive discounts', () => {
    const invalid = [
      { ...validLine, providerResponse: 'raw-canary' },
      { ...validLine, taxCategory: 'reduced' },
      { ...validLine, taxBasis: 'unknown' },
      { ...validLine, vatBasisPoints: 499 },
      { ...validLine, taxCategory: 'exempt', taxBasis: 'exclusive' },
      { ...validLine, taxCategory: 'exempt', taxBasis: 'exempt', vatBasisPoints: 500 },
      { ...validLine, discountMinor: 20_001 },
      { ...validLine, quantity: 1.5 },
    ];

    for (const input of invalid) {
      assert.equal(invoiceLineInputSchema.safeParse(input).success, false);
    }
  });

  test('rejects a line whose computed exclusive VAT pushes the total over the line limit', () => {
    assert.equal(
      invoiceLineInputSchema.safeParse({
        ...validLine,
        quantity: 1,
        unitAmountMinor: 100_000_000_000,
        discountMinor: 0,
      }).success,
      false,
    );
    assert.equal(
      invoiceLineInputSchema.safeParse({
        ...validLine,
        taxBasis: 'inclusive',
        unitAmountMinor: 100_000_000_000,
        quantity: 1,
        discountMinor: 0,
      }).success,
      true,
    );
  });
});

describe('strict finance read models', () => {
  test('parses an invoice snapshot and rejects unknown status or excess fields', () => {
    assert.deepEqual(invoiceSnapshotSchema.parse(validSnapshot), validSnapshot);
    assert.equal(
      invoiceSnapshotSchema.safeParse({ ...validSnapshot, status: 'unknown' }).success,
      false,
    );
    assert.equal(
      invoiceSnapshotSchema.safeParse({ ...validSnapshot, raw: 'db-canary' }).success,
      false,
    );
    assert.equal(
      invoiceSnapshotSchema.safeParse({
        ...validSnapshot,
        lines: [{ ...validLine, currency: 'USD' }],
      }).success,
      false,
    );
  });

  test('rejects impossible business dates and inconsistent lifecycle timestamps', () => {
    const invalid = [
      { ...validSnapshot, dueDate: '2026-02-30' },
      { ...validSnapshot, status: 'draft', finalizedAt: validSnapshot.finalizedAt },
      { ...validSnapshot, status: 'open', finalizedAt: null },
      { ...validSnapshot, status: 'paid', voidedAt: '2026-10-10T08:00:00.000Z' },
      { ...validSnapshot, status: 'void', voidedAt: null },
      {
        ...validSnapshot,
        status: 'void',
        finalizedAt: null,
        voidedAt: '2026-10-10T08:00:00.000Z',
      },
      {
        ...validSnapshot,
        status: 'void',
        finalizedAt: '2026-10-10T08:00:00.000Z',
        voidedAt: '2026-10-09T08:00:00.000Z',
      },
    ];
    for (const snapshot of invalid) {
      assert.equal(invoiceSnapshotSchema.safeParse(snapshot).success, false);
    }

    assert.equal(
      invoiceSnapshotSchema.safeParse({
        ...validSnapshot,
        status: 'draft',
        finalizedAt: null,
        voidedAt: null,
      }).success,
      true,
    );
    assert.equal(
      invoiceSnapshotSchema.safeParse({
        ...validSnapshot,
        status: 'void',
        outstandingMinor: 0,
        voidedAt: '2026-10-10T08:00:00.000Z',
      }).success,
      true,
    );
  });

  test('derives subtotal, VAT, and total from immutable line snapshots', () => {
    for (const patch of [
      {
        subtotalMinor: validSnapshot.subtotalMinor + 1,
        totalMinor: validSnapshot.totalMinor + 1,
        outstandingMinor: validSnapshot.outstandingMinor + 1,
      },
      {
        vatMinor: validSnapshot.vatMinor + 1,
        totalMinor: validSnapshot.totalMinor + 1,
        outstandingMinor: validSnapshot.outstandingMinor + 1,
      },
      {
        subtotalMinor: validSnapshot.subtotalMinor + 1,
        vatMinor: validSnapshot.vatMinor - 1,
      },
    ]) {
      assert.equal(invoiceSnapshotSchema.safeParse({ ...validSnapshot, ...patch }).success, false);
    }
  });

  test('returns validation failure instead of throwing for invalid nested line calculations', () => {
    for (const line of [
      {
        ...validLine,
        quantity: 1,
        unitAmountMinor: 100_000_000_000,
        discountMinor: 0,
      },
      { ...validLine, discountMinor: 20_001 },
    ]) {
      let result: ReturnType<typeof invoiceSnapshotSchema.safeParse> | undefined;
      assert.doesNotThrow(() => {
        result = invoiceSnapshotSchema.safeParse({ ...validSnapshot, lines: [line] });
      });
      assert.equal(result?.success, false);
    }
  });

  test('bounds immutable invoice snapshots to 500 lines', () => {
    assert.equal(
      invoiceSnapshotSchema.safeParse({
        ...validSnapshot,
        lines: Array.from({ length: 501 }, () => validLine),
      }).success,
      false,
    );
  });

  test('enforces status-specific allocation, credit, refund, and balance invariants', () => {
    const valid = [
      {
        ...validSnapshot,
        status: 'draft',
        finalizedAt: null,
        outstandingMinor: validSnapshot.totalMinor,
      },
      {
        ...validSnapshot,
        status: 'open',
        allocatedMinor: 1_000,
        refundedMinor: 500,
        outstandingMinor: validSnapshot.totalMinor - 1_000,
      },
      {
        ...validSnapshot,
        status: 'paid',
        allocatedMinor: validSnapshot.totalMinor,
        outstandingMinor: 0,
      },
      {
        ...validSnapshot,
        status: 'partially_refunded',
        allocatedMinor: validSnapshot.totalMinor,
        refundedMinor: 500,
        outstandingMinor: 0,
      },
      {
        ...validSnapshot,
        status: 'refunded',
        allocatedMinor: validSnapshot.totalMinor,
        refundedMinor: validSnapshot.totalMinor,
        outstandingMinor: 0,
      },
      {
        ...validSnapshot,
        status: 'void',
        outstandingMinor: 0,
        voidedAt: '2026-10-10T08:00:00.000Z',
      },
    ];
    for (const snapshot of valid) {
      assert.equal(invoiceSnapshotSchema.safeParse(snapshot).success, true, snapshot.status);
    }

    const invalid = [
      { ...valid[0], allocatedMinor: 1 },
      { ...valid[0], creditedMinor: 1, outstandingMinor: validSnapshot.totalMinor - 1 },
      { ...valid[0], refundedMinor: 1 },
      { ...validSnapshot, status: 'open', outstandingMinor: 0 },
      { ...valid[1], refundedMinor: 1_001 },
      { ...valid[2], refundedMinor: 1 },
      { ...valid[3], refundedMinor: 0 },
      { ...valid[3], refundedMinor: valid[3].allocatedMinor },
      { ...valid[4], allocatedMinor: 0, refundedMinor: 0 },
      { ...valid[4], refundedMinor: valid[4].allocatedMinor - 1 },
      { ...valid[5], allocatedMinor: 1 },
      { ...valid[5], creditedMinor: validSnapshot.totalMinor },
      { ...valid[5], refundedMinor: 1 },
    ];
    for (const snapshot of invalid) {
      assert.equal(invoiceSnapshotSchema.safeParse(snapshot).success, false, snapshot.status);
    }
  });

  test('keeps credit projections explicit and arithmetically consistent', () => {
    const creditedSnapshot = {
      invoiceId: INVOICE_ID,
      tenantId: TENANT_ID,
      companyId: COMPANY_ID,
      customerProfileId: CUSTOMER_ID,
      version: 2,
      status: 'open',
      currency: 'AED',
      subtotalMinor: 19_500,
      vatMinor: 975,
      totalMinor: 20_475,
      allocatedMinor: 1_000,
      creditedMinor: 475,
      outstandingMinor: 19_000,
      refundedMinor: 0,
      dueDate: '2026-10-31',
      finalizedAt: '2026-10-09T08:00:00.000Z',
      voidedAt: null,
      lines: [validLine],
    };
    assert.equal(invoiceSnapshotSchema.safeParse(creditedSnapshot).success, true);
    assert.equal(
      invoiceSnapshotSchema.safeParse({ ...creditedSnapshot, outstandingMinor: 19_001 }).success,
      false,
    );
    assert.equal(
      invoiceSnapshotSchema.safeParse({
        ...creditedSnapshot,
        allocatedMinor: 20_475,
        creditedMinor: 1,
        outstandingMinor: 0,
      }).success,
      false,
    );
  });

  test('composes allocation and refund schemas with authoritative invoice currency', () => {
    const allocation = {
      allocationId: ALLOCATION_ID,
      invoiceId: INVOICE_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 500,
      currency: 'AED',
      allocatedAt: '2026-10-09T08:10:00.000Z',
    };
    const receipt = {
      refundId: REFUND_ID,
      paymentId: PAYMENT_ID,
      invoiceId: INVOICE_ID,
      amountMinor: 250,
      currency: 'AED',
      status: 'succeeded',
      createdAt: '2026-10-09T08:20:00.000Z',
    };

    assert.deepEqual(paymentAllocationSchema.parse(allocation), allocation);
    assert.deepEqual(refundReceiptSchema.parse(receipt), receipt);
    assert.equal(
      paymentAllocationForCurrencySchema('AED').safeParse({ ...allocation, currency: 'USD' })
        .success,
      false,
    );
    assert.equal(
      refundReceiptForCurrencySchema('AED').safeParse({ ...receipt, currency: 'USD' }).success,
      false,
    );
    assert.equal(paymentAllocationForCurrencySchema('AED').safeParse(allocation).success, true);
    assert.equal(refundReceiptForCurrencySchema('AED').safeParse(receipt).success, true);
  });
});

describe('sanitized action results', () => {
  test('freezes the stable public error-code allowlist', () => {
    assert.deepEqual(FINANCE_ACTION_ERROR_CODES, [
      'VALIDATION_FAILED',
      'FORBIDDEN',
      'NOT_FOUND',
      'STALE_VERSION',
      'OPERATION_REUSED',
      'CURRENCY_MISMATCH',
      'OVERPAYMENT',
      'REFUND_EXCEEDS_CAPTURE',
      'PROVIDER_DISABLED',
      'PROVIDER_PENDING',
      'CONFLICT',
      'UNAVAILABLE',
    ]);
  });

  test('accepts only strict success data or a stable failure code', () => {
    const schema = financeActionResultSchema(z.object({ invoiceId: z.string().uuid() }).strict());
    assert.deepEqual(schema.parse({ ok: true, data: { invoiceId: INVOICE_ID } }), {
      ok: true,
      data: { invoiceId: INVOICE_ID },
    });
    assert.deepEqual(schema.parse({ ok: false, code: 'STALE_VERSION' }), {
      ok: false,
      code: 'STALE_VERSION',
    });
    assert.equal(schema.safeParse({ ok: false, code: 'DATABASE_ERROR' }).success, false);
    assert.equal(
      schema.safeParse({ ok: false, code: 'UNAVAILABLE', error: 'raw db canary' }).success,
      false,
    );
  });

  test('allowlists known codes and drops raw database or provider material', () => {
    assert.deepEqual(sanitizeFinanceError({ code: 'OVERPAYMENT', message: 'raw db canary' }), {
      ok: false,
      code: 'OVERPAYMENT',
    });
    const sanitized = sanitizeFinanceError({
      code: 'PGRST999',
      message: 'Bearer provider-secret raw-response-canary',
      details: { card: '4111111111111111' },
    });
    assert.deepEqual(sanitized, { ok: false, code: 'UNAVAILABLE' });
    assert.equal(JSON.stringify(sanitized).includes('canary'), false);
    assert.equal(JSON.stringify(sanitized).includes('4111111111111111'), false);
  });
});
