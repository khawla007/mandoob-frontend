import 'server-only';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { hashDestinationKey } from './contracts';

type ProvisioningRpcResult = { data: unknown; error: unknown };

export type InboundDestinationProvisioningClient = {
  rpc(
    name: 'provision_inbound_destination',
    args: Record<string, unknown>,
  ): PromiseLike<ProvisioningRpcResult>;
};

export type InboundDestinationProvisioningDependencies = InboundDestinationProvisioningClient & {
  secret?: string;
};

export type InboundDestinationProvisioningInput = {
  provider: 'twilio' | 'unifonic' | 'whatsapp';
  tenantId: string;
  companyId?: string | null;
  destinationId?: string | null;
  destinationKey: string;
  enabled?: boolean;
  readinessApproved?: boolean;
  operationId: string;
  correlationId: string;
};

export type InboundDestinationProvisioningResult = {
  destinationId: string;
  enabled: boolean;
  replayed: boolean;
};

const inputSchema = z
  .object({
    provider: z.enum(['twilio', 'unifonic', 'whatsapp']),
    tenantId: z.string().uuid(),
    companyId: z.string().uuid().nullable().default(null),
    destinationId: z.string().uuid().nullable().default(null),
    destinationKey: z.string().min(3),
    enabled: z.boolean().default(false),
    readinessApproved: z.boolean().default(false),
    operationId: z.string().uuid(),
    correlationId: z.string().uuid(),
  })
  .strict()
  .refine((value) => !value.enabled || value.readinessApproved, {
    message: 'readiness required',
  });

const resultSchema = z
  .array(
    z
      .object({
        destination_id: z.string().uuid(),
        enabled: z.boolean(),
        replayed: z.boolean(),
      })
      .strict(),
  )
  .length(1);

export class InboundDestinationProvisioningError extends Error {
  constructor() {
    super('INBOUND_DESTINATION_PROVISIONING_FAILED');
    this.name = 'InboundDestinationProvisioningError';
  }
}

function productionDependencies(): InboundDestinationProvisioningDependencies {
  const client = createSupabaseServiceRoleClient();
  return {
    secret: process.env.INBOUND_DESTINATION_HMAC_SECRET,
    rpc: client.rpc.bind(client) as InboundDestinationProvisioningClient['rpc'],
  };
}

export async function provisionInboundDestination(
  input: InboundDestinationProvisioningInput,
  dependencies?: InboundDestinationProvisioningDependencies,
): Promise<InboundDestinationProvisioningResult> {
  try {
    const parsed = inputSchema.parse(input);
    const resolvedDependencies = dependencies ?? productionDependencies();
    const destinationKeyHash = hashDestinationKey(
      parsed.provider,
      parsed.destinationKey,
      resolvedDependencies.secret,
    );
    const { data, error } = await resolvedDependencies.rpc('provision_inbound_destination', {
      p_provider: parsed.provider,
      p_tenant_id: parsed.tenantId,
      p_company_id: parsed.companyId,
      p_destination_id: parsed.destinationId,
      p_destination_key_hash: destinationKeyHash,
      p_enabled: parsed.enabled,
      p_readiness_approved: parsed.readinessApproved,
      p_operation_id: parsed.operationId,
      p_correlation_id: parsed.correlationId,
    });
    if (error) throw new InboundDestinationProvisioningError();

    const [result] = resultSchema.parse(data);
    if (result.enabled !== parsed.enabled) throw new InboundDestinationProvisioningError();
    return {
      destinationId: result.destination_id,
      enabled: result.enabled,
      replayed: result.replayed,
    };
  } catch {
    throw new InboundDestinationProvisioningError();
  }
}
