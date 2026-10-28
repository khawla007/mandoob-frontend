import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type InboundReplyChannel = 'whatsapp' | 'sms';
export type InboundReplyRouteStatus = 'routed' | 'unmatched';
export type InboundReplyInput = {
  tenantId: string;
  channel: InboundReplyChannel;
  inboxId: string | number;
  operationKey?: string;
  fromPhone: string;
  body: string | null;
  providerMessageId?: string | null;
  receivedAt?: string | null;
};
export type InboundReplyRouteResult =
  | { status: 'routed'; leadId: string; ambiguous: boolean; candidateLeadIds: string[] }
  | { status: 'unmatched' };
export type LeadReplyRoutingDeps = { supabase?: SupabaseClient };

type RoutingRpcRow = {
  status: InboundReplyRouteStatus;
  lead_id: string | null;
  ambiguous: boolean;
  candidate_lead_ids: string[];
};

function client(deps: LeadReplyRoutingDeps = {}) {
  return deps.supabase ?? createSupabaseServiceRoleClient();
}

export function normalizePhoneForLeadMatch(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `971${digits.slice(1)}`;
  return digits || null;
}

export async function routeInboundReplyToLead(
  input: InboundReplyInput,
  deps: LeadReplyRoutingDeps = {},
): Promise<InboundReplyRouteResult> {
  if (!normalizePhoneForLeadMatch(input.fromPhone)) {
    console.info('lead inbound reply unmatched', {
      tenant_id: input.tenantId,
      channel: input.channel,
      inbox_id: input.inboxId,
      reason: 'invalid_sender_phone',
    });
    return { status: 'unmatched' };
  }

  const { data, error } = await client(deps).rpc('route_inbound_reply_to_lead', {
    p_body: input.body,
    p_channel: input.channel,
    p_from_phone: input.fromPhone,
    p_inbox_id: String(input.inboxId),
    p_operation_key: input.operationKey ?? null,
    p_provider_message_id: input.providerMessageId ?? null,
    p_received_at: input.receivedAt ?? null,
    p_tenant_id: input.tenantId,
  });
  if (error) throw new Error('lead reply routing failed');

  const result = (data as RoutingRpcRow[] | null)?.[0];
  if (!result) throw new Error('lead reply routing failed');
  if (result.status === 'unmatched') {
    console.info('lead inbound reply unmatched', {
      tenant_id: input.tenantId,
      channel: input.channel,
      inbox_id: input.inboxId,
      reason: 'no_same_tenant_phone_match',
    });
    return { status: 'unmatched' };
  }
  if (!result.lead_id) throw new Error('lead reply routing failed');
  return {
    status: 'routed',
    leadId: result.lead_id,
    ambiguous: result.ambiguous,
    candidateLeadIds: result.candidate_lead_ids,
  };
}
