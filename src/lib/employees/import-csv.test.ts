import assert from 'node:assert/strict';
import test from 'node:test';
import { IMPORT_LIMITS, validateEmployeeImportBytes } from './import-csv';

const encode = (text: string) => new TextEncoder().encode(text);

test('valid CSV yields ordinal rows, in-file passport duplicates and field errors', () => {
  const result = validateEmployeeImportBytes(
    encode(
      '﻿name,email,passport_no,visa_expiry,job_title\n' +
        'Alpha,alpha@example.invalid,p1234567,2027-01-01,Engineer\n' +
        '\n' +
        'Beta,not-an-email,B7654321,,\n' +
        'Gamma,,P1234567 ,2027-13-40,\n' +
        '"Delta, Jr",,D0000001,,Lead\n',
    ),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totalRows, 4);
  assert.deepEqual(
    result.rows.map((row) => [row.rowNumber, row.outcome]),
    [
      [1, 'valid'],
      [2, 'invalid'],
      [3, 'duplicate_in_file'],
      [4, 'valid'],
    ],
  );
  const first = result.rows[0];
  assert.ok(first.outcome === 'valid' && first.value.passport_no === 'P1234567');
  const fourth = result.rows[3];
  assert.ok(fourth.outcome === 'valid' && fourth.value.name === 'Delta, Jr');
  assert.deepEqual(
    result.errors.map((error) => [error.row_number, error.field, error.code]),
    [
      [2, 'email', 'INVALID_FORMAT'],
      [3, 'passport_no', 'DUPLICATE_IN_FILE'],
    ],
  );
  assert.equal(result.errorRows, 2);
});

test('rejects oversize, non UTF-8, NUL bytes, missing or unknown headers and row overflow', () => {
  assert.deepEqual(validateEmployeeImportBytes(new Uint8Array(IMPORT_LIMITS.maxBytes + 1)), {
    ok: false,
    code: 'FILE_TOO_LARGE',
  });
  assert.deepEqual(validateEmployeeImportBytes(new Uint8Array([0x6e, 0xff, 0xfe])), {
    ok: false,
    code: 'INVALID_ENCODING',
  });
  assert.deepEqual(validateEmployeeImportBytes(encode('name\nA\u0000\n')), {
    ok: false,
    code: 'INVALID_ENCODING',
  });
  assert.deepEqual(validateEmployeeImportBytes(encode('email\nx@example.invalid\n')), {
    ok: false,
    code: 'MISSING_REQUIRED_HEADER',
  });
  assert.deepEqual(validateEmployeeImportBytes(encode('name,salary\nA,1\n')), {
    ok: false,
    code: 'UNKNOWN_HEADER',
  });
  assert.deepEqual(validateEmployeeImportBytes(encode('name,name\nA,B\n')), {
    ok: false,
    code: 'DUPLICATE_HEADER',
  });
  assert.deepEqual(validateEmployeeImportBytes(encode('name\n')), { ok: false, code: 'NO_ROWS' });
  const many = 'name\n' + 'x\n'.repeat(IMPORT_LIMITS.maxRows + 1);
  assert.deepEqual(validateEmployeeImportBytes(encode(many)), { ok: false, code: 'TOO_MANY_ROWS' });
});

test('existing passports can be flagged before execution without changing row order', () => {
  const result = validateEmployeeImportBytes(encode('name,passport_no\nA,X1\nB,X2\n'), {
    isExistingPassport: (passport) => passport === 'X2',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((row) => row.outcome),
    ['valid', 'duplicate_existing'],
  );
});
