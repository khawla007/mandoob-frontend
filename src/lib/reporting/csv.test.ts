import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeCsv, sanitizeSpreadsheetCell } from './csv';

test('spreadsheet cells neutralize formulas, controls, tabs, and leading whitespace tricks', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '\t=cmd', '\r=cmd', '  =cmd']) {
    const sanitized = sanitizeSpreadsheetCell(value);
    assert.equal(sanitized.startsWith("'"), true, value);
  }
  assert.equal(sanitizeSpreadsheetCell('ordinary text'), 'ordinary text');
  assert.equal(sanitizeSpreadsheetCell('line\u0000break'), 'linebreak');
});

test('CSV is UTF-8 BOM encoded with locale-independent values and escaped quotes', () => {
  const result = encodeCsv(
    ['id', 'amount_minor', 'label'],
    [{ id: '1', amount_minor: 1234, label: 'A "quoted", value' }],
  );
  assert.equal(result.startsWith('\uFEFF'), true);
  assert.match(result, /1,1234,"A ""quoted"", value"/u);
  assert.equal(result.includes('1,234'), false);
});

test('CSV rejects unbounded output', () => {
  assert.throws(
    () =>
      encodeCsv(
        ['id'],
        Array.from({ length: 1001 }, (_, id) => ({ id })),
      ),
    /row limit/u,
  );
});
