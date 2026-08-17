import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countDistinctImportErrorRows,
  employeeCsvRowSchema,
  parseCsvRows,
  validateBulkImportRows,
} from './bulk-import';

test('employeeCsvRowSchema rejects malformed email and phone', () => {
  const result = employeeCsvRowSchema.safeParse({
    name: 'Nadia Khan',
    email: 'not-email',
    phone: '123',
    nationality: 'AE',
    passport_no: 'P1001',
    visa_no: 'V1001',
    visa_expiry: '2027-01-01',
    emirates_id: '784-1990-1234567-1',
    eid_expiry: '2027-01-01',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(
      result.error.issues.map((issue) => issue.path.join('.')),
      ['email', 'phone'],
    );
  }
});

test('parseCsvRows supports quoted commas and trims a UTF-8 BOM', () => {
  const rows = parseCsvRows('\uFEFFname,passport_no\n"Khan, Nadia",P-1\n');

  assert.deepEqual(rows, [{ name: 'Khan, Nadia', passport_no: 'P-1' }]);
});

test('validateBulkImportRows reports row-numbered field errors', () => {
  const result = validateBulkImportRows('employees', [
    { name: 'Nadia Khan', email: '', phone: '', visa_expiry: '' },
    { name: '', email: 'bad', phone: '', visa_expiry: '31-12-2027' },
  ]);

  assert.equal(result.totalRows, 2);
  assert.equal(result.validRows.length, 1);
  assert.deepEqual(result.validRows[0], {
    rowNumber: 2,
    value: {
      name: 'Nadia Khan',
      email: '',
      phone: '',
      visa_expiry: '',
    },
  });
  assert.equal(result.errors.length, 3);
  assert.deepEqual(
    result.errors.map((error) => [error.row_number, error.field]),
    [
      [3, 'name'],
      [3, 'email'],
      [3, 'visa_expiry'],
    ],
  );
  assert.equal(new Set(result.errors.map((error) => error.row_number)).size, 1);
  assert.equal(countDistinctImportErrorRows(result.errors), 1);
});
