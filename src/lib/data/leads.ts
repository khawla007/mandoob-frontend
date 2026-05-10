import 'server-only';
import { ApiError } from '@/lib/errors';
import {
  questionnaireSubmissionSchema,
  type QuestionnaireSubmission,
} from '@/lib/questionnaire';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { enqueueEmail } from '@/lib/mail/send';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
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
  enqueueEmail?: typeof enqueueEmail;
  enqueueWhatsApp?: typeof enqueueWhatsApp;
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
  const emailQueue = deps.enqueueEmail ?? enqueueEmail;
  const whatsAppQueue = deps.enqueueWhatsApp ?? enqueueWhatsApp;

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
    converted_client_id: null,
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
  await enqueueAcknowledgements({
    leadId,
    tenantId: routing.tenantId,
    tenantName: routing.tenantName ?? 'Mandoob',
    input,
    emailQueue,
    whatsAppQueue,
  });

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
    const nextScore = scoreLead({ answers: row.form_data ?? {}, estimateData: row.estimate_data ?? {} }).score;
    if (row.score === nextScore) continue;
    const { error: updateError } = await supabase.from('leads').update({ score: nextScore }).eq('id', row.id);
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

async function enqueueAcknowledgements(args: {
  leadId: string;
  tenantId: string | null;
  tenantName: string;
  input: QuestionnaireSubmission;
  emailQueue: typeof enqueueEmail;
  whatsAppQueue: typeof enqueueWhatsApp;
}): Promise<void> {
  const { answers, estimateData } = args.input;
  const scheduledFor = new Date(0);
  const templateInput = {
    leadName: answers.fullName,
    tenantName: args.tenantName,
    leadReference: args.leadId,
    jurisdiction: answers.jurisdiction,
    authority: answers.authority,
  };

  if (answers.email) {
    await args
      .emailQueue({
        tenantId: args.tenantId,
        templateId: 'lead-acknowledgement',
        toAddress: answers.email,
        input: templateInput,
        scheduledFor,
        linked: { entityType: 'lead_acknowledgement', entityId: args.leadId },
      })
      .catch((error) => console.error('lead email acknowledgement failed', { leadId: args.leadId, error }));
  }

  if (answers.phone && args.tenantId) {
    await args
      .whatsAppQueue({
        tenantId: args.tenantId,
        templateId: 'lead-acknowledgement',
        toPhone: answers.phone,
        input: {
          leadName: answers.fullName,
          tenantName: args.tenantName,
          leadReference:
            typeof estimateData?.reference === 'string' ? estimateData.reference : args.leadId,
        },
        scheduledFor,
        linked: { entityType: 'lead_acknowledgement', entityId: args.leadId },
      })
      .then((result) => {
        if (!result.ok) {
          console.error('lead whatsapp acknowledgement skipped', {
            leadId: args.leadId,
            reason: result.reason,
          });
        }
      })
      .catch((error) => console.error('lead whatsapp acknowledgement failed', { leadId: args.leadId, error }));
  }
}
