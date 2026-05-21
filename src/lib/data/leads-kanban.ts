import 'server-only';
import { ApiError } from '@/lib/errors';
import {
  scoreLead,
  scoreTemperatureFromScore,
  type LeadScoreFactor,
  type LeadTemperature,
} from '@/lib/leads/scoring';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadActorRole = 'super_admin' | 'admin' | 'pro';

export type LeadActor = {
  id: string;
  role: LeadActorRole;
  tenantId: string | null;
};

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
  created_at: string;
  tenants?: { name?: string | null } | null;
};

const LEAD_COLUMNS =
  'id, tenant_id, name, email, phone, stage, form_data, estimate_data, routing_reason, score, created_at, tenants(name)';

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

export async function assignLeadToTenant(
  leadId: string,
  tenantId: string,
  actorId: string,
  deps: LeadKanbanDeps = {},
): Promise<void> {
  const admin = client(deps);
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id, status')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError) throw new ApiError('INTERNAL', tenantError.message, 500);
  if (!tenant || tenant.status !== 'active') {
    throw new ApiError('INVALID_TENANT', 'Lead can only be assigned to an active tenant', 400);
  }

  const lead = await readLeadForMutation(admin, leadId);
  await updateLead(admin, leadId, {
    tenant_id: tenantId,
    routing_reason: 'assigned_by_platform',
  });
  await recordLeadEvent(admin, {
    leadId,
    tenantId,
    actorId,
    eventType: 'lead_assigned',
    fromValue: lead.tenant_id,
    toValue: tenantId,
  });
}

export async function setLeadStage(
  leadId: string,
  nextStage: LeadStage,
  actor: LeadActor,
  deps: LeadKanbanDeps = {},
): Promise<void> {
  if (!isLeadStage(nextStage)) throw new ApiError('INVALID_STAGE', 'Invalid lead stage', 400);
  const admin = client(deps);
  const lead = await readLeadForMutation(admin, leadId);
  authorizeLeadMutation(lead, actor);
  if (lead.stage === nextStage) return;

  await updateLead(admin, leadId, { stage: nextStage });
  await recordLeadEvent(admin, {
    leadId,
    tenantId: lead.tenant_id,
    actorId: actor.id,
    eventType: 'lead_stage_changed',
    fromValue: lead.stage,
    toValue: nextStage,
  });
}

export async function addLeadNote(
  leadId: string,
  note: string,
  actor: LeadActor,
  deps: LeadKanbanDeps = {},
): Promise<void> {
  const trimmed = note.trim();
  if (!trimmed) throw new ApiError('INVALID_NOTE', 'Lead note is required', 400);
  if (trimmed.length > 2000) throw new ApiError('INVALID_NOTE', 'Lead note is too long', 400);

  const admin = client(deps);
  const lead = await readLeadForMutation(admin, leadId);
  authorizeLeadMutation(lead, actor);
  await recordLeadEvent(admin, {
    leadId,
    tenantId: lead.tenant_id,
    actorId: actor.id,
    eventType: 'lead_note_added',
    note: trimmed,
  });
}

async function readLeadForMutation(admin: SupabaseClient, leadId: string): Promise<LeadDbRow> {
  const { data, error } = await admin
    .from('leads')
    .select(
      'id, tenant_id, name, email, phone, stage, form_data, estimate_data, routing_reason, score, created_at',
    )
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Lead not found', 404);
  return data as LeadDbRow;
}

function authorizeLeadMutation(lead: LeadDbRow, actor: LeadActor): void {
  if (actor.role === 'super_admin' || actor.role === 'admin') return;
  if (!actor.tenantId || lead.tenant_id !== actor.tenantId) {
    throw new ApiError('FORBIDDEN', 'Lead belongs to a different tenant', 403);
  }
}

async function updateLead(
  admin: SupabaseClient,
  leadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('leads').update(patch).eq('id', leadId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
}

async function recordLeadEvent(
  admin: SupabaseClient,
  args: {
    leadId: string;
    tenantId: string | null;
    actorId: string;
    eventType: LeadEventRow['eventType'];
    fromValue?: string | null;
    toValue?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const payload = {
    lead_id: args.leadId,
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    event_type: args.eventType,
    from_value: args.fromValue ?? null,
    to_value: args.toValue ?? null,
    note: args.note ?? null,
  };
  const { error } = await admin.from('lead_events').insert(payload);
  if (error) throw new ApiError('INTERNAL', error.message, 500);

  if (!args.tenantId) return;
  const { error: auditError } = await admin.from('tenant_audit_log').insert({
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    action: args.eventType,
    source: args.eventType === 'lead_assigned' ? 'admin' : 'self_serve',
    details: {
      entity: 'lead',
      lead_id: args.leadId,
      from: args.fromValue ?? null,
      to: args.toValue ?? null,
    },
  });
  if (auditError) throw new ApiError('INTERNAL', auditError.message, 500);
}
