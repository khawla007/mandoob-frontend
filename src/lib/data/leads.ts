import 'server-only';
import { ApiError } from '@/lib/errors';
import { questionnaireSubmissionSchema, type QuestionnaireSubmission } from '@/lib/questionnaire';
import { createHash, randomUUID } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { scoreLead } from '@/lib/leads/scoring';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type TenantRoutingRow = {
  id: string;
  status: string;
  created_at: string;
  name?: string | null;
};

export type LeadCreateResult = {
  leadId: string;
  stage: 'new';
  assignedTenantId: string | null;
};

export type LeadDeps = {
  supabase?: SupabaseClient;
  publishEvent?: (leadId: string) => Promise<void>;
};

export type RecalculateLeadScoresResult = {
  scanned: number;
  updated: number;
};

export function selectTenantForQuestionnaireLead(rows: TenantRoutingRow[]): {
  tenantId: string | null;
  routingReason: 'platform_unassigned';
  tenantName?: string | null;
} {
  void rows;
  return { tenantId: null, routingReason: 'platform_unassigned' };
}

export async function createLeadFromQuestionnaire(
  rawInput: QuestionnaireSubmission,
  deps: LeadDeps = {},
): Promise<LeadCreateResult> {
  const input = questionnaireSubmissionSchema.parse(rawInput);
  const supabase = deps.supabase ?? createSupabaseServiceRoleClient();

  const routing = await routeLead(supabase);
  const answers = input.answers;
  const leadPayload = {
    tenant_id: routing.tenantId,
    name: answers.fullName,
    email: answers.email ?? null,
    phone: answers.phone ?? null,
    source: 'questionnaire',
    stage: 'new',
    form_data: answers,
    estimate_data: input.estimateData ?? {},
    routing_reason: routing.routingReason,
    score: scoreLead({ answers, estimateData: input.estimateData ?? {} }).score,
    assigned_team_member_id: null,
    converted_company_id: null,
  };

  const { data, error } = await supabase
    .from('leads')
    .insert(leadPayload)
    .select('id, stage, tenant_id')
    .single();

  if (error || !data) {
    console.error('questionnaire lead insert failed', error);
    throw new ApiError('INTERNAL', 'Could not create lead', 500);
  }

  const leadId = data.id as string;
  await recordLeadAudit(supabase, routing.tenantId, leadId, routing.routingReason);
  await (deps.publishEvent ?? ((id: string) => emitLeadAcceptedEvent(supabase, id)))(leadId);

  return {
    leadId,
    stage: 'new',
    assignedTenantId: (data.tenant_id as string | null) ?? null,
  };
}

async function routeLead(supabase: SupabaseClient) {
  void supabase;
  return selectTenantForQuestionnaireLead([]);
}

export async function recalculateLeadScores(
  args: { limit?: number } = {},
  deps: LeadDeps = {},
): Promise<RecalculateLeadScoresResult> {
  const supabase = deps.supabase ?? createSupabaseServiceRoleClient();
  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  const { data, error } = await supabase
    .from('leads')
    .select('id, form_data, estimate_data, score')
    .eq('source', 'questionnaire')
    .limit(limit);

  if (error) throw new ApiError('INTERNAL', error.message, 500);

  const rows =
    (data as Array<{
      id: string;
      form_data: Record<string, unknown> | null;
      estimate_data: Record<string, unknown> | null;
      score?: number | null;
    }> | null) ?? [];

  let updated = 0;
  for (const row of rows) {
    const nextScore = scoreLead({
      answers: row.form_data ?? {},
      estimateData: row.estimate_data ?? {},
    }).score;
    if (row.score === nextScore) continue;
    const { error: updateError } = await supabase
      .from('leads')
      .update({ score: nextScore })
      .eq('id', row.id);
    if (updateError) throw new ApiError('INTERNAL', updateError.message, 500);
    updated += 1;
  }

  console.info('lead scores recalculated', { scanned: rows.length, updated });
  return { scanned: rows.length, updated };
}

async function recordLeadAudit(
  supabase: SupabaseClient,
  tenantId: string | null,
  leadId: string,
  routingReason: string,
): Promise<void> {
  if (!tenantId) return;

  const { error } = await supabase.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: null,
    action: 'lead_created',
    source: 'system',
    details: { lead_id: leadId, routing_reason: routingReason },
  });
  if (error) console.error('lead_created audit insert failed', error);
}

async function emitLeadAcceptedEvent(supabase: SupabaseClient, leadId: string): Promise<void> {
  // A single domain event is the delivery trigger for questionnaire acceptance; channel
  // fan-out (email/WhatsApp/SMS/in-app) is P3.10-owned. Best-effort: the lead is already
  // committed, so acceptance truth persists even if event emission is momentarily degraded.
  const payload = { resource_id: leadId, lead_id: leadId, operation_id: leadId, version: 1 };
  const dedupeKey = createHash('sha256').update(`application.accepted:${leadId}`).digest('hex');
  const { error } = await supabase.rpc(
    'publish_domain_event' as never,
    {
      p_event_id: randomUUID(),
      p_event_type: 'application.accepted',
      p_event_version: 1,
      p_occurred_at: new Date().toISOString(),
      p_tenant_id: null,
      p_company_id: null,
      p_actor_id: null,
      p_correlation_id: null,
      p_causation_id: null,
      p_privacy_class: 'restricted',
      p_payload: payload,
      p_dedupe_key: dedupeKey,
    } as never,
  );
  if (error) console.error('lead accepted event publish failed', { leadId, error });
}
