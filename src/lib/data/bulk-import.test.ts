import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeBulkImportRows,
  type BulkImportClientRow,
  type BulkImportEmployeeRow,
  type BulkImportStore,
} from './bulk-import';

function createStore(opts?: {
  existingClientLicenses?: string[];
  existingEmployeePassports?: string[];
  failClientLicenses?: string[];
  cancelAfter?: number;
}): BulkImportStore {
  let processed = 0;
  const clientLicenses = new Set(opts?.existingClientLicenses ?? []);
  const employeePassports = new Set(opts?.existingEmployeePassports ?? []);
  const failClientLicenses = new Set(opts?.failClientLicenses ?? []);

  return {
    async clientExistsByTradeLicense(_tenantId, tradeLicenseNo) {
      return clientLicenses.has(tradeLicenseNo);
    },
    async employeeExistsByPassport(_clientId, passportNo) {
      return employeePassports.has(passportNo);
    },
    async insertClient(_tenantId, row) {
      if (row.trade_license_no && failClientLicenses.has(row.trade_license_no)) {
        throw new Error('insert failed');
      }
      if (row.trade_license_no) clientLicenses.add(row.trade_license_no);
    },
    async insertEmployee(_tenantId, clientId, row) {
      if (row.passport_no) employeePassports.add(`${clientId}:${row.passport_no}`);
    },
    async updateProgress(_jobId, nextProcessed) {
      processed = nextProcessed;
    },
    async isCancelled() {
      return opts?.cancelAfter !== undefined && processed >= opts.cancelAfter;
    },
  };
}

test('executeBulkImportRows skips existing client trade licenses by default', async () => {
  const rows: BulkImportClientRow[] = [
    { company_name: 'Existing LLC', trade_license_no: 'TL-1', jurisdiction: '', license_expiry: '' },
    { company_name: 'Fresh LLC', trade_license_no: 'TL-2', jurisdiction: '', license_expiry: '' },
  ];

  const result = await executeBulkImportRows({
    jobId: 'job-1',
    kind: 'clients',
    tenantId: 'tenant-1',
    rows,
    store: createStore({ existingClientLicenses: ['TL-1'] }),
  });

  assert.equal(result.processedRows, 2);
  assert.equal(result.insertedRows, 1);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.errorRows, 1);
  assert.equal(result.errors[0].code, 'DUPLICATE_SKIPPED');
});

test('executeBulkImportRows records partial failures and completes the batch', async () => {
  const rows: BulkImportClientRow[] = Array.from({ length: 50 }, (_, index) => ({
    company_name: `Client ${index + 1}`,
    trade_license_no: `TL-${index + 1}`,
    jurisdiction: '',
    license_expiry: '',
  }));
  const failed = ['TL-1', 'TL-2', 'TL-3', 'TL-4', 'TL-5'];

  const result = await executeBulkImportRows({
    jobId: 'job-1',
    kind: 'clients',
    tenantId: 'tenant-1',
    rows,
    store: createStore({ failClientLicenses: failed }),
  });

  assert.equal(result.processedRows, 50);
  assert.equal(result.insertedRows, 45);
  assert.equal(result.errorRows, 5);
  assert.equal(result.status, 'completed');
});

test('executeBulkImportRows stops after cancellation is observed', async () => {
  const rows: BulkImportClientRow[] = Array.from({ length: 10 }, (_, index) => ({
    company_name: `Client ${index + 1}`,
    trade_license_no: `TL-${index + 1}`,
    jurisdiction: '',
    license_expiry: '',
  }));

  const result = await executeBulkImportRows({
    jobId: 'job-1',
    kind: 'clients',
    tenantId: 'tenant-1',
    rows,
    store: createStore({ cancelAfter: 3 }),
  });

  assert.equal(result.processedRows, 3);
  assert.equal(result.insertedRows, 3);
  assert.equal(result.status, 'cancelled');
});

test('executeBulkImportRows skips existing employee passport within selected client', async () => {
  const rows: BulkImportEmployeeRow[] = [
    {
      name: 'Existing Employee',
      email: 'existing@example.com',
      phone: '+971501111111',
      nationality: 'AE',
      passport_no: 'P-1',
      visa_no: '',
      visa_expiry: '',
      emirates_id: '',
      eid_expiry: '',
    },
  ];

  const result = await executeBulkImportRows({
    jobId: 'job-1',
    kind: 'employees',
    tenantId: 'tenant-1',
    parentClientId: 'client-1',
    rows,
    store: createStore({ existingEmployeePassports: ['P-1'] }),
  });

  assert.equal(result.insertedRows, 0);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.errors[0].field, 'passport_no');
});
