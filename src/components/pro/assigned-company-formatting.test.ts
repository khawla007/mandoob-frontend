import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCompanyMoney, localizeOperationalValue } from './assigned-company-formatting';

test('operational values use localized labels and hide unknown raw enum values', () => {
  const labels = { paid: 'Paid' };

  assert.equal(localizeOperationalValue(labels, 'paid', 'Unknown status'), 'Paid');
  assert.equal(
    localizeOperationalValue(labels, 'private_future_status', 'Unknown status'),
    'Unknown status',
  );
});

test('money formatting requires and honors the requested locale', () => {
  const english = formatCompanyMoney(12345, 'AED', 'en');
  const arabic = formatCompanyMoney(12345, 'AED', 'ar');

  assert.notEqual(english, arabic);
  assert.match(english, /123\.45/);
  assert.match(arabic, /[\u0600-\u06ff]/u);
});
