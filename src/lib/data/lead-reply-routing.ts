import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type InboundReplyChannel = 'whatsapp' | 'sms';
export type InboundReplyRouteStatus = 'routed' | 'unmatched';

export type InboundReplyInput = {
  tenantId: string;
  channel: InboundReplyChannel;
  inboxId: string | number;
  fromPhone: string;
  body: string | null;
  providerMessageId?: string | null;
  receivedAt?: string | null;
};

export type InboundReplyRouteResult =
  | { status: 'routed'; leadId: string; ambiguous: boolean; candidateLeadIds: string[] }
  | { status: 'unmatched' };

export type LeadReplyRoutingDeps = {
  supabase?: SupabaseClient;
};

type LeadCandidateRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  created_at: string;
};

const OPEN_STAGES = new Set(['new', 'contacted', 'qualified']);

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
  if (!digits) return null;
  return digits;
}

export async function routeInboundReplyToLead(
  input: InboundReplyInput,
  deps: LeadReplyRoutingDeps = {},
): Promise<InboundReplyRouteResult> {
  const normalizedFrom = normalizePhoneForLeadMatch(input.fromPhone);
  if (!normalizedFrom) {
    console.info('lead inbound reply unmatched', {
      tenant_id: input.tenantId,
      channel: input.channel,
      inbox_id: input.inboxId,
      reason: 'invalid_sender_phone',
    });
    return { status: 'unmatched' };
  }

  const admin = client(deps);
  const { data, error } = await admin
    .from('leads')
    .select('id, tenant_id, name, email, phone, stage, created_at')
    .eq('tenant_id', input.tenantId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`lead reply candidate lookup failed: ${error.message}`);

  const phoneMatches = ((data as LeadCandidateRow[] | null) ?? []).filter(
    (lead) => normalizePhoneForLeadMatch(lead.phone) === normalizedFrom,
  );

  if (phoneMatches.length === 0) {
    console.info('lead inbound reply unmatched', {
      tenant_id: input.tenantId,
      channel: input.channel,
      inbox_id: input.inboxId,
      from_phone: input.fromPhone,
      reason: 'no_same_tenant_phone_match',
    });
    return { status: 'unmatched' };
  }

  const sorted = [...phoneMatches].sort(compareLeadCandidates);
  const winner = sorted[0];
  const candidateLeadIds = sorted.map((lead) => lead.id);
  const ambiguous = sorted.length > 1;
  const metadata = {
    channel: input.channel,
    inbox_id: String(input.inboxId),
    from_phone: input.fromPhone,
    body_preview: (input.body ?? '').slice(0, 500),
    provider_message_id: input.providerMessageId ?? null,
    received_at: input.receivedAt ?? null,
    routed_status: 'routed',
    ambiguous,
    candidate_lead_ids: ambiguous ? candidateLeadIds : [],
  };

  const existingEvent = await findExistingInboundReplyEvent(admin, input);
  if (existingEvent) {
    return {
      status: 'routed',
      leadId: existingEvent.lead_id,
      ambiguous,
      candidateLeadIds,
    };
  }

  const { error: insertError } = await admin.from('lead_events').insert({
    lead_id: winner.id,
    tenant_id: input.tenantId,
    actor_id: null,
    event_type: 'inbound_reply',
    from_value: input.fromPhone,
    to_value: input.channel,
    note: input.body ?? null,
    metadata,
  });

  if (insertError) throw new Error(`lead reply event insert failed: ${insertError.message}`);

  return { status: 'routed', leadId: winner.id, ambiguous, candidateLeadIds };
}

export async function routeInboundReplyToLeadSafely(
  input: InboundReplyInput,
  deps: LeadReplyRoutingDeps = {},
): Promise<InboundReplyRouteResult> {
  try {
    return await routeInboundReplyToLead(input, deps);
  } catch (error) {
    console.error('lead inbound reply routing failed', {
      tenant_id: input.tenantId,
      channel: input.channel,
      inbox_id: input.inboxId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'unmatched' };
  }
}

function compareLeadCandidates(a: LeadCandidateRow, b: LeadCandidateRow): number {
  const aOpen = OPEN_STAGES.has(a.stage);
  const bOpen = OPEN_STAGES.has(b.stage);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  return b.created_at.localeCompare(a.created_at);
}

async function findExistingInboundReplyEvent(
  admin: SupabaseClient,
  input: InboundReplyInput,
): Promise<{ lead_id: string } | null> {
  const identityKey = input.providerMessageId ? 'provider_message_id' : 'inbox_id';
  const identityValue = input.providerMessageId ?? String(input.inboxId);
  const { data, error } = await admin
    .from('lead_events')
    .select('lead_id, metadata')
    .eq('tenant_id', input.tenantId)
    .eq('event_type', 'inbound_reply')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`lead reply idempotency lookup failed: ${error.message}`);

  return (
    ((data as Array<{ lead_id: string; metadata: Record<string, unknown> }> | null) ?? []).find(
      (event) =>
        event.metadata?.channel === input.channel &&
        event.metadata?.[identityKey] === identityValue,
    ) ?? null
  );
}
