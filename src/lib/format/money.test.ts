import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMoney } from './money';

test('formatMoney renders AED with currency symbol and 2 decimals', () => {
  const out = formatMoney(BigInt(125000), 'AED');
  assert.match(out, /1,250\.00/);
  assert.match(out, /AED/);
});

test('formatMoney handles zero amount', () => {
  const out = formatMoney(BigInt(0), 'AED');
  assert.match(out, /0\.00/);
});

test('formatMoney handles small fils amount', () => {
  const out = formatMoney(BigInt(50), 'AED');
  assert.match(out, /0\.50/);
});

test('formatMoney accepts plain number for compatibility', () => {
  const out = formatMoney(199, 'AED');
  assert.match(out, /1\.99/);
});
