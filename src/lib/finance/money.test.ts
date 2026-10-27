import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addMoney, calculateInvoiceLineAmounts, createMoney, roundHalfAwayFromZero } from './money';

describe('checked money', () => {
  test('accepts zero, negative values, and the largest safe integer', () => {
    assert.deepEqual(createMoney(0, 'AED'), { amountMinor: 0, currency: 'AED' });
    assert.deepEqual(createMoney(-125, 'USD'), { amountMinor: -125, currency: 'USD' });
    assert.deepEqual(createMoney(Number.MAX_SAFE_INTEGER, 'JPY'), {
      amountMinor: Number.MAX_SAFE_INTEGER,
      currency: 'JPY',
    });
  });

  test('rejects unsafe, fractional, repeated-decimal, and unsupported currency inputs', () => {
    for (const amountMinor of [
      Number.MAX_SAFE_INTEGER + 1,
      1.5,
      0.1 + 0.2,
      Number.POSITIVE_INFINITY,
      Number.NaN,
    ]) {
      assert.throws(() => createMoney(amountMinor, 'AED'), /MONEY_AMOUNT_INVALID/);
    }

    for (const currency of ['aed', 'ZZZ', 'US', 'USDD']) {
      assert.throws(() => createMoney(100, currency), /CURRENCY_INVALID/);
    }
  });

  test('checks overflow and rejects mixed-currency arithmetic', () => {
    assert.throws(
      () => addMoney(createMoney(Number.MAX_SAFE_INTEGER, 'AED'), createMoney(1, 'AED')),
      /MONEY_OVERFLOW/,
    );
    assert.throws(
      () => addMoney(createMoney(100, 'AED'), createMoney(100, 'USD')),
      /CURRENCY_MISMATCH/,
    );
  });
});

describe('exact rounding and VAT', () => {
  test('rounds exact half boundaries away from zero', () => {
    assert.equal(roundHalfAwayFromZero(1, 2), 1);
    assert.equal(roundHalfAwayFromZero(-1, 2), -1);
    assert.equal(roundHalfAwayFromZero(3, 2), 2);
    assert.equal(roundHalfAwayFromZero(-3, 2), -2);
    assert.equal(roundHalfAwayFromZero(1, 3), 0);
  });

  test('calculates 5% exclusive VAT after discount', () => {
    assert.deepEqual(
      calculateInvoiceLineAmounts({
        quantity: 2,
        unitAmountMinor: 1_000,
        discountMinor: 100,
        taxBasis: 'exclusive',
        vatBasisPoints: 500,
      }),
      { netMinor: 1_900, vatMinor: 95, totalMinor: 1_995 },
    );
  });

  test('calculates 5% inclusive VAT without floating-point arithmetic', () => {
    assert.deepEqual(
      calculateInvoiceLineAmounts({
        quantity: 1,
        unitAmountMinor: 10_500,
        discountMinor: 0,
        taxBasis: 'inclusive',
        vatBasisPoints: 500,
      }),
      { netMinor: 10_000, vatMinor: 500, totalMinor: 10_500 },
    );
  });

  test('retains distinct exempt and zero-rated bases with zero VAT', () => {
    for (const taxBasis of ['exempt', 'zero_rated'] as const) {
      assert.deepEqual(
        calculateInvoiceLineAmounts({
          quantity: 1,
          unitAmountMinor: 1_000,
          discountMinor: 100,
          taxBasis,
          vatBasisPoints: 0,
        }),
        { netMinor: 900, vatMinor: 0, totalMinor: 900 },
      );
    }
  });

  test('enforces the database tax-basis rate contract', () => {
    for (const [taxBasis, vatBasisPoints] of [
      ['exclusive', 499],
      ['inclusive', 501],
      ['exempt', 500],
      ['zero_rated', 500],
    ] as const) {
      assert.throws(
        () =>
          calculateInvoiceLineAmounts({
            quantity: 1,
            unitAmountMinor: 100,
            discountMinor: 0,
            taxBasis,
            vatBasisPoints,
          }),
        /LINE_INPUT_INVALID/,
      );
    }
  });

  test('rejects discounts greater than the pre-discount line amount', () => {
    assert.throws(
      () =>
        calculateInvoiceLineAmounts({
          quantity: 2,
          unitAmountMinor: 500,
          discountMinor: 1_001,
          taxBasis: 'exclusive',
          vatBasisPoints: 500,
        }),
      /DISCOUNT_EXCEEDS_BASE/,
    );
  });
});
