import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  locales,
  defaultLocale,
  dirOf,
  isSupportedLocale,
  coerceLocale,
  NEXT_LOCALE_COOKIE,
} from './config';

describe('i18n/config', () => {
  it('exposes the expected locale set for step 29a', () => {
    assert.deepEqual([...locales], ['en', 'ar']);
  });

  it('defaults to English', () => {
    assert.equal(defaultLocale, 'en');
  });

  it('returns rtl only for Arabic', () => {
    assert.equal(dirOf('ar'), 'rtl');
    assert.equal(dirOf('en'), 'ltr');
  });

  it('recognises only supported locales', () => {
    assert.equal(isSupportedLocale('en'), true);
    assert.equal(isSupportedLocale('ar'), true);
    assert.equal(isSupportedLocale('fr'), false);
    assert.equal(isSupportedLocale(null), false);
    assert.equal(isSupportedLocale(undefined), false);
    assert.equal(isSupportedLocale(''), false);
  });

  it('coerces unknown values to default', () => {
    assert.equal(coerceLocale('en'), 'en');
    assert.equal(coerceLocale('ar'), 'ar');
    assert.equal(coerceLocale('xx'), 'en');
    assert.equal(coerceLocale(null), 'en');
  });

  it('exports the cookie name expected by Next.js', () => {
    assert.equal(NEXT_LOCALE_COOKIE, 'NEXT_LOCALE');
  });
});
