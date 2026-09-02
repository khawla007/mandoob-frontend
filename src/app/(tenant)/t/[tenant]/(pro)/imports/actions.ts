'use server';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { runAuthorizedMutation } from '@/lib/auth/authorized-mutation';
import { resolveImportCompany } from '@/lib/data/import-company-access';
import { finalizeBulkImportSuccess } from '@/lib/data/import-audit';
import {
  createSupabaseBulkImportStore,
  executeBulkImportRows,
  type BulkImportJobStatus,
} from '@/lib/data/bulk-import';
import {
  assertImportJobTransitionMatched,
  scopeImportJobMutation,
  shouldCompensateImportFailure,
} from '@/lib/data/import-job-scope';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  parseCsvRows,
  countDistinctImportErrorRows,
  validateBulkImportRows,
  type BulkImportKind,
  type BulkImportValidationError,
} from '@/lib/validation/bulk-import';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const IMPORT_LIMIT = { capacity: 5, refillPerSec: 5 / 3600 };
const BUCKET = 'tenant-imports';
const MAX_CSV_BYTES = 1_000_000;
const ACCEPTED_CSV_TYPES = new Set(['', 'text/csv', 'application/csv']);

async function requireTenantContext(tenantSlug: string) {
  const context = await requireProTenantRouteAccess(tenantSlug);
  await requireActiveTenant(context.tenant.id);
  return context;
}

export async function uploadBulkImportAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const { session, tenant } = await requireTenantContext(tenantSlug);
  try {
    const ok = await consumeRateLimit({ key: `bulk_import:${tenant.id}`, ...IMPORT_LIMIT });
    if (!ok)
      return { ok: false, error: 'Import limit reached. Try again later.', code: 'RATE_LIMITED' };

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a CSV file to import', code: 'VALIDATION_FAILED' };
    }
    if (
      !file.name.toLowerCase().endsWith('.csv') ||
      !ACCEPTED_CSV_TYPES.has(file.type.toLowerCase())
    ) {
      return { ok: false, error: 'CSV files only for this import', code: 'VALIDATION_FAILED' };
    }
    if (file.size > MAX_CSV_BYTES) {
      return { ok: false, error: 'CSV file is too large', code: 'VALIDATION_FAILED' };
    }

    const company = await resolveImportCompany(session.id, tenant.id, tenantSlug);
    if (!company) {
      return { ok: false, error: 'Assigned company not found', code: 'NOT_FOUND' };
    }

    const jobId = randomUUID();
    const storagePath = `${tenant.id}/${jobId}.csv`;
    const admin = createSupabaseServiceRoleClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'text/csv',
      upsert: false,
    });
    if (upload.error) {
      console.error('bulk-import.upload failed');
      return { ok: false, error: 'Could not upload CSV', code: 'INTERNAL' };
    }

    const { error } = await admin.from('bulk_import_jobs').insert({
      id: jobId,
      tenant_id: tenant.id,
      created_by: session.id,
      kind: 'employees',
      company_id: company.id,
      storage_path: storagePath,
      status: 'uploaded',
    });
    if (error) {
      console.error('bulk-import.job-insert failed');
      return { ok: false, error: 'Could not create import job', code: 'INTERNAL' };
    }
    return { ok: true, data: { id: jobId } };
  } catch (error) {
    if (error instanceof Error && ['TENANT_NOT_FOUND', 'FORBIDDEN'].includes(error.message)) {
      return { ok: false, error: 'Tenant access denied', code: error.message };
    }
    console.error('bulk-import.upload unexpected');
    return { ok: false, error: 'Could not start import', code: 'INTERNAL' };
  }
}

export async function validateBulkImportAction(
  tenantSlug: string,
  jobId: string,
): Promise<ActionResult<{ totalRows: number; errorRows: number }>> {
  const context = await requireTenantContext(tenantSlug);
  return runAuthorizedMutation({
    authorize: async () => context,
    run: async ({ tenant }) => {
      const admin = createSupabaseServiceRoleClient();
      const company = await resolveImportCompany(context.session.id, tenant.id, tenantSlug);
      if (!company) {
        return { ok: false, error: 'Assigned company not found', code: 'NOT_FOUND' };
      }
      const job = await readJob(admin, tenant.id, company.id, jobId, ['uploaded']);
      if (!job) return { ok: false, error: 'Import job not found', code: 'NOT_FOUND' };

      await updateJob(
        admin,
        tenant.id,
        company.id,
        jobId,
        {
          status: 'validating',
          started_at: new Date().toISOString(),
        },
        'uploaded',
      );
      const csv = await downloadCsv(admin, job.storage_path);
      const rows = parseCsvRows(csv);
      const result = validateBulkImportRows('employees', rows);
      const invalidRows = countDistinctImportErrorRows(result.errors);

      await updateJob(
        admin,
        tenant.id,
        company.id,
        jobId,
        {
          status: 'validated',
          total_rows: result.totalRows,
          processed_rows: 0,
          error_rows: invalidRows,
          errors: result.errors,
        },
        'validating',
      );
      revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
      return { ok: true, data: { totalRows: result.totalRows, errorRows: invalidRows } };
    },
    compensate: async ({ tenant }, error) => {
      if (shouldCompensateImportFailure(error)) {
        const company = await resolveImportCompany(context.session.id, tenant.id, tenantSlug);
        if (company) {
          await markFailed(tenant.id, company.id, jobId, 'validating');
        }
      }
    },
    recover: (): ActionResult<{ totalRows: number; errorRows: number }> => {
      console.error('bulk-import.validate unexpected');
      return { ok: false, error: 'Could not validate import', code: 'INTERNAL' };
    },
  });
}

