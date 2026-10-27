import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { signBankEvidenceAccess, type BankEvidenceState } from './p3-07-bank-evidence-adapter';
import { financePayloadHash } from './repository';

export type BankEvidenceReviewRow = {
  id: string;
  tenantId: string;
  companyId: string;
  invoiceId: string;
  state: BankEvidenceState;
  createdAt: string;
  expiresAt: string | null;
  legalHold: boolean;
  investigationHold: boolean;
  version: number;
};
type Query = {
  select(value: string): Query;
  eq(column: string, value: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(value: number): PromiseLike<{ data: unknown; error: unknown }>;
};
type Client = {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
const uuid = z.string().uuid();
const rowSchema = z
  .object({
    id: uuid,
    tenant_id: uuid,
    company_id: uuid,
    invoice_id: uuid,
    review_state: z.enum([
      'pending',
      'clean',
      'rejected',
      'reconciled',
      'expired',
      'held',
      'tombstoned',
    ]),
    created_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }).nullable(),
    legal_hold: z.boolean(),
    investigation_hold: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict();

async function serviceClient(): Promise<Client> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as Client;
}

export async function listBankEvidenceReviewQueue(
  scope: { tenantId?: string; companyId?: string; invoiceId?: string },
  client?: Client,
): Promise<BankEvidenceReviewRow[]> {
  let query = (client ?? (await serviceClient()))
    .from('bank_transfer_submissions')
    .select(
      'id,tenant_id,company_id,invoice_id,review_state,created_at,expires_at,legal_hold,investigation_hold,version',
    );
  if (scope.tenantId) query = query.eq('tenant_id', uuid.parse(scope.tenantId));
  if (scope.companyId) query = query.eq('company_id', uuid.parse(scope.companyId));
  if (scope.invoiceId) query = query.eq('invoice_id', uuid.parse(scope.invoiceId));
  const { data, error } = await query.order('created_at', { ascending: false }).limit(25);
  if (error || !Array.isArray(data))
    throw new ApiError('UNAVAILABLE', 'Bank evidence unavailable', 503);
  return data.map((value) => {
    const row = rowSchema.parse(value);
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      invoiceId: row.invoice_id,
      state: row.review_state,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      legalHold: row.legal_hold,
      investigationHold: row.investigation_hold,
      version: row.version,
    };
  });
}

export async function reviewBankEvidence(
  input: {
    actorId: string;
    tenantId: string;
    companyId: string;
    submissionId: string;
    operationId: string;
    expectedVersion: number;
    expectedState: 'pending';
    decision: 'clean' | 'rejected';
    note: string | null;
  },
  client?: Client,
): Promise<
  | { ok: true; state: 'clean' | 'rejected'; version: number; replayed: boolean }
  | { ok: false; code: string }
> {
  try {
    const parsed = z
      .object({
        actorId: uuid,
        tenantId: uuid,
        companyId: uuid,
        submissionId: uuid,
        operationId: uuid,
        expectedVersion: z.number().int().nonnegative(),
        expectedState: z.literal('pending'),
        decision: z.enum(['clean', 'rejected']),
        note: z.string().trim().min(3).max(280).nullable(),
      })
      .strict()
      .parse(input);
    if (parsed.decision === 'rejected' && !parsed.note)
      return { ok: false, code: 'VALIDATION_FAILED' };
    const { data, error } = await (client ?? (await serviceClient())).rpc(
      'p309_review_bank_evidence',
      {
        p_actor_id: parsed.actorId,
        p_tenant_id: parsed.tenantId,
        p_company_id: parsed.companyId,
        p_submission_id: parsed.submissionId,
        p_operation_id: parsed.operationId,
        p_expected_version: parsed.expectedVersion,
        p_expected_state: parsed.expectedState,
        p_payload_hash: financePayloadHash({
          tenantId: parsed.tenantId,
          companyId: parsed.companyId,
          submissionId: parsed.submissionId,
          expectedVersion: parsed.expectedVersion,
          expectedState: parsed.expectedState,
          decision: parsed.decision,
          note: parsed.note,
        }),
        p_decision: parsed.decision,
        p_note: parsed.note,
      },
    );
    if (error || !data) return { ok: false, code: 'UNAVAILABLE' };
    const result = z
      .object({
        status: z.enum(['clean', 'rejected']),
        version: z.number().int().nonnegative(),
        replayed: z.boolean(),
      })
      .passthrough()
      .parse(data);
    return { ok: true, state: result.status, version: result.version, replayed: result.replayed };
  } catch {
    return { ok: false, code: 'VALIDATION_FAILED' };
  }
}

export async function openBankEvidence(
  input: {
    actorId: string;
    tenantId: string;
    companyId: string;
    submissionId: string;
    lifetimeSeconds: number;
  },
  signer: typeof signBankEvidenceAccess = signBankEvidenceAccess,
) {
  return signer(input);
}
