import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routing } from '@/i18n/routing';
import { getDirection } from '@/lib/locale/getDirection';

test('generateStaticParams yields one entry per configured locale', () => {
  const expected = routing.locales.map((locale) => ({ locale }));
  assert.deepEqual(expected, [{ locale: 'en' }, { locale: 'ar' }]);
});

test('direction mapping covers every configured locale', () => {
  for (const locale of routing.locales) {
    const dir = getDirection(locale);
    assert.ok(dir === 'ltr' || dir === 'rtl');
  }
});
