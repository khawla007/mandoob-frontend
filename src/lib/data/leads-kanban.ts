import 'server-only';
import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/errors';
import {
  scoreLead,
  scoreTemperatureFromScore,
  type LeadScoreFactor,
  type LeadTemperature,
} from '@/lib/leads/scoring';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadKanbanDeps = {
  supabase?: SupabaseClient;
};

export type LeadKanbanFilters = {
  assigned?: 'all' | 'unassigned' | string;
  stage?: LeadStage | 'all';
  jurisdiction?: string | null;
  q?: string | null;
};

export type LeadCardRow = {
  id: string;
  tenantId: string | null;
  assignedTenantName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  jurisdiction: string | null;
  authority: string | null;
  visaCount: number;
  addOns: string[];
  score: number;
  scoreTemperature: LeadTemperature;
  scoreFactors: LeadScoreFactor[];
  rowVersion: number;
  createdAt: string;
};

export type LeadEventRow = {
  id: string;
  eventType: 'lead_assigned' | 'lead_stage_changed' | 'lead_note_added' | 'inbound_reply';
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  actorId: string | null;
  createdAt: string;
};

export type LeadDetail = LeadCardRow & {
  formData: Record<string, unknown>;
  estimateData: Record<string, unknown>;
  events: LeadEventRow[];
};

export type LeadKanban = Record<LeadStage, LeadCardRow[]>;

type LeadDbRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  form_data: Record<string, unknown>;
  estimate_data: Record<string, unknown>;
  routing_reason: string;
  score: number;
  row_version: number;
  created_at: string;
  tenants?: { name?: string | null } | null;
};

const LEAD_COLUMNS =
  'id, tenant_id, name, email, phone, stage, form_data, estimate_data, routing_reason, score, row_version, created_at, tenants(name)';

function client(deps: LeadKanbanDeps = {}) {
  return deps.supabase ?? createSupabaseServiceRoleClient();
}

export function isLeadStage(value: string): value is LeadStage {
  return (LEAD_STAGES as readonly string[]).includes(value);
}

