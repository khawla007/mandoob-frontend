import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatDateTime, formatDateShort } from './format';

const ISO = '2026-05-17T08:30:00Z';

describe('i18n/format: formatDateTime', () => {
  it('returns em dash for null', () => {
    assert.equal(formatDateTime(null), '—');
  });

  it('uses Arabic-locale formatter for ar', () => {
    const arabic = formatDateTime(ISO, 'ar');
    const expected = new Intl.DateTimeFormat('ar-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ISO));
    assert.equal(arabic, expected);
    // Sanity: the resolved locale chain for ar-AE must include "ar".
    const resolved = new Intl.DateTimeFormat('ar-AE').resolvedOptions().locale;
    assert.ok(
      resolved.startsWith('ar'),
      `expected resolved locale to start with "ar", got ${resolved}`,
    );
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
