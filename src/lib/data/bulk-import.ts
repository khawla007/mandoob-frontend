import 'server-only';
import { hashPassportForLookup, normalizePassportForLookup } from '@/lib/crypto/passport-lookup';
import type { EmployeeCsvRow, ValidatedEmployeeCsvRow } from '@/lib/validation/bulk-import';

export type BulkImportJobStatus =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BulkImportEmployeeRow = ValidatedEmployeeCsvRow;

export class EmployeePassportDuplicateError extends Error {
  constructor() {
    super('EMPLOYEE_PASSPORT_DUPLICATE');
    this.name = 'EmployeePassportDuplicateError';
  }
}

export type BulkImportExecutionError = {
  row_number: number;
  field: string;
  message: string;
  code: 'DUPLICATE_SKIPPED' | 'INSERT_FAILED' | 'CANCELLED' | 'VALIDATION_FAILED';
};

export type BulkImportExecutionResult = {
  status: Extract<BulkImportJobStatus, 'completed' | 'cancelled'>;
  processedRows: number;
  insertedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: BulkImportExecutionError[];
};

export type BulkImportJobScope = {
  jobId: string;
  tenantId: string;
  companyId: string;
  expectedStatus: 'importing';
};

export type BulkImportStore = {
  loadExistingPassportHashes(tenantId: string, companyId: string): Promise<ReadonlySet<string>>;
  insertEmployee(tenantId: string, companyId: string, row: EmployeeCsvRow): Promise<void>;
  updateProgress(scope: BulkImportJobScope, processedRows: number): Promise<void>;
  isCancelled(scope: BulkImportJobScope): Promise<boolean>;
};

type ExecuteArgs = {
  scope: BulkImportJobScope;
  kind: 'employees';
  rows: BulkImportEmployeeRow[];
  skipExisting?: boolean;
  store: BulkImportStore;
  log?: (event: string) => void;
};

export async function executeBulkImportRows(args: ExecuteArgs): Promise<BulkImportExecutionResult> {
  const skipExisting = args.skipExisting ?? true;
  const errors: BulkImportExecutionError[] = [];
  let processedRows = 0;
  let insertedRows = 0;
  let skippedRows = 0;
  const preloaded = skipExisting
    ? await args.store.loadExistingPassportHashes(args.scope.tenantId, args.scope.companyId)
    : new Set<string>();
  const knownPassportHashes = new Set(preloaded);
  const batchPassportHashes = new Set<string>();

  for (const row of args.rows) {
    if (await args.store.isCancelled(args.scope)) {
      return {
        status: 'cancelled',
        processedRows,
        insertedRows,
        skippedRows,
        errorRows: errors.length,
        errors,
      };
    }

    const rowNumber = row.rowNumber;
    try {
      const employeeRow = row.value;
      const passportNo = normalizePassport(employeeRow.passport_no);
      const passportHash = hashPassportForLookup(args.scope.companyId, passportNo);
      if (
        passportHash &&
        (batchPassportHashes.has(passportHash) || knownPassportHashes.has(passportHash))
      ) {
        skippedRows += 1;
        errors.push({
          row_number: rowNumber,
          field: 'passport_no',
          message: 'Existing employee skipped',
          code: 'DUPLICATE_SKIPPED',
        });
      } else {
        await args.store.insertEmployee(args.scope.tenantId, args.scope.companyId, {
          ...employeeRow,
          passport_no: passportNo ?? '',
        });
        if (passportHash) {
          batchPassportHashes.add(passportHash);
          knownPassportHashes.add(passportHash);
        }
        insertedRows += 1;
      }
    } catch (error) {
      if (error instanceof EmployeePassportDuplicateError) {
        skippedRows += 1;
        errors.push({
          row_number: rowNumber,
          field: 'passport_no',
          message: 'Existing employee skipped',
          code: 'DUPLICATE_SKIPPED',
        });
      } else {
        (args.log ?? ((event) => console.error(event)))('bulk-import.employee-insert failed');
        errors.push({
          row_number: rowNumber,
          field: 'row',
          message: 'employeeInsertFailed',
          code: 'INSERT_FAILED',
        });
      }
    }

    processedRows += 1;
    await args.store.updateProgress(args.scope, processedRows);
  }

  return {
    status: 'completed',
    processedRows,
    insertedRows,
    skippedRows,
    errorRows: errors.length,
    errors,
  };
}

export function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizePassport(value: string | null | undefined): string {
  return normalizePassportForLookup(value);
}

