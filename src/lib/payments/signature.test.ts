import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTapHashstring, tapHashstringInput, verifyTapHashstring } from './signature';

const FIELDS = {
  id: 'chg_TS01A1234',
  amount: '125.00',
  currency: 'AED',
  gatewayReference: 'gw_ref_77',
  paymentReference: 'pay_ref_88',
  status: 'CAPTURED',
  created: '1714900000000',
};

const SECRET = 'whsec_test_value';

test('tapHashstringInput concatenates fields in documented order', () => {
  const input = tapHashstringInput(FIELDS);
  assert.equal(
    input,
    'x_idchg_TS01A1234x_amount125.00x_currencyAEDx_gateway_referencegw_ref_77x_payment_referencepay_ref_88x_statusCAPTUREDx_created1714900000000',
  );
});

test('verifyTapHashstring accepts a correctly-signed hash', () => {
  const expected = computeTapHashstring(FIELDS, SECRET);
  assert.equal(verifyTapHashstring(FIELDS, expected, SECRET), true);
});

test('verifyTapHashstring rejects a tampered amount', () => {
  const expected = computeTapHashstring(FIELDS, SECRET);
  const tampered = { ...FIELDS, amount: '999.00' };
  assert.equal(verifyTapHashstring(tampered, expected, SECRET), false);
});

test('verifyTapHashstring rejects an empty header', () => {
  assert.equal(verifyTapHashstring(FIELDS, '', SECRET), false);
});

test('verifyTapHashstring rejects a wrong secret', () => {
  const expected = computeTapHashstring(FIELDS, SECRET);
  assert.equal(verifyTapHashstring(FIELDS, expected, 'whsec_other'), false);
});
