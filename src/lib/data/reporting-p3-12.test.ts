import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseOperationalReport, validateExportSearchParams } from '../reporting/runtime-contracts';

test('parses real zeroes and explicit partial sources', () => {
  const parsed = parseOperationalReport({
    reportVersion: 1,
    scope: 'platform',
    generatedAt: '2026-10-27T00:00:00.000Z',
    businessTimezone: 'Asia/Dubai',
    state: 'partial',
    counts: { companies: 0, activeEmployees: 0, overdueRenewals: 0, scheduledMeetings: 0 },
    sourceFreshness: { local: '2026-10-27T00:00:00.000Z' },
    unavailableSources: ['P3_09_NOT_INTEGRATED'],
  });
  assert.equal(parsed.counts.companies, 0);
  assert.deepEqual(parsed.unavailableSources, ['P3_09_NOT_INTEGRATED']);
});

test('rejects unsafe, unknown, and repeated export parameters', () => {
  assert.deepEqual(validateExportSearchParams(new URLSearchParams()), {});
  assert.throws(() =>
    validateExportSearchParams(new URLSearchParams('scope=platform&scope=company')),
  );
  assert.throws(() => validateExportSearchParams(new URLSearchParams('companyId=guessed')));
  assert.throws(() => validateExportSearchParams(new URLSearchParams('unknown=x')));
});

test('rejects malformed database report payloads', () => {
  assert.throws(() => parseOperationalReport({ state: 'ready', counts: { companies: -1 } }));
});

test('export authenticates before its sanitized operational failure boundary', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/admin/reports/export/route.ts'), 'utf8');
  assert.ok(route.indexOf('await requirePlatformOperator()') < route.indexOf('try {'));
  assert.match(route, /cache-control': 'private, no-store/u);
  assert.match(route, /REPORT_EXPORT_UNAVAILABLE/u);
});