export async function executeBulkImportAction(
  tenantSlug: string,
  jobId: string,
  raw?: { skipExisting?: boolean },
): Promise<ActionResult<{ processedRows: number; errorRows: number }>> {
  const context = await requireTenantContext(tenantSlug);
  return runAuthorizedMutation({
    authorize: async () => context,
    run: async ({ session, tenant }) => {
      const admin = createSupabaseServiceRoleClient();
      const company = await resolveImportCompany(context.session.id, tenant.id, tenantSlug);
      if (!company) {
        return { ok: false, error: 'Assigned company not found', code: 'NOT_FOUND' };
      }
      const job = await readJob(admin, tenant.id, company.id, jobId, ['validated']);
      if (!job) return { ok: false, error: 'Import job not found', code: 'NOT_FOUND' };

      await updateJob(
        admin,
        tenant.id,
        company.id,
        jobId,
        { status: 'importing', processed_rows: 0 },
        'validated',
      );
      const csv = await downloadCsv(admin, job.storage_path);
      const rows = parseCsvRows(csv);
      const validation = validateBulkImportRows('employees', rows);

      const store = createSupabaseBulkImportStore();
      const result = await executeBulkImportRows({
        scope: {
          jobId,
          tenantId: tenant.id,
          companyId: company.id,
          expectedStatus: 'importing',
        },
        kind: 'employees',
        rows: validation.validRows,
        skipExisting: raw?.skipExisting ?? true,
        store,
      });

      const allErrors = [...validation.errors, ...result.errors];
      const errorRows = countDistinctImportErrorRows(allErrors);
      await updateJob(
        admin,
        tenant.id,
        company.id,
        jobId,
        {
          status: result.status,
          processed_rows: result.processedRows,
          error_rows: errorRows,
          errors: allErrors,
          completed_at: new Date().toISOString(),
        },
        'importing',
      );
      const success = await finalizeBulkImportSuccess(
        { ok: true as const, data: { processedRows: result.processedRows, errorRows } },
        {
          tenantId: tenant.id,
          actorId: session.id,
          companyId: company.id,
          details: {
            kind: job.kind,
            total: validation.totalRows,
            succeeded: result.insertedRows,
            skipped: result.skippedRows,
            failed: countDistinctImportErrorRows(
              allErrors.filter((rowError) => rowError.code !== 'DUPLICATE_SKIPPED'),
            ),
          },
          write: async (record) => {
            const { error } = await admin.from('tenant_audit_log').insert(record);
            if (error) throw error;
          },
        },
      );

      revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
      revalidatePath(`/t/${tenantSlug}/employees`);
      return success;
    },
    compensate: async ({ tenant }, error) => {
      if (shouldCompensateImportFailure(error)) {
        const company = await resolveImportCompany(context.session.id, tenant.id, tenantSlug);
        if (company) {
          await markFailed(tenant.id, company.id, jobId, 'importing');
        }
      }
    },
    recover: (): ActionResult<{ processedRows: number; errorRows: number }> => {
      console.error('bulk-import.execute unexpected');
      return { ok: false, error: 'Could not execute import', code: 'INTERNAL' };
    },
  });
}

export async function cancelBulkImportAction(
  tenantSlug: string,
  jobId: string,
): Promise<ActionResult<{ status: BulkImportJobStatus }>> {
  const { session, tenant } = await requireTenantContext(tenantSlug);
  try {
    const admin = createSupabaseServiceRoleClient();
    const company = await resolveImportCompany(session.id, tenant.id, tenantSlug);
    if (!company) {
      return { ok: false, error: 'Assigned company not found', code: 'NOT_FOUND' };
    }
    const job = await readJob(admin, tenant.id, company.id, jobId, [
      'uploaded',
      'validating',
      'validated',
    ]);
    if (!job) return { ok: false, error: 'Import job not found', code: 'NOT_FOUND' };
    await updateJob(
      admin,
      tenant.id,
      company.id,
      jobId,
      {
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      },
      job.status,
    );
    revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
    return { ok: true, data: { status: 'cancelled' } };
  } catch {
    console.error('bulk-import.cancel unexpected');
    return { ok: false, error: 'Could not cancel import', code: 'INTERNAL' };
  }
}

async function readJob(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  tenantId: string,
  companyId: string,
  jobId: string,
  expectedStatuses: BulkImportJobStatus[],
) {
  const { data, error } = await admin
    .from('bulk_import_jobs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('id', jobId)
    .in('status', expectedStatuses)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    kind: BulkImportKind;
    status: BulkImportJobStatus;
    company_id: string;
    storage_path: string;
    errors: BulkImportValidationError[] | null;
  } | null;
}

async function updateJob(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  tenantId: string,
  companyId: string,
  jobId: string,
  patch: Record<string, unknown>,
  expectedStatus: BulkImportJobStatus,
) {
  const query = admin
    .from('bulk_import_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() });
  const { data, error } = await scopeImportJobMutation(
    query,
    tenantId,
    companyId,
    jobId,
    expectedStatus,
  )
    .select('id')
    .maybeSingle();
  if (error) throw error;
  assertImportJobTransitionMatched(data);
}

async function downloadCsv(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  path: string,
) {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error('CSV missing');
  return await data.text();
}

async function markFailed(
  tenantId: string,
  companyId: string,
  jobId: string,
  expectedStatus: 'validating' | 'importing',
) {
  try {
    const admin = createSupabaseServiceRoleClient();
    await updateJob(
      admin,
      tenantId,
      companyId,
      jobId,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [
          {
            row_number: 0,
            field: 'job',
            message: 'importFailed',
            code: 'INSERT_FAILED',
          },
        ],
      },
      expectedStatus,
    );
  } catch {
    console.error('bulk-import.mark-failed failed');
  }
}
