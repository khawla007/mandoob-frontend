import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  BodyTooLargeError,
  MULTIPART_BODY_ENVELOPE_BYTES,
  readBoundedFormData,
} from '@/app/api/v1/_shared/bounded-body';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import {
  resolveEmployeeDocumentUploadAuthority,
  submitEmployeeDocumentUpload,
  type EmployeeUploadAuthority,
} from '@/lib/data/employee-document-upload';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/documents/upload-contract';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { customerUploadActionSchema } from '@/lib/validation/document';

type LimitDecision = 'allowed' | 'limited' | 'unavailable';
type RouteContext = { params: Promise<{ tenant: string }> };
type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  authorize(tenantSlug: string): Promise<EmployeeUploadAuthority>;
  limit(actorId: string, companyId: string): Promise<LimitDecision>;
  submit: typeof submitEmployeeDocumentUpload;
  revalidate(tenantSlug: string): void | Promise<void>;
  log(label: string, error: unknown): void;
};

const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  authorize: resolveEmployeeDocumentUploadAuthority,
  limit: async (actorId, companyId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `employee-document-upload:${actorId}:${companyId}`,
      routeLabel: 'employee-document-upload',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialUpload,
    });
  },
  submit: submitEmployeeDocumentUpload,
  revalidate: async (tenantSlug) => {
    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/t/${tenantSlug}/employee/documents`);
    revalidatePath(`/t/${tenantSlug}/employee/dashboard`);
  },
  log: logSafeActionError,
};

const FIELDS = ['doc_type', 'operation_id', 'request_id', 'label', 'file'] as const;
const canonicalUuid = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const publicReceipt = z.object({ documentId: canonicalUuid, versionId: canonicalUuid }).strict();

function safeLog(log: Deps['log'], label: string, error: unknown) {
  try {
    log(label, error);
  } catch {
    // Logging cannot weaken a fail-closed response.
  }
}

function hasExactFields(form: FormData): boolean {
  const names = Array.from(form.keys());
  return (
    names.every((name) => FIELDS.includes(name as (typeof FIELDS)[number])) &&
    ['doc_type', 'operation_id', 'request_id', 'file'].every(
      (name) => form.getAll(name).length === 1,
    ) &&
    form.getAll('label').length <= 1
  );
}

function uploadError(error: unknown, log: Deps['log']): Response {
  if (error instanceof ApiError) {
    const safe: Record<string, { code: string; status: number }> = {
      VALIDATION_FAILED: { code: 'VALIDATION_FAILED', status: 400 },
      PAYLOAD_EMPTY: { code: 'PAYLOAD_EMPTY', status: 400 },
      PAYLOAD_TOO_LARGE: { code: 'PAYLOAD_TOO_LARGE', status: 413 },
      UNSUPPORTED_MEDIA_TYPE: { code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 },
      MALWARE_DETECTED: { code: 'FILE_REJECTED_BY_SCAN', status: 422 },
      SCANNER_UNAVAILABLE: { code: 'SCANNER_UNAVAILABLE', status: 503 },
      DOCUMENT_UPLOAD_FAILED: { code: 'UPLOAD_FAILED', status: 503 },
      CONFLICT: { code: 'OPERATION_REUSED', status: 409 },
      FORBIDDEN: { code: 'DOCUMENT_UNAVAILABLE', status: 404 },
    };
    const mapped = safe[error.code];
    if (mapped) return errorResponse(mapped.code, 'Unable to upload document', mapped.status);
  }
  safeLog(log, 'employee.document.upload.route', error);
  return errorResponse('UPLOAD_FAILED', 'Unable to upload document', 500);
}

export function createEmployeeDocumentUploadPostHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request, context: RouteContext): Promise<Response> => {
    const csrf = await deps.guardCsrf(request);
    if (csrf) return csrf;

    const { tenant } = await context.params;
    let authority: EmployeeUploadAuthority;
    try {
      authority = await deps.authorize(tenant);
    } catch (error) {
      safeLog(deps.log, 'employee.document.upload.authorize', error);
      return errorResponse('NOT_FOUND', 'Resource not found', 404);
    }

    let decision: LimitDecision;
    try {
      decision = await deps.limit(authority.actorId, authority.companyId);
    } catch (error) {
      safeLog(deps.log, 'employee.document.upload.limit', error);
      decision = 'unavailable';
    }
    if (decision === 'limited') return errorResponse('RATE_LIMITED', 'Too many requests', 429);
    if (decision === 'unavailable') {
      return errorResponse('SERVICE_UNAVAILABLE', 'Service temporarily unavailable', 503);
    }

    let form: FormData;
    try {
      form = await readBoundedFormData(
        request,
        MAX_DOCUMENT_UPLOAD_BYTES + MULTIPART_BODY_ENVELOPE_BYTES,
      );
    } catch (error) {
      return error instanceof BodyTooLargeError
        ? errorResponse('PAYLOAD_TOO_LARGE', 'Upload is too large', 413)
        : errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
    }

    try {
      if (!hasExactFields(form)) return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      const parsed = customerUploadActionSchema.safeParse({
        doc_type: form.get('doc_type'),
        operation_id: form.get('operation_id'),
        request_id: form.get('request_id'),
        label: form.get('label') ?? undefined,
      });
      const file = form.get('file');
      if (!parsed.success || !parsed.data.request_id || !(file instanceof File)) {
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      }
      if (file.size === 0) return errorResponse('PAYLOAD_EMPTY', 'File is empty', 400);
      if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
        return errorResponse('PAYLOAD_TOO_LARGE', 'File is too large', 413);
      }
      const result = await deps.submit(
        authority,
        parsed.data as typeof parsed.data & { request_id: string },
        file,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
          userAgent: request.headers.get('user-agent'),
        },
      );
      const projected = publicReceipt.safeParse(result);
      if (!projected.success) throw new Error('invalid_employee_document_upload_result');
      await deps.revalidate(tenant);
      return jsonOk({ ok: true, data: projected.data });
    } catch (error) {
      return uploadError(error, deps.log);
    }
  };
}