type PassportHashPage = { id: string; passport_no_hash: string };
type BulkImportStoreDependencies = {
  passportHashPageLoader?: (
    tenantId: string,
    companyId: string,
    from: number,
    to: number,
  ) => Promise<PassportHashPage[]>;
  employeeWriter?: (
    tenantId: string,
    companyId: string,
    row: EmployeeCsvRow,
    passportHash: string | null,
  ) => Promise<{ code?: string } | null>;
  log?: (event: string) => void;
};

const PASSPORT_PAGE_SIZE = 1000;

export function createSupabaseBulkImportStore(
  dependencies: BulkImportStoreDependencies = {},
): BulkImportStore {
  return {
    async loadExistingPassportHashes(tenantId, companyId) {
      const hashes = new Set<string>();
      for (let from = 0; ; from += PASSPORT_PAGE_SIZE) {
        const to = from + PASSPORT_PAGE_SIZE - 1;
        const rows = dependencies.passportHashPageLoader
          ? await dependencies.passportHashPageLoader(tenantId, companyId, from, to)
          : await loadPassportHashPage(tenantId, companyId, from, to);
        for (const row of rows) {
          if (!/^[a-f0-9]{64}$/u.test(row.passport_no_hash)) {
            (dependencies.log ?? ((event) => console.error(event)))(
              'bulk-import.passport-hash invalid',
            );
            throw new Error('EMPLOYEE_PASSPORT_PRELOAD_FAILED');
          }
          hashes.add(row.passport_no_hash);
        }
        if (rows.length < PASSPORT_PAGE_SIZE) break;
      }
      return hashes;
    },

    async insertEmployee(tenantId, companyId, row) {
      const passportHash = hashPassportForLookup(companyId, row.passport_no);
      const error = dependencies.employeeWriter
        ? await dependencies.employeeWriter(tenantId, companyId, row, passportHash)
        : await insertEmployeeRow(tenantId, companyId, row, passportHash);
      if (error?.code === '23505') throw new EmployeePassportDuplicateError();
      if (error) throw new Error('EMPLOYEE_INSERT_FAILED');
    },

    async updateProgress(scope, processedRows) {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const admin = createSupabaseServiceRoleClient();
      const { data, error } = await admin
        .from('bulk_import_jobs')
        .update({ processed_rows: processedRows, updated_at: new Date().toISOString() })
        .eq('tenant_id', scope.tenantId)
        .eq('company_id', scope.companyId)
        .eq('id', scope.jobId)
        .eq('status', scope.expectedStatus)
        .select('id')
        .maybeSingle();
      if (error || !data) throw new Error('IMPORT_JOB_SCOPE_MISMATCH');
    },

    async isCancelled(scope) {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const admin = createSupabaseServiceRoleClient();
      const { data, error } = await admin
        .from('bulk_import_jobs')
        .select('status')
        .eq('tenant_id', scope.tenantId)
        .eq('company_id', scope.companyId)
        .eq('id', scope.jobId)
        .in('status', [scope.expectedStatus, 'cancelled'])
        .maybeSingle();
      if (error || !data) throw new Error('IMPORT_JOB_SCOPE_MISMATCH');
      return data.status === 'cancelled';
    },
  };
}

async function insertEmployeeRow(
  tenantId: string,
  companyId: string,
  row: EmployeeCsvRow,
  passportHash: string | null,
): Promise<{ code?: string } | null> {
  const [{ createSupabaseServiceRoleClient }, { encryptOptional }] = await Promise.all([
    import('@/lib/supabase/service-role'),
    import('@/lib/crypto/pii'),
  ]);
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('employees').insert({
    tenant_id: tenantId,
    company_id: companyId,
    name: row.name,
    email: normalizeOptional(row.email),
    phone: normalizeOptional(row.phone),
    nationality: normalizeOptional(row.nationality),
    passport_no_encrypted: encryptOptional(normalizeOptional(row.passport_no)),
    passport_no_hash: passportHash,
    visa_no_encrypted: encryptOptional(normalizeOptional(row.visa_no)),
    visa_expiry: normalizeOptional(row.visa_expiry),
    emirates_id_encrypted: encryptOptional(normalizeOptional(row.emirates_id)),
    eid_expiry: normalizeOptional(row.eid_expiry),
    status: 'active',
  });
  return error;
}

async function loadPassportHashPage(
  tenantId: string,
  companyId: string,
  from: number,
  to: number,
): Promise<PassportHashPage[]> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('employees')
    .select('id, passport_no_hash')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .not('passport_no_hash', 'is', null)
    .order('id', { ascending: true })
    .range(from, to);
  if (error) throw new Error('EMPLOYEE_PASSPORT_PRELOAD_FAILED');
  return (data ?? []) as PassportHashPage[];
}
