import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassportForLookup } from '@/lib/crypto/passport-lookup';
import { validateBulkImportRows } from '@/lib/validation/bulk-import';
import {
  createSupabaseBulkImportStore,
  executeBulkImportRows,
  type BulkImportEmployeeRow,
  type BulkImportJobScope,
  type BulkImportStore,
} from './bulk-import';

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');

function employee(passportNo: string, rowNumber = 2): BulkImportEmployeeRow {
  return {
    rowNumber,
    value: {
      name: `Employee ${passportNo}`,
      email: '',
      phone: '',
      nationality: '',
      passport_no: passportNo,
      visa_no: '',
      visa_expiry: '',
      emirates_id: '',
      eid_expiry: '',
    },
  };
}

const scope: BulkImportJobScope = {
  jobId: 'job-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  expectedStatus: 'importing',
};

function createStore(opts?: {
  existingPassports?: string[];
  failPassports?: string[];
  cancelAfter?: number;
}) {
  let processed = 0;
  let preloadCalls = 0;
  const inserted: string[] = [];
  const failed = new Set(opts?.failPassports ?? []);
  const scopes: BulkImportJobScope[] = [];

  const store: BulkImportStore = {
    async loadExistingPassportHashes(_tenantId, companyId) {
      preloadCalls += 1;
      return new Set(
        (opts?.existingPassports ?? []).map(
          (passport) => hashPassportForLookup(companyId, passport) ?? '',
        ),
      );
    },
    async insertEmployee(_tenantId, _companyId, row) {
      if (row.passport_no && failed.has(row.passport_no)) throw new Error('private insert detail');
      if (row.passport_no) inserted.push(row.passport_no);
    },
    async updateProgress(jobScope, nextProcessed) {
      scopes.push(jobScope);
      processed = nextProcessed;
    },
    async isCancelled(jobScope) {
      scopes.push(jobScope);
      return opts?.cancelAfter !== undefined && processed >= opts.cancelAfter;
    },
  };
  return { store, inserted, scopes, preloadCalls: () => preloadCalls };
}

test('employee import preloads once and skips existing plus normalized in-file passport duplicates', async () => {
  const fake = createStore({ existingPassports: ['P-1'] });
  const result = await executeBulkImportRows({
    scope,
    kind: 'employees',
    rows: [employee('p-1', 2), employee('P-2', 3), employee(' p-2 ', 4)],
    store: fake.store,
  });

  assert.equal(fake.preloadCalls(), 1);
  assert.deepEqual(fake.inserted, ['P-2']);
  assert.equal(result.insertedRows, 1);
  assert.equal(result.skippedRows, 2);
  assert.deepEqual(
    result.errors.map((error) => [error.row_number, error.code]),
    [
      [2, 'DUPLICATE_SKIPPED'],
      [4, 'DUPLICATE_SKIPPED'],
    ],
  );
});

test('employee insert failures persist only stable safe codes and log a named diagnostic', async () => {
  const fake = createStore({ failPassports: ['P-1'] });
  const diagnostics: string[] = [];
  const result = await executeBulkImportRows({
    scope,
    kind: 'employees',
    rows: [employee('P-1', 3)],
    store: fake.store,
    log: (event) => diagnostics.push(event),
  });

  assert.deepEqual(result.errors, [
    {
      row_number: 3,
      field: 'row',
      message: 'employeeInsertFailed',
      code: 'INSERT_FAILED',
    },
  ]);
  assert.deepEqual(diagnostics, ['bulk-import.employee-insert failed']);
  assert.doesNotMatch(JSON.stringify(result), /private insert detail/);
});

test('an invalid earlier CSV row does not shift a later insertion error row number', async () => {
  const validation = validateBulkImportRows('employees', [
    { name: '', email: 'invalid', phone: '' },
    employee('P-3', 3).value,
  ]);
  const fake = createStore({ failPassports: ['P-3'] });

  assert.equal(validation.errors.length, 2);
  assert.deepEqual(
    validation.errors.map((error) => error.row_number),
    [2, 2],
  );
  const result = await executeBulkImportRows({
    scope,
    kind: 'employees',
    rows: validation.validRows,
    store: fake.store,
    log: () => {},
  });

  assert.equal(result.errors[0]?.row_number, 3);
});

test('progress and cancellation calls carry the complete company job scope', async () => {
  const fake = createStore({ cancelAfter: 2 });
  const result = await executeBulkImportRows({
    scope,
    kind: 'employees',
    rows: [employee('P-1', 2), employee('P-2', 3), employee('P-3', 4)],
    store: fake.store,
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.processedRows, 2);
  assert.ok(fake.scopes.length >= 3);
  assert.ok(fake.scopes.every((value) => value === scope));
});

test('passport hash preload paginates non-null hashes and fails closed on invalid stored shape', async () => {
  const calls: Array<[string, string, number, number]> = [];
  const diagnostics: string[] = [];
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    id: `id-${String(index).padStart(4, '0')}`,
    passport_no_hash: index.toString(16).padStart(64, '0'),
  }));
  const secondPage = [
    { id: 'id-1000', passport_no_hash: 'a'.repeat(64) },
    { id: 'id-1001', passport_no_hash: 'invalid-private-value' },
  ];
  const store = createSupabaseBulkImportStore({
    passportHashPageLoader: async (tenantId, companyId, from, to) => {
      calls.push([tenantId, companyId, from, to]);
      return from === 0 ? firstPage : secondPage;
    },
    log: (event) => diagnostics.push(event),
  });

  await assert.rejects(
    store.loadExistingPassportHashes('tenant-1', 'company-1'),
    /EMPLOYEE_PASSPORT_PRELOAD_FAILED/,
  );
  assert.deepEqual(calls, [
    ['tenant-1', 'company-1', 0, 999],
    ['tenant-1', 'company-1', 1000, 1999],
  ]);
  assert.deepEqual(diagnostics, ['bulk-import.passport-hash invalid']);
  assert.doesNotMatch(JSON.stringify(diagnostics), /invalid-private-value/);
});

test('safe conflict mapping converts a concurrent 23505 into a duplicate skip', async () => {
  const persisted = new Set<string>();
  const store = createSupabaseBulkImportStore({
    passportHashPageLoader: async () => [],
    employeeWriter: async (_tenantId, _companyId, _row, passportHash) => {
      assert.match(passportHash ?? '', /^[a-f0-9]{64}$/u);
      if (persisted.has(passportHash ?? '')) return { code: '23505' };
      persisted.add(passportHash ?? '');
      return null;
    },
  });
  store.isCancelled = async () => false;
  store.updateProgress = async () => {};

  const [first, second] = await Promise.all([
    executeBulkImportRows({ scope, kind: 'employees', rows: [employee('race-1')], store }),
    executeBulkImportRows({ scope, kind: 'employees', rows: [employee(' RACE-1 ')], store }),
  ]);

  assert.equal(first.insertedRows + second.insertedRows, 1);
  assert.equal(first.skippedRows + second.skippedRows, 1);
  assert.deepEqual(
    [...first.errors, ...second.errors].map((error) => error.code),
    ['DUPLICATE_SKIPPED'],
  );
  const storedHash = [...persisted][0];
  assert.ok(storedHash);
  assert.doesNotMatch(JSON.stringify([first, second]), new RegExp(storedHash));
});

test('erased employees with null hashes are absent from the preload set', async () => {
  const store = createSupabaseBulkImportStore({
    passportHashPageLoader: async () => [],
  });

  assert.deepEqual([...(await store.loadExistingPassportHashes('tenant-1', 'company-1'))], []);
});
