import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  listWhatsAppTemplateDefinitions,
  type WhatsAppTemplateCategory,
  type WhatsAppTemplateId,
  type WhatsAppTemplateRegistryDefinition,
} from '@/lib/whatsapp/templates';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type RegistryDefinition = WhatsAppTemplateRegistryDefinition;

export const WHATSAPP_TEMPLATE_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'disabled',
] as const;
export type WhatsAppTemplateApprovalStatus =
  (typeof WHATSAPP_TEMPLATE_APPROVAL_STATUSES)[number];
export type WhatsAppTemplateApprovalViewStatus = WhatsAppTemplateApprovalStatus | 'missing';

export const WHATSAPP_TEMPLATE_CATEGORIES = [
  'marketing',
  'utility',
  'authentication',
] as const satisfies readonly WhatsAppTemplateCategory[];

export type WhatsAppTemplateApprovalActorRole = 'super_admin' | 'admin' | 'pro' | 'customer';
export type WhatsAppTemplateApprovalActor = {
  id: string;
  role: WhatsAppTemplateApprovalActorRole;
};

export type WhatsAppTemplateApprovalFilters = {
  tenantId?: string | null;
  status?: WhatsAppTemplateApprovalViewStatus | 'all';
  category?: WhatsAppTemplateCategory | 'all';
};

export type WhatsAppTemplateApprovalDeps = {
  supabase?: SupabaseClient;
};

export type WhatsAppTemplateApprovalInput = {
  templateId: WhatsAppTemplateId;
  tenantId?: string | null;
  status: WhatsAppTemplateApprovalStatus;
  notes?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  lastCheckedAt?: string | null;
};

