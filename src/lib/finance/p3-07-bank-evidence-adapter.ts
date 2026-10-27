import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import {
  coordinateDocumentUpload,
  type CoordinateDocumentUploadInput,
  type DocumentUploadReceipt,
} from '@/lib/data/document-upload-lifecycle';
import { signDocumentAccess, type DocumentAccessInput } from '@/lib/data/document-access';
import { BANK_EVIDENCE_MIME_TYPES, MAX_BANK_EVIDENCE_BYTES } from './bank-evidence-contract';

export { MAX_BANK_EVIDENCE_BYTES } from './bank-evidence-contract';
export const BANK_EVIDENCE_LABEL = 'Bank transfer evidence';

const uuid = z.string().uuid();
const policyKey = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/u);
const timestamp = z.string().datetime({ offset: true });
const evidenceState = z.enum([
  'pending',
  'clean',
  'rejected',
  'reconciled',
  'expired',
  'held',
  'tombstoned',
]);

export type BankEvidenceState = z.infer<typeof evidenceState>;
export type BankEvidenceUploadInput = {
  actorId: string;
  tenantId: string;
  companyId: string;
  customerProfileId: string;
  invoiceId: string;
  operationId: string;
  policyKey: string | null;
  expiresAt: string | null;
  file: CoordinateDocumentUploadInput['file'];
};
export type BankEvidenceReceipt = {
  status: BankEvidenceState;
  operationId: string;
  submissionId: string;
  documentId: string;
  versionId: string;
  replayed: boolean;
};
type Prepared =
  | { status: 'prepared'; operationId: string; submissionId: string }
  | BankEvidenceReceipt;
type AccessContext = {
  status: 'allowed';
  documentId: string;
  versionId: string;
};

export type BankEvidenceDependencies = {
  prepare(input: Omit<BankEvidenceUploadInput, 'file'>): Promise<Prepared>;
  upload(input: CoordinateDocumentUploadInput): Promise<DocumentUploadReceipt>;
  finalize(input: {
    actorId: string;
    tenantId: string;
    companyId: string;
    customerProfileId: string;
    invoiceId: string;
    operationId: string;
    submissionId: string;
    documentId: string;
    versionId: string;
  }): Promise<BankEvidenceReceipt>;
  resolveAccess(input: {
    actorId: string;
    tenantId: string;
    companyId: string;
    submissionId: string;
  }): Promise<AccessContext>;
  sign(input: DocumentAccessInput): Promise<{ url: string; expiresAt: string }>;
};

const uploadSchema = z
  .object({
    actorId: uuid,
    tenantId: uuid,
    companyId: uuid,
    customerProfileId: uuid,
    invoiceId: uuid,
    operationId: uuid,
    policyKey: policyKey.nullable(),
    expiresAt: timestamp.nullable(),
    file: z.object({
      data: z.instanceof(Uint8Array),
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      expectedSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/iu)
        .optional(),
    }),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.policyKey === null) !== (value.expiresAt === null)) {
      context.addIssue({ code: 'custom', message: 'retention policy and expiry must be paired' });
    }
  });

function fail(code = 'BANK_EVIDENCE_FAILED', status = 503): ApiError {
  return new ApiError(code, 'Bank evidence could not be completed', status);
}

function sanitize(error: unknown): ApiError {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'PAYLOAD_TOO_LARGE') return fail(code, 413);
  if (code === 'UNSUPPORTED_MEDIA_TYPE') return fail(code, 415);
  if (code === 'MALWARE_DETECTED') return fail(code, 422);
  if (code === 'FORBIDDEN') return fail(code, 403);
  if (code === 'NOT_FOUND') return fail(code, 404);
  if (code === 'CONFLICT') return fail(code, 409);
  if (code === 'VALIDATION_FAILED' || error instanceof z.ZodError)
    return fail('VALIDATION_FAILED', 400);
  const sqlCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (sqlCode === 'P3094') return fail('FORBIDDEN', 403);
  if (sqlCode === 'P3099' || sqlCode === '23505') return fail('CONFLICT', 409);
  return fail();
}

function hasMagic(data: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    return data.length >= 5 && String.fromCharCode(...data.slice(0, 5)) === '%PDF-';
  }
  if (mimeType === 'image/jpeg') {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  return (
    mimeType === 'image/png' &&
    data.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => data[index] === byte)
  );
}

function validateFile(file: BankEvidenceUploadInput['file']): void {
  if (file.data.byteLength === 0) throw fail('PAYLOAD_EMPTY', 400);
  if (file.data.byteLength > MAX_BANK_EVIDENCE_BYTES) throw fail('PAYLOAD_TOO_LARGE', 413);
  if (!BANK_EVIDENCE_MIME_TYPES.some((mimeType) => mimeType === file.mimeType)) {
    throw fail('UNSUPPORTED_MEDIA_TYPE', 415);
  }
  const extension = file.filename.split('.').pop()?.toLowerCase();
  const expected =
    file.mimeType === 'application/pdf'
      ? ['pdf']
      : file.mimeType === 'image/jpeg'
        ? ['jpg', 'jpeg']
        : file.mimeType === 'image/png'
          ? ['png']
          : [];
  if (!expected.includes(extension ?? '') || !hasMagic(file.data, file.mimeType)) {
    throw fail('UNSUPPORTED_MEDIA_TYPE', 415);
  }
}

