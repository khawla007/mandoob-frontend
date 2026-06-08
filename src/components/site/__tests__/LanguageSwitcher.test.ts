import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routing } from '@/i18n/routing';

test('routing exposes en and ar locales with en as default', () => {
  assert.deepEqual([...routing.locales], ['en', 'ar']);
  assert.equal(routing.defaultLocale, 'en');
  assert.equal(routing.localePrefix, 'as-needed');
});
