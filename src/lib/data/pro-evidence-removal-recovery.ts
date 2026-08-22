import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { PRO_CREDENTIAL_STATES } from '@/lib/pro-lifecycle/contracts';
import { isOwnedProCredentialEvidencePath } from '@/lib/storage/pro-credential-path';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
type RpcDeps = { supabase?: RpcClient };

const uuid = z.string().uuid();
const credentialMaskSchema = z
  .object({
    credentialId: uuid,
    type: z.literal('pro_license'),
    maskedIdentifier: z
      .string()
      .regex(/^•••• [A-Z0-9]{4}$/u)
      .nullable(),
    issuingAuthority: z.string().nullable(),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    state: z.enum(PRO_CREDENTIAL_STATES),
    version: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    supersedesCredentialId: uuid.nullable(),
  })
  .strict();
const recoveringSchema = z
  .object({
    status: z.literal('recovering'),
    recoveryOperationId: uuid,
    credentialId: uuid,
    evidenceId: uuid,
    storagePath: z.string().min(1),
  })
  .strict();
const claimSchema = z.discriminatedUnion('status', [
  recoveringSchema,
  z.object({ status: z.literal('complete'), credential: credentialMaskSchema }).strict(),
]);

export type EvidenceRecoveryInput = {
  actorId: string;
  proProfileId: string;
  credentialId: string;
  evidenceId: string;
  recoveryOperationId: string;
};
type Claim = z.infer<typeof claimSchema>;
type CredentialMask = z.infer<typeof credentialMaskSchema>;

function rpcArgs(input: EvidenceRecoveryInput): Record<string, unknown> {
  return {
    p_actor_id: uuid.parse(input.actorId),
    p_pro_profile_id: uuid.parse(input.proProfileId),
    p_credential_id: uuid.parse(input.credentialId),
    p_evidence_id: uuid.parse(input.evidenceId),
    p_recovery_operation_id: uuid.parse(input.recoveryOperationId),
  };
}

function recoveryError(message?: string): ApiError {
  const mapped: Record<string, { status: number; code: string }> = {
    NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
    EVIDENCE_REMOVAL_LEASE_ACTIVE: { code: 'EVIDENCE_REMOVAL_LEASE_ACTIVE', status: 409 },
    EVIDENCE_REMOVAL_CLAIM_LOST: { code: 'EVIDENCE_REMOVAL_CLAIM_LOST', status: 409 },
    EVIDENCE_REMOVAL_IN_PROGRESS: { code: 'EVIDENCE_REMOVAL_IN_PROGRESS', status: 409 },
    RECOVERY_STATE_CHANGED: { code: 'EVIDENCE_REMOVAL_IN_PROGRESS', status: 409 },
  };
  const known = message ? mapped[message.trim()] : undefined;
  return known
    ? new ApiError(known.code, 'Unable to recover evidence removal', known.status)
    : new ApiError('INTERNAL', 'Unable to recover evidence removal', 500);
}

function rpcClient(deps: RpcDeps): RpcClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as RpcClient);
}

export async function claimProCredentialEvidenceRemovalRecovery(
  input: EvidenceRecoveryInput,
  deps: RpcDeps = {},
): Promise<Claim> {
  const { data, error } = await rpcClient(deps).rpc(
    'claim_pro_credential_evidence_removal_recovery',
    rpcArgs(input),
  );
  if (error) throw recoveryError(error.message);
  const parsed = claimSchema.safeParse(data);
  if (!parsed.success) throw recoveryError();
  return parsed.data;
}

export async function finalizeProCredentialEvidenceRemovalRecovery(
  input: EvidenceRecoveryInput,
  deps: RpcDeps = {},
): Promise<CredentialMask> {
  const { data, error } = await rpcClient(deps).rpc(
    'finalize_pro_credential_evidence_removal_recovery',
    rpcArgs(input),
  );
  if (error) throw recoveryError(error.message);
  const parsed = credentialMaskSchema.safeParse(data);
  if (!parsed.success) throw recoveryError();
  return parsed.data;
}

type WorkerInput = Omit<EvidenceRecoveryInput, 'recoveryOperationId'>;
type WorkerDeps = {
  operationId?: () => string;
  claim?: (input: EvidenceRecoveryInput) => Promise<Claim>;
  erase?: (path: string) => Promise<void>;
  finalize?: (input: EvidenceRecoveryInput) => Promise<CredentialMask>;
  timeoutMs?: number;
};

async function defaultErase(path: string): Promise<void> {
  const { error } = await createSupabaseServiceRoleClient()
    .storage.from('tenant-documents')
    .remove([path]);
  if (error) throw new Error('storage_cleanup_failed');
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('storage_cleanup_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function recoverAbandonedProCredentialEvidence(
  raw: WorkerInput,
  deps: WorkerDeps = {},
): Promise<CredentialMask> {
  const input: EvidenceRecoveryInput = {
    actorId: uuid.parse(raw.actorId),
    proProfileId: uuid.parse(raw.proProfileId),
    credentialId: uuid.parse(raw.credentialId),
    evidenceId: uuid.parse(raw.evidenceId),
    recoveryOperationId: uuid.parse((deps.operationId ?? randomUUID)()),
  };
  const claim = await (deps.claim ?? claimProCredentialEvidenceRemovalRecovery)(input);
  if (claim.status === 'complete') return claim.credential;
  if (
    claim.recoveryOperationId !== input.recoveryOperationId ||
    claim.credentialId !== input.credentialId ||
    claim.evidenceId !== input.evidenceId ||
    !isOwnedProCredentialEvidencePath(
      claim.storagePath,
      input.proProfileId,
      input.credentialId,
      input.evidenceId,
    )
  ) {
    throw recoveryError();
  }
  const timeoutMs = z
    .number()
    .int()
    .positive()
    .max(30_000)
    .parse(deps.timeoutMs ?? 10_000);
  try {
    await bounded((deps.erase ?? defaultErase)(claim.storagePath), timeoutMs);
  } catch {
    throw new ApiError('RECOVERY_RETRYABLE', 'Evidence recovery can be retried', 503);
  }
  return (deps.finalize ?? finalizeProCredentialEvidenceRemovalRecovery)(input);
}
