import { payloadHash } from '@/lib/p308/operation';
import { callP308, type P308Actor, type P308RpcClient } from '@/lib/p308/rpc';
import type {
  BatchTransitionRenewalInput,
  CreateRenewalActionInput,
  TransitionRenewalInput,
  UpdateRenewalInput,
} from '@/lib/validation/renewal';

export type RenewalReceipt = {
  renewal_id: string;
  version: number;
  stage?: string;
  replayed: boolean;
};

export async function createRenewal(
  client: P308RpcClient,
  actor: P308Actor,
  input: CreateRenewalActionInput,
): Promise<RenewalReceipt> {
  const {
    operation_id,
    government_fee_minor,
    pro_service_fee_minor,
    fine_minor,
    currency,
    ...rest
  } = input;
  const costs = Object.fromEntries(
    Object.entries({ government_fee_minor, pro_service_fee_minor, fine_minor, currency }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  const renewal = { ...rest, ...(Object.keys(costs).length > 0 ? { costs } : {}) };
  return callP308(client, 'p308_create_renewal', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash(renewal),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_renewal: renewal,
  });
}

export async function updateRenewal(
  client: P308RpcClient,
  actor: P308Actor,
  renewalId: string,
  input: UpdateRenewalInput,
): Promise<RenewalReceipt> {
  const { operation_id, expected_version, ...patch } = input;
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return callP308(client, 'p308_update_renewal', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash({ renewalId, expected_version, clean }),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_renewal_id: renewalId,
    p_expected_version: expected_version,
    p_patch: clean,
  });
}

export async function transitionRenewal(
  client: P308RpcClient,
  actor: P308Actor,
  renewalId: string,
  input: TransitionRenewalInput,
): Promise<RenewalReceipt> {
  const { operation_id, ...rest } = input;
  return callP308(client, 'p308_transition_renewal', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash({ renewalId, ...rest }),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_renewal_id: renewalId,
    p_expected_version: input.expected_version,
    p_to_stage: input.to_stage,
    p_evidence_document_ids: input.evidence_document_ids ?? null,
    p_reason_code: input.reason_code ?? null,
  });
}

export async function batchTransitionRenewals(
  client: P308RpcClient,
  actor: P308Actor,
  input: BatchTransitionRenewalInput,
): Promise<{ count: number; items: RenewalReceipt[]; replayed: boolean }> {
  const { operation_id, ...rest } = input;
  return callP308(client, 'p308_batch_transition_renewals', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash(rest),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_items: input.items,
    p_to_stage: input.to_stage,
    p_reason_code: input.reason_code ?? null,
  });
}
