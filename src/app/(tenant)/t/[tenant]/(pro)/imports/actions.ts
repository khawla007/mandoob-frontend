'use server';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { runAuthorizedMutation } from '@/lib/auth/authorized-mutation';
import {
  createSupabaseBulkImportStore,
  executeBulkImportRows,
  type BulkImportJobStatus,
} from '@/lib/data/bulk-import';
import { getClientForTenant } from '@/lib/data/client-detail';
import {
  assertImportJobTransitionMatched,
  isImportJobCancellable,
  scopeImportJobMutation,
  shouldCompensateImportFailure,
} from '@/lib/data/import-job-scope';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  parseCsvRows,
  validateBulkImportRows,
  type BulkImportKind,
  type BulkImportValidationError,
} from '@/lib/validation/bulk-import';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const IMPORT_LIMIT = { capacity: 5, refillPerSec: 5 / 3600 };
const BUCKET = 'tenant-imports';

async function requireTenantContext(tenantSlug: string) {
  return await requireProTenantRouteAccess(tenantSlug);
}

export async function uploadBulkImportAction(
  tenantSlug: string,
  kind: BulkImportKind,
  formData: FormData,
): Promise<ActionResult<{ id: string }> | never> {
  const { session, tenant } = await requireTenantContext(tenantSlug);
  let redirectTo: string | null = null;
  try {
    const ok = await consumeRateLimit({ key: `bulk_import:${tenant.id}`, ...IMPORT_LIMIT });
    if (!ok)
      return { ok: false, error: 'Import limit reached. Try again later.', code: 'RATE_LIMITED' };

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a CSV file to import', code: 'VALIDATION_FAILED' };
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return { ok: false, error: 'CSV files only for this import', code: 'VALIDATION_FAILED' };
    }

    const parentClientId = formData.get('parent_client_id')?.toString() || null;
    if (kind === 'employees') {
      if (!parentClientId) {
        return { ok: false, error: 'Choose a parent client', code: 'VALIDATION_FAILED' };
      }
      const client = await getClientForTenant(tenant.id, parentClientId);
      if (!client) return { ok: false, error: 'Client not found', code: 'NOT_FOUND' };
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
      console.error('bulk import upload failed', upload.error);
      return { ok: false, error: 'Could not upload CSV', code: 'INTERNAL' };
    }

    const { error } = await admin.from('bulk_import_jobs').insert({
      id: jobId,
      tenant_id: tenant.id,
      created_by: session.id,
      kind,
      parent_client_id: kind === 'employees' ? parentClientId : null,
      storage_path: storagePath,
      status: 'uploaded',
    });
    if (error) {
      console.error('bulk import job insert failed', error);
      return { ok: false, error: 'Could not create import job', code: 'INTERNAL' };
    }

    redirectTo = `/t/${tenantSlug}/imports/${jobId}`;
  } catch (error) {
    if (error instanceof Error && ['TENANT_NOT_FOUND', 'FORBIDDEN'].includes(error.message)) {
      return { ok: false, error: 'Tenant access denied', code: error.message };
    }
    console.error('uploadBulkImportAction unexpected error', error);
    return { ok: false, error: 'Could not start import', code: 'INTERNAL' };
  }
  redirect(redirectTo);
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
      const job = await readJob(admin, tenant.id, jobId);
      if (!job) return { ok: false, error: 'Import job not found', code: 'NOT_FOUND' };
      if (job.status !== 'uploaded') {
        return {
          ok: false,
          error: 'Import cannot be validated in its current state',
          code: 'INVALID_STATUS',
        };
      }

      await updateJob(
        admin,
        tenant.id,
        jobId,
        {
          status: 'validating',
          started_at: new Date().toISOString(),
        },
        'uploaded',
      );
      const csv = await downloadCsv(admin, job.storage_path);
      const rows = parseCsvRows(csv);
      const result =
        job.kind === 'clients'
          ? validateBulkImportRows('clients', rows)
          : validateBulkImportRows('employees', rows);

      await updateJob(
        admin,
        tenant.id,
        jobId,
        {
          status: 'validated',
          total_rows: result.totalRows,
          processed_rows: 0,
          error_rows: result.errors.length,
          errors: result.errors,
        },
        'validating',
      );

      revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
      return { ok: true, data: { totalRows: result.totalRows, errorRows: result.errors.length } };
    },
    compensate: async ({ tenant }, error) => {
      if (shouldCompensateImportFailure(error)) {
        await markFailed(tenant.id, jobId, 'validating');
      }
    },
    recover: (error) => {
      console.error('validateBulkImportAction unexpected error', error);
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
      const job = await readJob(admin, tenant.id, jobId);
      if (!job) return { ok: false, error: 'Import job not found', code: 'NOT_FOUND' };
      if (job.status !== 'validated') {
        return { ok: false, error: 'Validate the CSV before importing', code: 'INVALID_STATUS' };
      }

      await updateJob(
        admin,
        tenant.id,
        jobId,
        { status: 'importing', processed_rows: 0 },
        'validated',
      );
      const csv = await downloadCsv(admin, job.storage_path);
      const rows = parseCsvRows(csv);
      const validation =
        job.kind === 'clients'
          ? validateBulkImportRows('clients', rows)
          : validateBulkImportRows('employees', rows);

      const store = createSupabaseBulkImportStore();
      const result =
        validation.kind === 'clients'
          ? await executeBulkImportRows({
              jobId,
              kind: 'clients',
              tenantId: tenant.id,
              rows: validation.validRows,
              skipExisting: raw?.skipExisting ?? true,
              store,
            })
          : await executeBulkImportRows({
              jobId,
              kind: 'employees',
              tenantId: tenant.id,
              parentClientId: job.parent_client_id!,
              rows: validation.validRows,
              skipExisting: raw?.skipExisting ?? true,
              store,
            });

      const allErrors: BulkImportValidationError[] = [...validation.errors, ...result.errors];
      await updateJob(
        admin,
        tenant.id,
        jobId,
        {
          status: result.status,
          processed_rows: result.processedRows,
          error_rows: allErrors.length,
          errors: allErrors,
          completed_at: new Date().toISOString(),
        },
        'importing',
      );
      await admin.from('tenant_audit_log').insert({
        tenant_id: tenant.id,
        actor_id: session.id,
        action: 'bulk_imported',
        source: 'self_serve',
        details: {
          kind: job.kind,
          total: validation.totalRows,
          succeeded: result.insertedRows,
          skipped: result.skippedRows,
          failed: allErrors.length - result.skippedRows,
        },
      });

      revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
      revalidatePath(`/t/${tenantSlug}/clients`);
      return {
        ok: true,
        data: { processedRows: result.processedRows, errorRows: allErrors.length },
      };
    },
    compensate: async ({ tenant }, error) => {
      if (shouldCompensateImportFailure(error)) {
        await markFailed(tenant.id, jobId, 'importing');
      }
    },
    recover: (error) => {
      console.error('executeBulkImportAction unexpected error', error);
      return { ok: false, error: 'Could not execute import', code: 'INTERNAL' };
    },
  });
}

