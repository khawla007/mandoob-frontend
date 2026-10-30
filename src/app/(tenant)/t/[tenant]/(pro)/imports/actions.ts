'use server';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  decryptImportArtifact,
  encryptImportArtifact,
  loadImportArtifactKey,
  sha256Hex,
} from '@/lib/employees/import-artifact';
import {
  cancelImport,
  importArtifactPath,
  recordImportArtifactAccess,
  recordImportValidation,
  registerImport,
  requestImportExecution,
} from '@/lib/employees/import-commands';
import { IMPORT_LIMITS, validateEmployeeImportBytes } from '@/lib/employees/import-csv';
import {
  assignedProActor,
  p308Client,
  p308Failure,
  type P308ActionResult,
} from '@/lib/p308/server';
import type { P308Actor } from '@/lib/p308/rpc';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ActionResult<T = void> = P308ActionResult<T>;

const IMPORT_LIMIT = { capacity: 5, refillPerSec: 5 / 3600 };
const BUCKET = 'tenant-imports';
const MAX_CSV_BYTES = IMPORT_LIMITS.maxBytes;
const ACCEPTED_CSV_TYPES = new Set(['', 'text/csv', 'application/csv']);
const jobCommandSchema = z
  .object({ operation_id: z.string().uuid(), expected_version: z.number().int().min(1) })
  .strict();

async function requireTenantContext(tenantSlug: string): Promise<P308Actor> {
  const context = await requireProTenantRouteAccess(tenantSlug);
  await requireActiveTenant(context.tenant.id);
  return assignedProActor(context, tenantSlug);
}

function validationFailure(code: string): ActionResult<never> {
  return { ok: false, code, error: 'The CSV file could not be accepted.' };
}

/**
 * Bytes, encoding, headers and row bounds are validated before any artifact
 * or job exists. The artifact is encrypted, then registered; a failed
 * registration removes the orphan object.
 */
export async function uploadBulkImportAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireTenantContext(tenantSlug);
    const ok = await consumeRateLimit({ key: `bulk_import:${actor.tenantId}`, ...IMPORT_LIMIT });
    if (!ok)
      return { ok: false, error: 'Import limit reached. Try again later.', code: 'RATE_LIMITED' };

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return validationFailure('VALIDATION_FAILED');
    if (
      !file.name.toLowerCase().endsWith('.csv') ||
      !ACCEPTED_CSV_TYPES.has(file.type.toLowerCase())
    ) {
      return validationFailure('VALIDATION_FAILED');
    }
    if (file.size > MAX_CSV_BYTES) return validationFailure('FILE_TOO_LARGE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const structure = validateEmployeeImportBytes(bytes);
    if (!structure.ok) return validationFailure(structure.code);

    const rawOperation = formData.get('operation_id');
    const operationId =
      typeof rawOperation === 'string' && z.string().uuid().safeParse(rawOperation).success
        ? rawOperation
        : randomUUID();
    const jobId = randomUUID();
    const storagePath = importArtifactPath(actor, jobId);
    const admin = createSupabaseServiceRoleClient();
    const sealed = encryptImportArtifact(bytes, loadImportArtifactKey());
    const uploaded = await admin.storage.from(BUCKET).upload(storagePath, sealed, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    if (uploaded.error) return p308Failure('bulk-import.upload', uploaded.error);
    try {
      const receipt = await registerImport(p308Client(), actor, {
        operationId,
        jobId,
        sha256: sha256Hex(bytes),
        bytes: bytes.byteLength,
      });
      if (receipt.job_id !== jobId) {
        await admin.storage.from(BUCKET).remove([storagePath]);
      }
      return { ok: true, data: { id: receipt.job_id } };
    } catch (error) {
      const removed = await admin.storage.from(BUCKET).remove([storagePath]);
      if (removed.error) console.error('bulk-import.orphan-cleanup failed');
      return p308Failure('bulk-import.register', error);
    }
  } catch (error) {
    return p308Failure('bulk-import.upload', error);
  }
}

