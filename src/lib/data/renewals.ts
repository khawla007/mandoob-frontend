import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { scheduleRenewalReminders } from '@/lib/data/renewal-reminders';
import {
  createRenewalSchema,
  updateRenewalSchema,
  type CreateRenewalInput,
  type UpdateRenewalInput,
} from '@/lib/validation/renewal';

export type RenewalType = 'license' | 'visa' | 'eid' | 'ejari';
export type RenewalStatus = 'upcoming' | 'due_soon' | 'overdue' | 'completed' | 'cancelled';
export type RenewalSource = 'license_backfill' | 'manual';

export type RenewalRow = {
  id: string;
  tenantId: string;
  clientId: string;
  type: RenewalType;
  label: string;
  dueDate: string;
  daysOut: number;
  status: RenewalStatus;
  source: RenewalSource;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RenewalDbRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  type: RenewalType;
  label: string;
  due_date: string;
  status: RenewalStatus;
  source: RenewalSource;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const RENEWAL_COLUMNS =
  'id, tenant_id, client_id, type, label, due_date, status, source, completed_at, created_at, updated_at';

const ACTIVE_STATUSES: RenewalStatus[] = ['upcoming', 'due_soon', 'overdue'];

function computeDaysOut(dueDate: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00Z`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function toRenewalRow(r: RenewalDbRow): RenewalRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    clientId: r.client_id,
    type: r.type,
    label: r.label,
    dueDate: r.due_date,
    daysOut: computeDaysOut(r.due_date),
    status: r.status,
    source: r.source,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type RenewalAuditAction = 'created' | 'updated' | 'completed' | 'cancelled';

export type RenewalActorCtx = {
  tenantId: string;
  actorId: string;
  role: 'pro';
};

async function logRenewalAudit(
  tenantId: string,
  actorId: string,
  action: RenewalAuditAction,
  details: Record<string, unknown>,
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action,
    source: 'self_serve',
    details: { entity: 'renewal', ...details },
  });
  if (error) console.error('tenant_audit_log insert failed', error);
}

function assertPro(role: string): asserts role is 'pro' {
  if (role !== 'pro') {
    throw new ApiError('FORBIDDEN', 'only pro can mutate renewals', 403);
  }
}

export type ListRenewalsForTenantOpts = {
  status?: RenewalStatus[];
  bucket?: 30 | 60 | 90 | 'all';
};

export async function listRenewalsForTenant(
  tenantId: string,
  opts: ListRenewalsForTenantOpts = {},
): Promise<RenewalRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('renewals')
    .select(RENEWAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('due_date', { ascending: true });

  if (opts.status && opts.status.length > 0) {
    query = query.in('status', opts.status);
  }
  if (opts.bucket && opts.bucket !== 'all') {
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() + opts.bucket);
    query = query.lte('due_date', cutoff.toISOString().slice(0, 10));
  }

  const { data, error } = await query;
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as RenewalDbRow[] | null) ?? []).map(toRenewalRow);
}

export type ListRenewalsForClientOpts = { includeCancelled?: boolean };

export async function listRenewalsForClient(
  tenantId: string,
  clientId: string,
  opts: ListRenewalsForClientOpts = {},
): Promise<RenewalRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('renewals')
    .select(RENEWAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .order('due_date', { ascending: true });

  if (!opts.includeCancelled) {
    query = query.neq('status', 'cancelled');
  }

  const { data, error } = await query;
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as RenewalDbRow[] | null) ?? []).map(toRenewalRow);
}

export async function countRenewalsDueWithin(tenantId: string, days = 30): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() + days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { count, error } = await admin
    .from('renewals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .lte('due_date', cutoffDate)
    .in('status', ACTIVE_STATUSES);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return count ?? 0;
}

export async function createRenewal(
  ctx: RenewalActorCtx,
  input: CreateRenewalInput,
): Promise<{ id: string }> {
  assertPro(ctx.role);
  createRenewalSchema.parse(input);

  const admin = createSupabaseServiceRoleClient();

  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .select('id, tenant_id')
    .eq('id', input.client_id)
    .maybeSingle();
  if (clientErr) throw new ApiError('INTERNAL', clientErr.message, 500);
  if (!clientRow) throw new ApiError('NOT_FOUND', 'client not found', 404);
  if (clientRow.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'client belongs to a different tenant', 403);
  }

  const { data: notifyRow, error: notifyErr } = await admin.rpc('compute_notify_at', {
    due: input.due_date,
    renewal_type: input.type,
  });
  if (notifyErr) throw new ApiError('INTERNAL', notifyErr.message, 500);
  const notifyAt = (notifyRow as string[] | null) ?? [];

  const initialStatus = computeStatusFromDays(computeDaysOut(input.due_date));

  const { data: row, error: insertErr } = await admin
    .from('renewals')
    .insert({
      tenant_id: ctx.tenantId,
      client_id: input.client_id,
      type: input.type,
      label: input.label,
      due_date: input.due_date,
      notify_at: notifyAt,
      source: 'manual',
      status: initialStatus,
    })
    .select('id')
    .single();
  if (insertErr || !row) {
    if (insertErr?.code === '23505') {
      throw new ApiError('RENEWAL_DUPLICATE', insertErr.message, 409);
    }
    throw new ApiError('INTERNAL', insertErr?.message ?? 'renewal insert failed', 500);
  }
  const id = row.id as string;

  await logRenewalAudit(ctx.tenantId, ctx.actorId, 'created', {
    op: 'create',
    renewal_id: id,
    client_id: input.client_id,
    type: input.type,
    due_date: input.due_date,
    source: 'manual',
  });

  await scheduleRenewalReminders(id).catch((err) =>
    console.error('scheduleRenewalReminders failed', err),
  );

  return { id };
}

function computeStatusFromDays(daysOut: number): RenewalStatus {
  if (daysOut < 0) return 'overdue';
  if (daysOut <= 30) return 'due_soon';
  return 'upcoming';
}

export async function updateRenewal(
  id: string,
  ctx: RenewalActorCtx,
  patch: UpdateRenewalInput,
): Promise<void> {
  assertPro(ctx.role);
  updateRenewalSchema.parse(patch);

  const admin = createSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await admin
    .from('renewals')
    .select('id, tenant_id, source, status, due_date, type')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
  if (existing.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.due_date !== undefined) {
    update.due_date = patch.due_date;
    const { data: notifyRow, error: notifyErr } = await admin.rpc('compute_notify_at', {
      due: patch.due_date,
      renewal_type: existing.type,
    });
    if (notifyErr) throw new ApiError('INTERNAL', notifyErr.message, 500);
    update.notify_at = (notifyRow as string[] | null) ?? [];
  }

  const { error: updErr } = await admin.from('renewals').update(update).eq('id', id);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  await logRenewalAudit(ctx.tenantId, ctx.actorId, 'updated', {
    op: 'update',
    renewal_id: id,
    fields: Object.keys(patch),
    source: existing.source,
  });

  if (patch.due_date !== undefined || patch.status !== undefined) {
    await scheduleRenewalReminders(id).catch((err) =>
      console.error('scheduleRenewalReminders failed', err),
    );
  }
}

export async function markRenewalCompleted(id: string, ctx: RenewalActorCtx): Promise<void> {
  assertPro(ctx.role);
  const admin = createSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await admin
    .from('renewals')
    .select('id, tenant_id, source')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
  if (existing.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
  }

  const completedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from('renewals')
    .update({ status: 'completed', completed_at: completedAt, updated_at: completedAt })
    .eq('id', id);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  await logRenewalAudit(ctx.tenantId, ctx.actorId, 'completed', {
    op: 'complete',
    renewal_id: id,
    source: existing.source,
  });
}

export async function cancelRenewal(id: string, ctx: RenewalActorCtx): Promise<void> {
  assertPro(ctx.role);
  const admin = createSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await admin
    .from('renewals')
    .select('id, tenant_id, source')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
  if (existing.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
  }

  const { error: updErr } = await admin
    .from('renewals')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  await logRenewalAudit(ctx.tenantId, ctx.actorId, 'cancelled', {
    op: 'cancel',
    renewal_id: id,
    source: existing.source,
  });
}