export async function cancelBulkImportAction(
  tenantSlug: string,
  jobId: string,
): Promise<ActionResult<{ status: BulkImportJobStatus }>> {
  const { tenant } = await requireTenantContext(tenantSlug);
  try {
    const admin = createSupabaseServiceRoleClient();
    const job = await readJob(admin, tenant.id, jobId);
    if (!job) return { ok: false, error: 'Import job not found', code: 'NOT_FOUND' };
    if (!isImportJobCancellable(job.status)) {
      return { ok: false, error: 'Import can no longer be cancelled', code: 'INVALID_STATUS' };
    }
    await updateJob(
      admin,
      tenant.id,
      jobId,
      {
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      },
      job.status,
    );
    revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
    return { ok: true, data: { status: 'cancelled' } };
  } catch (error) {
    console.error('cancelBulkImportAction unexpected error', error);
    return { ok: false, error: 'Could not cancel import', code: 'INTERNAL' };
  }
}

async function readJob(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  tenantId: string,
  jobId: string,
) {
  const { data, error } = await admin
    .from('bulk_import_jobs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    kind: BulkImportKind;
    status: BulkImportJobStatus;
    parent_client_id: string | null;
    storage_path: string;
    errors: BulkImportValidationError[] | null;
  } | null;
}

async function updateJob(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  tenantId: string,
  jobId: string,
  patch: Record<string, unknown>,
  expectedStatus: BulkImportJobStatus,
) {
  const query = admin
    .from('bulk_import_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() });
  const { data, error } = await scopeImportJobMutation(query, tenantId, jobId, expectedStatus)
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
  jobId: string,
  expectedStatus: 'validating' | 'importing',
) {
  try {
    const admin = createSupabaseServiceRoleClient();
    await updateJob(
      admin,
      tenantId,
      jobId,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [
          {
            row_number: 0,
            field: 'job',
            message: 'Import failed',
          },
        ],
      },
      expectedStatus,
    );
  } catch (markError) {
    console.error('bulk import mark failed failed', markError);
  }
}
