import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAcceptLanguage, resolveLocaleFromInputs } from './server';

describe('i18n/server: parseAcceptLanguage', () => {
  it('returns null when header is absent', () => {
    assert.equal(parseAcceptLanguage(null), null);
    assert.equal(parseAcceptLanguage(undefined), null);
    assert.equal(parseAcceptLanguage(''), null);
  });

  it('picks highest-q supported locale', () => {
    assert.equal(parseAcceptLanguage('ar-AE,ar;q=0.9,en;q=0.8'), 'ar');
    assert.equal(parseAcceptLanguage('en-US,en;q=0.9,ar;q=0.5'), 'en');
  });

  it('strips region subtags before matching', () => {
    assert.equal(parseAcceptLanguage('ar-SA'), 'ar');
    assert.equal(parseAcceptLanguage('en-GB'), 'en');
  });

  it('ignores unsupported locales', () => {
    assert.equal(parseAcceptLanguage('fr,de'), null);
    assert.equal(parseAcceptLanguage('fr-FR,en;q=0.5'), 'en');
  });
});

describe('i18n/server: resolveLocaleFromInputs', () => {
  it('prefers profile when supported', () => {
    assert.equal(
      resolveLocaleFromInputs({
        profileLocale: 'ar',
        cookieLocale: 'en',
        acceptLanguage: 'en',
      }),
      'ar',
    );
  });

  it('falls through to cookie when profile is unsupported', () => {
    assert.equal(
      resolveLocaleFromInputs({
        profileLocale: 'xx',
        cookieLocale: 'ar',
        acceptLanguage: 'en',
      }),
      'ar',
    );
  });

  it('falls through to Accept-Language when profile and cookie are missing', () => {
    assert.equal(
      resolveLocaleFromInputs({
        profileLocale: null,
        cookieLocale: null,
        acceptLanguage: 'ar-AE,en;q=0.5',
      }),
      'ar',
    );
  });

  it('returns default when nothing matches', () => {
    assert.equal(
      resolveLocaleFromInputs({
        profileLocale: null,
        cookieLocale: 'fr',
        acceptLanguage: 'de,it;q=0.5',
      }),
      'en',
    );
  });
});
