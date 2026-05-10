import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clientCsvRowSchema,
  employeeCsvRowSchema,
  parseCsvRows,
  validateBulkImportRows,
} from './bulk-import';

test('clientCsvRowSchema accepts a valid client row', () => {
  const parsed = clientCsvRowSchema.parse({
    company_name: 'Acme Trading LLC',
    trade_license_no: 'TL-1001',
    jurisdiction: 'Dubai Mainland',
    license_expiry: '2027-12-31',
  });

  assert.equal(parsed.company_name, 'Acme Trading LLC');
  assert.equal(parsed.trade_license_no, 'TL-1001');
});

test('clientCsvRowSchema rejects missing company name and bad date', () => {
  const result = clientCsvRowSchema.safeParse({
    company_name: '',
    trade_license_no: 'TL-1001',
    jurisdiction: 'Dubai Mainland',
    license_expiry: '31-12-2027',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(
      result.error.issues.map((issue) => issue.path.join('.')),
      ['company_name', 'license_expiry'],
    );
  }
});

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
  const rows = parseCsvRows('\uFEFFcompany_name,trade_license_no\n"Acme, LLC",TL-1\n');

  assert.deepEqual(rows, [{ company_name: 'Acme, LLC', trade_license_no: 'TL-1' }]);
});

test('validateBulkImportRows reports row-numbered field errors', () => {
  const result = validateBulkImportRows('clients', [
    { company_name: 'Valid LLC', trade_license_no: 'TL-1', jurisdiction: '', license_expiry: '' },
    { company_name: '', trade_license_no: 'TL-2', jurisdiction: '', license_expiry: 'bad' },
  ]);

  assert.equal(result.totalRows, 2);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(
    result.errors.map((error) => [error.row_number, error.field]),
    [
      [3, 'company_name'],
      [3, 'license_expiry'],
    ],
  );
});