export type WhatsAppTemplateApprovalRow = {
  id: string;
  tenantId: string | null;
  templateId: WhatsAppTemplateId;
  metaTemplateName: string;
  language: string;
  category: WhatsAppTemplateCategory;
  status: WhatsAppTemplateApprovalStatus;
  notes: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  lastCheckedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppTemplateApprovalViewRow = Omit<WhatsAppTemplateApprovalRow, 'status'> & {
  scope: 'global' | 'tenant' | 'missing';
  status: WhatsAppTemplateApprovalViewStatus;
};

type DbApprovalRow = {
  id: string;
  tenant_id: string | null;
  template_id: string;
  meta_template_name: string;
  language: string;
  category: string;
  status: string;
  notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  last_checked_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

const APPROVAL_COLUMNS =
  'id, tenant_id, template_id, meta_template_name, language, category, status, notes, rejection_reason, submitted_at, last_checked_at, created_by, updated_by, created_at, updated_at';

function client(deps: WhatsAppTemplateApprovalDeps = {}) {
  return deps.supabase ?? createSupabaseServiceRoleClient();
}

function assertPlatformAdmin(actor: WhatsAppTemplateApprovalActor) {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    throw new ApiError(
      'FORBIDDEN',
      'Only platform admins can update WhatsApp template approvals',
      403,
    );
  }
}

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function registryById() {
  return new Map(listWhatsAppTemplateDefinitions().map((def) => [def.id, def]));
}

function getDefinition(templateId: WhatsAppTemplateId): RegistryDefinition {
  const def = registryById().get(templateId);
  if (!def) throw new ApiError('INVALID_TEMPLATE', 'Unknown WhatsApp template', 400);
  return def;
}

function isApprovalStatus(value: string): value is WhatsAppTemplateApprovalStatus {
  return (WHATSAPP_TEMPLATE_APPROVAL_STATUSES as readonly string[]).includes(value);
}

function isCategory(value: string): value is WhatsAppTemplateCategory {
  return (WHATSAPP_TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

function toApprovalRow(row: DbApprovalRow): WhatsAppTemplateApprovalRow {
  if (!isApprovalStatus(row.status)) {
    throw new ApiError('INTERNAL', `Invalid WhatsApp template status: ${row.status}`, 500);
  }
  if (!isCategory(row.category)) {
    throw new ApiError('INTERNAL', `Invalid WhatsApp template category: ${row.category}`, 500);
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id as WhatsAppTemplateId,
    metaTemplateName: row.meta_template_name,
    language: row.language,
    category: row.category,
    status: row.status,
    notes: row.notes,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
    lastCheckedAt: row.last_checked_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function missingRow(def: RegistryDefinition): WhatsAppTemplateApprovalViewRow {
  return {
    id: '',
    tenantId: null,
    templateId: def.id,
    metaTemplateName: def.metaTemplateName,
    language: def.language,
    category: def.category,
    status: 'missing',
    scope: 'missing',
    notes: null,
    rejectionReason: null,
    submittedAt: null,
    lastCheckedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '',
    updatedAt: '',
  };
}

function viewRowFromDb(row: DbApprovalRow): WhatsAppTemplateApprovalViewRow {
  const mapped = toApprovalRow(row);
  return {
    ...mapped,
    scope: mapped.tenantId ? 'tenant' : 'global',
  };
}

async function listGlobalRows(admin: SupabaseClient): Promise<DbApprovalRow[]> {
  const { data, error } = await admin
    .from('whatsapp_template_approvals')
    .select(APPROVAL_COLUMNS)
    .is('tenant_id', null)
    .order('template_id', { ascending: true });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return (data as DbApprovalRow[] | null) ?? [];
}

async function listTenantRows(admin: SupabaseClient, tenantId: string): Promise<DbApprovalRow[]> {
  const { data, error } = await admin
    .from('whatsapp_template_approvals')
    .select(APPROVAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('template_id', { ascending: true });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return (data as DbApprovalRow[] | null) ?? [];
}

function rowKey(templateId: string, language: string) {
  return `${templateId}:${language}`;
}

export async function listWhatsAppTemplateApprovals(
  filters: WhatsAppTemplateApprovalFilters = {},
  deps: WhatsAppTemplateApprovalDeps = {},
): Promise<WhatsAppTemplateApprovalViewRow[]> {
  const admin = client(deps);
  const definitions = listWhatsAppTemplateDefinitions();
  const globalRows = await listGlobalRows(admin);
  const tenantRows = filters.tenantId ? await listTenantRows(admin, filters.tenantId) : [];
  const byKey = new Map<string, DbApprovalRow>();

  for (const row of globalRows) byKey.set(rowKey(row.template_id, row.language), row);
  for (const row of tenantRows) byKey.set(rowKey(row.template_id, row.language), row);

  return definitions
    .map((def) => {
      const dbRow = byKey.get(rowKey(def.id, def.language));
      return dbRow ? viewRowFromDb(dbRow) : missingRow(def);
    })
    .filter((row) => !filters.category || filters.category === 'all' || row.category === filters.category)
    .filter((row) => !filters.status || filters.status === 'all' || row.status === filters.status);
}

export async function getWhatsAppTemplateApproval(
  templateId: WhatsAppTemplateId,
  tenantId: string | null,
  deps: WhatsAppTemplateApprovalDeps = {},
): Promise<WhatsAppTemplateApprovalRow | null> {
  const admin = client(deps);
  const def = getDefinition(templateId);

  if (tenantId) {
    const { data, error } = await admin
      .from('whatsapp_template_approvals')
      .select(APPROVAL_COLUMNS)
      .eq('template_id', templateId)
      .eq('language', def.language)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', error.message, 500);
    if (data) return toApprovalRow(data as DbApprovalRow);
  }

  const { data, error } = await admin
    .from('whatsapp_template_approvals')
    .select(APPROVAL_COLUMNS)
    .eq('template_id', templateId)
    .eq('language', def.language)
    .is('tenant_id', null)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return data ? toApprovalRow(data as DbApprovalRow) : null;
}

async function getExactWhatsAppTemplateApproval(
  templateId: WhatsAppTemplateId,
  tenantId: string | null,
  deps: WhatsAppTemplateApprovalDeps = {},
): Promise<WhatsAppTemplateApprovalRow | null> {
  const admin = client(deps);
  const def = getDefinition(templateId);
  let query = admin
    .from('whatsapp_template_approvals')
    .select(APPROVAL_COLUMNS)
    .eq('template_id', templateId)
    .eq('language', def.language);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return data ? toApprovalRow(data as DbApprovalRow) : null;
}

export async function isWhatsAppTemplateApproved(
  templateId: WhatsAppTemplateId,
  tenantId: string | null,
  deps: WhatsAppTemplateApprovalDeps = {},
): Promise<boolean> {
  const row = await getWhatsAppTemplateApproval(templateId, tenantId, deps);
  return row?.status === 'approved';
}

export async function updateWhatsAppTemplateApproval(
  input: WhatsAppTemplateApprovalInput,
  actor: WhatsAppTemplateApprovalActor,
  deps: WhatsAppTemplateApprovalDeps = {},
): Promise<WhatsAppTemplateApprovalRow> {
  assertPlatformAdmin(actor);
  const admin = client(deps);
  const def = getDefinition(input.templateId);
  const tenantId = cleanOptional(input.tenantId ?? null);
  const payload = {
    tenant_id: tenantId,
    template_id: def.id,
    meta_template_name: def.metaTemplateName,
    language: def.language,
    category: def.category,
    status: input.status,
    notes: cleanOptional(input.notes),
    rejection_reason: cleanOptional(input.rejectionReason),
    submitted_at: cleanOptional(input.submittedAt),
    last_checked_at: cleanOptional(input.lastCheckedAt),
    created_by: actor.id,
    updated_by: actor.id,
  };

  const existing = await getExactWhatsAppTemplateApproval(input.templateId, tenantId, deps);
  const write = existing
    ? admin
        .from('whatsapp_template_approvals')
        .update({
          ...payload,
          created_by: existing.createdBy,
        })
        .eq('id', existing.id)
        .select(APPROVAL_COLUMNS)
        .single()
    : admin.from('whatsapp_template_approvals').insert(payload).select(APPROVAL_COLUMNS).single();
  const { data, error } = await write;
  if (error) throw new ApiError('INTERNAL', error.message, 500);

  if (tenantId) {
    const { error: auditError } = await admin.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      actor_id: actor.id,
      action: 'whatsapp_template_status_updated',
      source: 'admin',
      details: {
        template_id: def.id,
        meta_template_name: def.metaTemplateName,
        language: def.language,
        category: def.category,
        status: input.status,
      },
    });
    if (auditError) throw new ApiError('INTERNAL', auditError.message, 500);
  }

  return toApprovalRow(data as DbApprovalRow);
}