function parsePrepared(value: unknown, input: BankEvidenceUploadInput): Prepared {
  const base = z.object({ operationId: uuid, submissionId: uuid });
  const parsed = z
    .discriminatedUnion('status', [
      base.extend({ status: z.literal('prepared') }).strict(),
      base
        .extend({
          status: evidenceState,
          documentId: uuid,
          versionId: uuid,
          replayed: z.boolean(),
        })
        .strict(),
    ])
    .parse(value);
  if (parsed.operationId !== input.operationId) throw fail();
  return parsed;
}

function parseReceipt(
  value: unknown,
  input: BankEvidenceUploadInput,
  submissionId: string,
): BankEvidenceReceipt {
  const parsed = z
    .object({
      status: evidenceState,
      operationId: uuid,
      submissionId: uuid,
      documentId: uuid,
      versionId: uuid,
      replayed: z.boolean(),
    })
    .strict()
    .parse(value);
  if (parsed.operationId !== input.operationId || parsed.submissionId !== submissionId)
    throw fail();
  return parsed;
}

export async function coordinateBankEvidenceUpload(
  rawInput: BankEvidenceUploadInput,
  deps: BankEvidenceDependencies = createBankEvidenceDependencies(),
): Promise<BankEvidenceReceipt> {
  try {
    const input = uploadSchema.parse(rawInput);
    validateFile(input.file);
    const prepared = parsePrepared(
      await deps.prepare({
        actorId: input.actorId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        invoiceId: input.invoiceId,
        operationId: input.operationId,
        policyKey: input.policyKey,
        expiresAt: input.expiresAt,
      }),
      input,
    );
    if (prepared.status !== 'prepared') return prepared;

    const document = await deps.upload({
      actorId: input.actorId,
      tenantId: input.tenantId,
      companyId: input.companyId,
      operationId: input.operationId,
      requestId: null,
      documentId: null,
      employeeId: null,
      docType: 'other',
      label: BANK_EVIDENCE_LABEL,
      expectedHead: null,
      file: { ...input.file, maxBytes: MAX_BANK_EVIDENCE_BYTES },
    });
    return parseReceipt(
      await deps.finalize({
        actorId: input.actorId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        invoiceId: input.invoiceId,
        operationId: input.operationId,
        submissionId: prepared.submissionId,
        documentId: document.documentId,
        versionId: document.versionId,
      }),
      input,
      prepared.submissionId,
    );
  } catch (error) {
    throw sanitize(error);
  }
}

export async function signBankEvidenceAccess(
  rawInput: {
    actorId: string;
    tenantId: string;
    companyId: string;
    submissionId: string;
    lifetimeSeconds: number;
  },
  deps: BankEvidenceDependencies = createBankEvidenceDependencies(),
): Promise<{ url: string; expiresAt: string }> {
  try {
    const input = z
      .object({
        actorId: uuid,
        tenantId: uuid,
        companyId: uuid,
        submissionId: uuid,
        lifetimeSeconds: z.number().int().min(1).max(300),
      })
      .strict()
      .parse(rawInput);
    const context = z
      .object({ status: z.literal('allowed'), documentId: uuid, versionId: uuid })
      .strict()
      .parse(await deps.resolveAccess(input));
    return await deps.sign({
      actorId: input.actorId,
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentId: context.documentId,
      versionId: context.versionId,
      lifetimeSeconds: input.lifetimeSeconds,
    });
  } catch (error) {
    throw sanitize(error);
  }
}

function createBankEvidenceDependencies(): BankEvidenceDependencies {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { data, error } = await createSupabaseServiceRoleClient().rpc(
      name as never,
      args as never,
    );
    if (error) throw { code: error.code };
    return data;
  }
  return {
    prepare: (input) =>
      rpc('p309_prepare_bank_evidence', {
        p_actor_id: input.actorId,
        p_tenant_id: input.tenantId,
        p_company_id: input.companyId,
        p_customer_profile_id: input.customerProfileId,
        p_invoice_id: input.invoiceId,
        p_operation_id: input.operationId,
        p_policy_key: input.policyKey,
        p_expires_at: input.expiresAt,
      }) as Promise<Prepared>,
    upload: coordinateDocumentUpload,
    finalize: (input) =>
      rpc('p309_finalize_bank_evidence', {
        p_actor_id: input.actorId,
        p_tenant_id: input.tenantId,
        p_company_id: input.companyId,
        p_customer_profile_id: input.customerProfileId,
        p_invoice_id: input.invoiceId,
        p_operation_id: input.operationId,
        p_submission_id: input.submissionId,
        p_document_id: input.documentId,
        p_version_id: input.versionId,
      }) as Promise<BankEvidenceReceipt>,
    resolveAccess: (input) =>
      rpc('p309_resolve_bank_evidence_access', {
        p_actor_id: input.actorId,
        p_tenant_id: input.tenantId,
        p_company_id: input.companyId,
        p_submission_id: input.submissionId,
      }) as Promise<AccessContext>,
    sign: signDocumentAccess,
  };
}
