import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/app/(tenant)/t/[tenant]/(pro)/payments/page.tsx', 'utf8');

test('PRO payments heading has a resolved bilingual translation', () => {
  assert.match(page, /getTranslations\('pro'\)/u);
  assert.match(page, /t\('payments'\)/u);

  for (const locale of ['en', 'ar']) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, 'utf8')) as {
      pro?: { payments?: unknown };
    };
    assert.equal(typeof messages.pro?.payments, 'string', locale);
    assert.notEqual(messages.pro?.payments, 'pro.payments', locale);
  }
});