/** Re-reads the audited artifact and records row-level validation against current data. */
export async function validateBulkImportAction(
  tenantSlug: string,
  jobId: string,
  raw: unknown,
): Promise<ActionResult<{ totalRows: number; errorRows: number }>> {
  const parsed = jobCommandSchema.safeParse(raw);
  if (!parsed.success || !z.string().uuid().safeParse(jobId).success) {
    return validationFailure('VALIDATION_FAILED');
  }
  try {
    const actor = await requireTenantContext(tenantSlug);
    const admin = createSupabaseServiceRoleClient();
    const { data: job, error } = await admin
      .from('bulk_import_jobs')
      .select('id, storage_path, artifact_sha256')
      .eq('tenant_id', actor.tenantId)
      .eq('company_id', actor.companyId)
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw error;
    if (!job?.artifact_sha256)
      return { ok: false, code: 'IMPORT_NOT_FOUND', error: 'Import job not found' };
    await recordImportArtifactAccess(p308Client(), {
      jobId,
      actorId: actor.actorId,
      workerId: null,
      purpose: 'validate',
      sha256: job.artifact_sha256,
    });
    const download = await admin.storage.from(BUCKET).download(job.storage_path);
    if (download.error || !download.data)
      throw download.error ?? new Error('IMPORT_ARTIFACT_MISSING');
    const plain = decryptImportArtifact(
      new Uint8Array(await download.data.arrayBuffer()),
      loadImportArtifactKey(),
    );
    if (sha256Hex(plain) !== job.artifact_sha256) throw new Error('IMPORT_ARTIFACT_MISMATCH');
    const existing = await loadExistingPassportHashes(actor);
    const { hashPassportForLookup } = await import('@/lib/crypto/passport-lookup');
    const result = validateEmployeeImportBytes(plain, {
      isExistingPassport: (passport) =>
        existing.has(hashPassportForLookup(actor.companyId, passport) ?? ''),
    });
    if (!result.ok) return validationFailure(result.code);
    const duplicates = result.rows
      .filter((row) => row.outcome === 'duplicate_existing')
      .map((row) => ({
        row_number: row.rowNumber,
        field: 'passport_no',
        code: 'DUPLICATE_EXISTING',
      }));
    const errors = [...result.errors, ...duplicates].sort((a, b) => a.row_number - b.row_number);
    const receipt = await recordImportValidation(p308Client(), actor, {
      operationId: parsed.data.operation_id,
      jobId,
      expectedVersion: parsed.data.expected_version,
      totalRows: result.totalRows,
      errorRows: new Set(errors.map((item) => item.row_number)).size,
      errors,
    });
    revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
    return { ok: true, data: { totalRows: receipt.total_rows, errorRows: receipt.error_rows } };
  } catch (error) {
    return p308Failure('bulk-import.validate', error);
  }
}

/** Publishes the durable execution request; the leased P3.08 consumer applies rows. */
export async function executeBulkImportAction(
  tenantSlug: string,
  jobId: string,
  raw: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = jobCommandSchema.safeParse(raw);
  if (!parsed.success) return validationFailure('VALIDATION_FAILED');
  try {
    const actor = await requireTenantContext(tenantSlug);
    const receipt = await requestImportExecution(p308Client(), actor, {
      operationId: parsed.data.operation_id,
      jobId,
      expectedVersion: parsed.data.expected_version,
    });
    revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
    return { ok: true, data: { status: receipt.status ?? 'importing' } };
  } catch (error) {
    return p308Failure('bulk-import.execute', error);
  }
}

/** Cancels before execution, or fences a running import at its next batch boundary. */
export async function cancelBulkImportAction(
  tenantSlug: string,
  jobId: string,
  raw: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = jobCommandSchema.safeParse(raw);
  if (!parsed.success) return validationFailure('VALIDATION_FAILED');
  try {
    const actor = await requireTenantContext(tenantSlug);
    const receipt = await cancelImport(p308Client(), actor, {
      operationId: parsed.data.operation_id,
      jobId,
      expectedVersion: parsed.data.expected_version,
    });
    revalidatePath(`/t/${tenantSlug}/imports/${jobId}`);
    return { ok: true, data: { status: receipt.status ?? 'cancelled' } };
  } catch (error) {
    return p308Failure('bulk-import.cancel', error);
  }
}

async function loadExistingPassportHashes(actor: P308Actor): Promise<Set<string>> {
  const admin = createSupabaseServiceRoleClient();
  const hashes = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('employees')
      .select('id, passport_no_hash')
      .eq('tenant_id', actor.tenantId)
      .eq('company_id', actor.companyId)
      .not('passport_no_hash', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) if (row.passport_no_hash) hashes.add(row.passport_no_hash);
    if ((data ?? []).length < pageSize) break;
  }
  return hashes;
}
