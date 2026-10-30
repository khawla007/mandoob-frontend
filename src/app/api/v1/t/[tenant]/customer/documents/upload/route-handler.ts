import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  BodyTooLargeError,
  MULTIPART_BODY_ENVELOPE_BYTES,
  readBoundedFormData,
} from '@/app/api/v1/_shared/bounded-body';
import {
  resolveCustomerDocumentUploadAuthority,
  submitCustomerDocumentUpload,
  type CustomerUploadAuthority,
} from '@/lib/data/customer-document-upload';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/documents/upload-contract';
import { customerUploadActionSchema } from '@/lib/validation/document';

type LimitDecision = 'allowed' | 'limited' | 'unavailable';
type RouteContext = { params: Promise<{ tenant: string }> };
type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  authorize(tenantSlug: string): Promise<CustomerUploadAuthority>;
  limit(actorId: string, companyId: string): Promise<LimitDecision>;
  submit: typeof submitCustomerDocumentUpload;
  revalidate(tenantSlug: string): void | Promise<void>;
  log(label: string, error: unknown): void;
};

const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  authorize: resolveCustomerDocumentUploadAuthority,
  limit: async (actorId, companyId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `customer-document-upload:${actorId}:${companyId}`,
      routeLabel: 'customer-document-upload',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialUpload,
    });
  },
  submit: submitCustomerDocumentUpload,
  revalidate: async (tenantSlug) => {
    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/t/${tenantSlug}/portal/documents`);
    revalidatePath(`/t/${tenantSlug}/portal`);
  },
  log: logSafeActionError,
};

const FIELD_NAMES = ['doc_type', 'operation_id', 'request_id', 'label', 'file'] as const;
const REQUIRED_FIELDS = ['doc_type', 'operation_id', 'file'] as const;
const canonicalUuid = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const publicUploadResult = z
  .object({ documentId: canonicalUuid, versionId: canonicalUuid })
  .strict();

function safeLog(log: Deps['log'], label: string, error: unknown): void {
  try {
    log(label, error);
  } catch {
    // Logging must never weaken the fail-closed HTTP response.
  }
}

function errorForLimit(decision: LimitDecision): Response | null {
  if (decision === 'limited') return errorResponse('RATE_LIMITED', 'Too many requests', 429);
  if (decision === 'unavailable')
    return errorResponse('SERVICE_UNAVAILABLE', 'Service temporarily unavailable', 503);
  return null;
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
  safeLog(log, 'customer.document.upload.route', error);
  return errorResponse('UPLOAD_FAILED', 'Unable to upload document', 500);
}

function hasExactFields(form: FormData): boolean {
  const names = Array.from(form.keys());
  return (
    names.every((name) => FIELD_NAMES.includes(name as (typeof FIELD_NAMES)[number])) &&
    REQUIRED_FIELDS.every((name) => form.getAll(name).length === 1) &&
    ['request_id', 'label'].every((name) => form.getAll(name).length <= 1)
  );
}

export function createCustomerDocumentUploadPostHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request, context: RouteContext): Promise<Response> => {
    const csrf = await deps.guardCsrf(request);
    if (csrf) return csrf;

    const { tenant } = await context.params;
    let authority: CustomerUploadAuthority;
    try {
      authority = await deps.authorize(tenant);
    } catch (error) {
      safeLog(deps.log, 'customer.document.upload.authorize', error);
      return errorResponse('NOT_FOUND', 'Resource not found', 404);
    }

    let limitDecision: LimitDecision;
    try {
      limitDecision = await deps.limit(authority.actorId, authority.companyId);
    } catch (error) {
      safeLog(deps.log, 'customer.document.upload.limit', error);
      limitDecision = 'unavailable';
    }
    const limited = errorForLimit(limitDecision);
    if (limited) return limited;

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
      if (!hasExactFields(form)) {
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      }
      const fields = customerUploadActionSchema.safeParse({
        doc_type: form.get('doc_type'),
        operation_id: form.get('operation_id'),
        request_id: form.get('request_id') ?? undefined,
        label: form.get('label') ?? undefined,
      });
      const file = form.get('file');
      if (!fields.success || !(file instanceof File)) {
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      }
      if (file.size === 0) return errorResponse('PAYLOAD_EMPTY', 'File is empty', 400);
      if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
        return errorResponse('PAYLOAD_TOO_LARGE', 'File is too large', 413);
      }
      const result = await deps.submit(authority, fields.data, file, {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
        userAgent: request.headers.get('user-agent'),
      });
      const publicResult = publicUploadResult.safeParse(result);
      if (!publicResult.success) throw new Error('invalid_customer_document_upload_result');
      await deps.revalidate(tenant);
      return jsonOk({ ok: true, data: publicResult.data });
    } catch (error) {
      return uploadError(error, deps.log);
    }
  };
}