function emptyKanban(): LeadKanban {
  return { new: [], contacted: [], qualified: [], won: [], lost: [] };
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toLeadCard(row: LeadDbRow): LeadCardRow {
  const form = row.form_data ?? {};
  const investorVisaCount = numberValue(form.investorVisaCount);
  const employeeVisaCount = numberValue(form.employeeVisaCount);
  const familyVisaCount = numberValue(form.familyVisaCount);
  const addOns = Array.isArray(form.addOns)
    ? form.addOns.filter((v): v is string => typeof v === 'string')
    : [];
  const tenants = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  const scoreContext = scoreLead({ answers: form, estimateData: row.estimate_data ?? {} });

  return {
    id: row.id,
    tenantId: row.tenant_id,
    assignedTenantName: tenants?.name ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    stage: isLeadStage(row.stage) ? row.stage : 'new',
    jurisdiction: textValue(form.jurisdiction),
    authority: textValue(form.authority),
    visaCount: investorVisaCount + employeeVisaCount + familyVisaCount,
    addOns,
    score: row.score,
    scoreTemperature: scoreTemperatureFromScore(row.score),
    scoreFactors: scoreContext.factors,
    rowVersion: row.row_version,
    createdAt: row.created_at,
  };
}

function groupRows(rows: LeadDbRow[]): LeadKanban {
  const kanban = emptyKanban();
  rows.map(toLeadCard).forEach((row) => kanban[row.stage].push(row));
  return kanban;
}

export async function listPlatformLeadKanban(
  filters: LeadKanbanFilters = {},
  deps: LeadKanbanDeps = {},
): Promise<LeadKanban> {
  const admin = client(deps);
  let query = admin
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('source', 'questionnaire')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(250);

  if (filters.stage && filters.stage !== 'all') query = query.eq('stage', filters.stage);
  if (filters.assigned === 'unassigned') query = query.eq('tenant_id', null);
  if (filters.assigned && !['all', 'unassigned'].includes(filters.assigned)) {
    query = query.eq('tenant_id', filters.assigned);
  }
  if (filters.jurisdiction) query = query.eq('form_data->>jurisdiction', filters.jurisdiction);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return groupRows((data as LeadDbRow[] | null) ?? []);
}

export async function listTenantLeadKanban(
  tenantId: string,
  deps: LeadKanbanDeps = {},
): Promise<LeadKanban> {
  const { data, error } = await client(deps)
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(250);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return groupRows((data as LeadDbRow[] | null) ?? []);
}

export async function getLeadDetail(
  leadId: string,
  scope: { kind: 'platform' } | { kind: 'tenant'; tenantId: string },
  deps: LeadKanbanDeps = {},
): Promise<LeadDetail | null> {
  const admin = client(deps);
  let leadQuery = admin.from('leads').select(LEAD_COLUMNS).eq('id', leadId);
  if (scope.kind === 'tenant') leadQuery = leadQuery.eq('tenant_id', scope.tenantId);
  const { data: lead, error } = await leadQuery.maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!lead) return null;

  const { data: events, error: eventsError } = await admin
    .from('lead_events')
    .select('id, event_type, from_value, to_value, note, metadata, actor_id, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (eventsError) throw new ApiError('INTERNAL', eventsError.message, 500);

  return {
    ...toLeadCard(lead as LeadDbRow),
    formData: ((lead as LeadDbRow).form_data ?? {}) as Record<string, unknown>,
    estimateData: ((lead as LeadDbRow).estimate_data ?? {}) as Record<string, unknown>,
    events: ((events as Record<string, unknown>[] | null) ?? []).map((row) => ({
      id: row.id as string,
      eventType: row.event_type as LeadEventRow['eventType'],
      fromValue: (row.from_value as string | null) ?? null,
      toValue: (row.to_value as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      actorId: (row.actor_id as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
  };
}

export async function listActiveLeadAssigneeTenants(deps: LeadKanbanDeps = {}) {
  const { data, error } = await client(deps)
    .from('tenants')
    .select('id, name, slug, status')
    .eq('status', 'active')
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return (data as Array<{ id: string; name: string; slug: string; status: string }> | null) ?? [];
}

export type LeadMutationAction = 'assign' | 'stage' | 'note';

export type LeadMutationInput = {
  leadId: string;
  operationId: string;
  expectedVersion: number;
  action: LeadMutationAction;
  value: string;
};

type LeadRpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type LeadMutationDeps = {
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<LeadRpcResult>;
};

// Every Admin lead write goes through the atomic, replay-safe, AAL2-gated
// `mutate_platform_lead` RPC. It runs under the caller's JWT (never service-role) so the
// function's own `auth.uid()`/role/AAL2 checks and the lead_events audit stay in one
// transaction. Operation ID + expected row_version give idempotency and stale-write conflict.
export async function mutatePlatformLead(
  input: LeadMutationInput,
  deps: LeadMutationDeps = {},
): Promise<{ leadId: string; version: number }> {
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        action: input.action,
        value: input.value,
        expectedVersion: input.expectedVersion,
      }),
    )
    .digest('hex');
  const run =
    deps.rpc ??
    (async (fn: string, args: Record<string, unknown>) => {
      const supabase = await createSupabaseServerClient();
      return (await supabase.rpc(fn as never, args as never)) as LeadRpcResult;
    });
  const { data, error } = await run('mutate_platform_lead', {
    p_lead_id: input.leadId,
    p_operation_id: input.operationId,
    p_request_hash: requestHash,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_value: input.value,
  });
  if (error || !data) throw mapLeadRpcError(error);
  return data as { leadId: string; version: number };
}

function mapLeadRpcError(error: { code?: string; message?: string } | null): ApiError {
  const message = error?.message ?? '';
  if (error?.code === '40001' || message.includes('STALE_LEAD_VERSION')) {
    return new ApiError(
      'VERSION_CONFLICT',
      'This lead was updated elsewhere. Reload and try again.',
      409,
    );
  }
  if (error?.code === '42501' || message.includes('FORBIDDEN')) {
    return new ApiError('FORBIDDEN', 'You are not allowed to modify this lead', 403);
  }
  if (error?.code === 'P0002' || message.includes('LEAD_NOT_FOUND')) {
    return new ApiError('NOT_FOUND', 'Lead not found', 404);
  }
  if (error?.code === '23505' || message.includes('OPERATION_REUSED')) {
    return new ApiError('OPERATION_CONFLICT', 'This action was already submitted', 409);
  }
  if (message.includes('INVALID_ASSIGNEE')) {
    return new ApiError('INVALID_TENANT', 'Lead can only be assigned to an active tenant', 400);
  }
  return new ApiError('INTERNAL', 'Could not update lead', 500);
}
