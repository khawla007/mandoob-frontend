import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BodyTooLargeError,
  MULTIPART_BODY_ENVELOPE_BYTES,
  readBoundedFormData,
} from '@/app/api/v1/_shared/bounded-body';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { requireAuthorizedCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import {
  coordinateBankEvidenceUpload,
  MAX_BANK_EVIDENCE_BYTES,
  type BankEvidenceReceipt,
  type BankEvidenceUploadInput,
} from '@/lib/finance/p3-07-bank-evidence-adapter';

type LimitDecision = 'allowed' | 'limited' | 'unavailable';
type RouteContext = { params: Promise<{ tenant: string }> };
type Authority = Pick<
  BankEvidenceUploadInput,
  'actorId' | 'tenantId' | 'companyId' | 'customerProfileId'
>;
type Dependencies = {
  guardCsrf(request: Request): Promise<Response | null>;
  authorize(tenantSlug: string): Promise<Authority>;
  limit(actorId: string, companyId: string): Promise<LimitDecision>;
  submit(input: BankEvidenceUploadInput): Promise<BankEvidenceReceipt>;
  revalidate(tenantSlug: string, invoiceId: string): void | Promise<void>;
  log(label: string, error: unknown): void;
};

const defaults: Dependencies = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  authorize: async (tenantSlug) => {
    const access = await requireAuthorizedCustomerLinkedCompanyRead(tenantSlug);
    return {
      actorId: access.session.id,
      customerProfileId: access.session.id,
      tenantId: access.tenant.id,
      companyId: access.company.id,
    };
  },
  limit: async (actorId, companyId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `customer-bank-evidence:${actorId}:${companyId}`,
      routeLabel: 'customer-bank-evidence',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialUpload,
    });
  },
  submit: coordinateBankEvidenceUpload,
  revalidate: async (tenantSlug, invoiceId) => {
    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/t/${tenantSlug}/portal/payments`);
    revalidatePath(`/t/${tenantSlug}/portal/payments/${invoiceId}`);
  },
  log: logSafeActionError,
};

const uuid = z.string().uuid();
const publicReceipt = z
  .object({
    status: z.enum(['pending', 'clean', 'rejected', 'reconciled', 'expired', 'held', 'tombstoned']),
    operationId: uuid,
    submissionId: uuid,
    documentId: uuid,
    versionId: uuid,
    replayed: z.boolean(),
  })
  .strict();

function safeLog(log: Dependencies['log'], label: string, error: unknown) {
  try {
    log(label, error);
  } catch {
    /* logging is not an authorization boundary */
  }
}

function mappedError(error: unknown, log: Dependencies['log']): Response {
  if (error instanceof ApiError) {
    const allowed: Record<string, number> = {
      VALIDATION_FAILED: 400,
      PAYLOAD_EMPTY: 400,
      PAYLOAD_TOO_LARGE: 413,
      UNSUPPORTED_MEDIA_TYPE: 415,
      MALWARE_DETECTED: 422,
      FORBIDDEN: 404,
      NOT_FOUND: 404,
      CONFLICT: 409,
      BANK_EVIDENCE_FAILED: 503,
    };
    const status = allowed[error.code];
    if (status)
      return errorResponse(
        error.code === 'FORBIDDEN' ? 'NOT_FOUND' : error.code,
        'Unable to upload bank evidence',
        status,
      );
  }
  safeLog(log, 'customer.bank-evidence.upload', error);
  return errorResponse('UPLOAD_FAILED', 'Unable to upload bank evidence', 500);
}

export function createCustomerBankEvidencePostHandler(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request, context: RouteContext): Promise<Response> => {
    const csrf = await deps.guardCsrf(request);
    if (csrf) return csrf;
    const { tenant } = await context.params;
    let authority: Authority;
    try {
      authority = await deps.authorize(tenant);
    } catch (error) {
      safeLog(deps.log, 'customer.bank-evidence.authorize', error);
      return errorResponse('NOT_FOUND', 'Resource not found', 404);
    }
    let limit: LimitDecision;
    try {
      limit = await deps.limit(authority.actorId, authority.companyId);
    } catch (error) {
      safeLog(deps.log, 'customer.bank-evidence.limit', error);
      limit = 'unavailable';
    }
    if (limit === 'limited') return errorResponse('RATE_LIMITED', 'Too many requests', 429);
    if (limit === 'unavailable')
      return errorResponse('SERVICE_UNAVAILABLE', 'Service temporarily unavailable', 503);

    let form: FormData;
    try {
      form = await readBoundedFormData(
        request,
        MAX_BANK_EVIDENCE_BYTES + MULTIPART_BODY_ENVELOPE_BYTES,
      );
    } catch (error) {
      return error instanceof BodyTooLargeError
        ? errorResponse('PAYLOAD_TOO_LARGE', 'Upload is too large', 413)
        : errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
    }

    try {
      const names = Array.from(form.keys());
      if (
        names.some((name) => !['invoice_id', 'operation_id', 'file'].includes(name)) ||
        ['invoice_id', 'operation_id', 'file'].some((name) => form.getAll(name).length !== 1)
      )
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      const fields = z
        .object({ invoiceId: uuid, operationId: uuid })
        .strict()
        .safeParse({
          invoiceId: form.get('invoice_id'),
          operationId: form.get('operation_id'),
        });
      const file = form.get('file');
      if (!fields.success || !(file instanceof File))
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      if (file.size === 0) return errorResponse('PAYLOAD_EMPTY', 'File is empty', 400);
      if (file.size > MAX_BANK_EVIDENCE_BYTES)
        return errorResponse('PAYLOAD_TOO_LARGE', 'File is too large', 413);
      const result = await deps.submit({
        ...authority,
        ...fields.data,
        policyKey: null,
        expiresAt: null,
        file: {
          data: new Uint8Array(await file.arrayBuffer()),
          filename: file.name || 'upload',
          mimeType: file.type || 'application/octet-stream',
        },
      });
      const parsed = publicReceipt.parse(result);
      const safe = {
        status: parsed.status,
        submissionId: parsed.submissionId,
        documentId: parsed.documentId,
        versionId: parsed.versionId,
        replayed: parsed.replayed,
      };
      await deps.revalidate(tenant, fields.data.invoiceId);
      return jsonOk({ ok: true, data: safe });
    } catch (error) {
      return mappedError(error, deps.log);
    }
  };
}
