import 'server-only';
import type { ClientCsvRow, EmployeeCsvRow } from '@/lib/validation/bulk-import';

export type BulkImportJobStatus =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BulkImportClientRow = ClientCsvRow;
export type BulkImportEmployeeRow = EmployeeCsvRow;

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

export type BulkImportStore = {
  clientExistsByTradeLicense(tenantId: string, tradeLicenseNo: string): Promise<boolean>;
  employeeExistsByPassport(clientId: string, passportNo: string): Promise<boolean>;
  insertClient(tenantId: string, row: BulkImportClientRow): Promise<void>;
  insertEmployee(tenantId: string, clientId: string, row: BulkImportEmployeeRow): Promise<void>;
  updateProgress(jobId: string, processedRows: number): Promise<void>;
  isCancelled(jobId: string): Promise<boolean>;
};

type ExecuteArgs =
  | {
      jobId: string;
      kind: 'clients';
      tenantId: string;
      rows: BulkImportClientRow[];
      skipExisting?: boolean;
      store: BulkImportStore;
    }
  | {
      jobId: string;
      kind: 'employees';
      tenantId: string;
      parentClientId: string;
      rows: BulkImportEmployeeRow[];
      skipExisting?: boolean;
      store: BulkImportStore;
    };

export async function executeBulkImportRows(args: ExecuteArgs): Promise<BulkImportExecutionResult> {
  const skipExisting = args.skipExisting ?? true;
  const errors: BulkImportExecutionError[] = [];
  let processedRows = 0;
  let insertedRows = 0;
  let skippedRows = 0;

  for (const row of args.rows) {
    if (await args.store.isCancelled(args.jobId)) {
      return {
        status: 'cancelled',
        processedRows,
        insertedRows,
        skippedRows,
        errorRows: errors.length,
        errors,
      };
    }

    const rowNumber = processedRows + 2;
    try {
      if (args.kind === 'clients') {
        const clientRow = row as BulkImportClientRow;
        const tradeLicenseNo = normalizeOptional(clientRow.trade_license_no);
        if (
          skipExisting &&
          tradeLicenseNo &&
          (await args.store.clientExistsByTradeLicense(args.tenantId, tradeLicenseNo))
        ) {
          skippedRows += 1;
          errors.push({
            row_number: rowNumber,
            field: 'trade_license_no',
            message: 'Existing client skipped',
            code: 'DUPLICATE_SKIPPED',
          });
        } else {
          await args.store.insertClient(args.tenantId, clientRow);
          insertedRows += 1;
        }
      } else {
        const employeeRow = row as BulkImportEmployeeRow;
        const passportNo = normalizeOptional(employeeRow.passport_no);
        if (
          skipExisting &&
          passportNo &&
          (await args.store.employeeExistsByPassport(args.parentClientId, passportNo))
        ) {
          skippedRows += 1;
          errors.push({
            row_number: rowNumber,
            field: 'passport_no',
            message: 'Existing employee skipped',
            code: 'DUPLICATE_SKIPPED',
          });
        } else {
          await args.store.insertEmployee(args.tenantId, args.parentClientId, employeeRow);
          insertedRows += 1;
        }
      }
    } catch (error) {
      errors.push({
        row_number: rowNumber,
        field: 'row',
        message: error instanceof Error ? error.message : 'Insert failed',
        code: 'INSERT_FAILED',
      });
    }

    processedRows += 1;
    await args.store.updateProgress(args.jobId, processedRows);
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

export function createSupabaseBulkImportStore(): BulkImportStore {
  return {
    async clientExistsByTradeLicense(tenantId, tradeLicenseNo) {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const admin = createSupabaseServiceRoleClient();
      const { data, error } = await admin
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('trade_license_no', tradeLicenseNo)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async employeeExistsByPassport(clientId, passportNo) {
      const [{ createSupabaseServiceRoleClient }, { decryptOptional }] = await Promise.all([
        import('@/lib/supabase/service-role'),
        import('@/lib/crypto/pii'),
      ]);
      const admin = createSupabaseServiceRoleClient();
      const { data, error } = await admin
        .from('employees')
        .select('passport_no_encrypted')
        .eq('client_id', clientId);
      if (error) throw error;
      return (data ?? []).some((row) => {
        try {
          return decryptOptional(row.passport_no_encrypted as string | null) === passportNo;
        } catch {
          return false;
        }
      });
    },

    async insertClient(tenantId, row) {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const admin = createSupabaseServiceRoleClient();
      const { error } = await admin.from('clients').insert({
        tenant_id: tenantId,
        company_name: row.company_name,
        trade_license_no: normalizeOptional(row.trade_license_no),
        jurisdiction: normalizeOptional(row.jurisdiction),
        license_expiry: normalizeOptional(row.license_expiry),
        status: 'onboarding',
      });
      if (error) throw error;
    },

    async insertEmployee(tenantId, clientId, row) {
      const [{ createSupabaseServiceRoleClient }, { encryptOptional }] = await Promise.all([
        import('@/lib/supabase/service-role'),
        import('@/lib/crypto/pii'),
      ]);
      const admin = createSupabaseServiceRoleClient();
      const { error } = await admin.from('employees').insert({
        tenant_id: tenantId,
        client_id: clientId,
        name: row.name,
        email: normalizeOptional(row.email),
        phone: normalizeOptional(row.phone),
        nationality: normalizeOptional(row.nationality),
        passport_no_encrypted: encryptOptional(normalizeOptional(row.passport_no)),
        visa_no_encrypted: encryptOptional(normalizeOptional(row.visa_no)),
        visa_expiry: normalizeOptional(row.visa_expiry),
        emirates_id_encrypted: encryptOptional(normalizeOptional(row.emirates_id)),
        eid_expiry: normalizeOptional(row.eid_expiry),
        status: 'active',
      });
      if (error) throw error;
    },

    async updateProgress(jobId, processedRows) {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const admin = createSupabaseServiceRoleClient();
      const { error } = await admin
        .from('bulk_import_jobs')
        .update({ processed_rows: processedRows, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (error) throw error;
    },

    async isCancelled(jobId) {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const admin = createSupabaseServiceRoleClient();
      const { data, error } = await admin
        .from('bulk_import_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
      if (error) throw error;
      return data?.status === 'cancelled';
    },
  };
}
