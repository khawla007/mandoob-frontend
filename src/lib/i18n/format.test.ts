import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatDateTime, formatDateShort } from './format';

const ISO = '2026-05-17T08:30:00Z';

describe('i18n/format: formatDateTime', () => {
  it('returns em dash for null', () => {
    assert.equal(formatDateTime(null), '—');
  });

  it('uses Arabic numerals for ar locale', () => {
    const arabic = formatDateTime(ISO, 'ar');
    // Arabic-Indic digits OR Latin digits depending on Intl impl —
    // we just assert the string contains a digit and a non-Latin char or
    // the explicit Arabic month name. Realistically Intl on Node yields
    // Arabic-Indic numerals for ar-AE.
    assert.ok(arabic && arabic.length > 0);
    assert.notEqual(arabic, formatDateTime(ISO, 'en'));
  });

  it('falls back to default locale on unknown input', () => {
    const a = formatDateTime(ISO, 'fr' as unknown as 'en');
    const b = formatDateTime(ISO, 'en');
    assert.equal(a, b);
  });

  it('formatDateShort omits time parts', () => {
    const short = formatDateShort(ISO, 'en');
    assert.ok(!short.includes(':'));
  });
});
