import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { scheduleRenewalReminders } from '@/lib/data/renewal-reminders';
import { addSignalDays, signalBusinessDate, signalDaysBetween } from '@/lib/data/signal-finance';
import { loadAllRangePages } from '@/lib/data/range-pagination';
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
  companyId: string;
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
  company_id: string;
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
  'id, tenant_id, company_id, type, label, due_date, status, source, completed_at, created_at, updated_at';

const ACTIVE_STATUSES: RenewalStatus[] = ['upcoming', 'due_soon', 'overdue'];

function toRenewalRow(r: RenewalDbRow, today = signalBusinessDate()): RenewalRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    type: r.type,
    label: r.label,
    dueDate: r.due_date,
    daysOut: signalDaysBetween(today, r.due_date),
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
  companyId: string;
  actorId: string;
  role: 'pro' | 'admin' | 'super_admin';
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
  id?: string;
  status?: RenewalStatus[];
  bucket?: 7 | 30 | 60 | 90 | 'all';
  type?: RenewalType;
  deadlineDate?: string;
  deadlinePeriod?: 'morning' | 'afternoon';
  today?: string;
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

  if (opts.id) {
    query = query.eq('id', opts.id);
  } else if (opts.status && opts.status.length > 0) {
    query = query.in('status', opts.status);
  }
  if (!opts.id && opts.bucket && opts.bucket !== 'all') {
    query = query.lte('due_date', addSignalDays(opts.today ?? signalBusinessDate(), opts.bucket));
  }
  if (!opts.id && opts.type) query = query.eq('type', opts.type);
  if (!opts.id && opts.deadlineDate) {
    query =
      opts.deadlinePeriod === 'afternoon'
        ? query.eq('due_date', opts.deadlineDate)
        : query.eq('due_date', '__date_only_deadlines_are_afternoon__');
  }

  const { data, error } = await query;
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  const today = opts.today ?? signalBusinessDate();
  return ((data as RenewalDbRow[] | null) ?? []).map((row) => toRenewalRow(row, today));
}

export type ListRenewalsForCompanyOpts = ListRenewalsForTenantOpts & {
  includeCancelled?: boolean;
};

export async function listRenewalsForCompany(
  tenantId: string,
  companyId: string,
  opts: ListRenewalsForCompanyOpts = {},
): Promise<RenewalRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('renewals')
    .select(RENEWAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true });

  if (opts.id) {
    query = query.eq('id', opts.id);
  } else if (opts.status && opts.status.length > 0) {
    query = query.in('status', opts.status);
  } else if (!opts.includeCancelled) {
    query = query.neq('status', 'cancelled');
  }
  if (!opts.id && opts.bucket && opts.bucket !== 'all') {
    query = query.lte('due_date', addSignalDays(opts.today ?? signalBusinessDate(), opts.bucket));
  }
  if (!opts.id && opts.type) query = query.eq('type', opts.type);
  if (!opts.id && opts.deadlineDate) {
    query =
      opts.deadlinePeriod === 'afternoon'
        ? query.eq('due_date', opts.deadlineDate)
        : query.eq('due_date', '__date_only_deadlines_are_afternoon__');
  }

  const data = await loadAllRangePages<RenewalDbRow>('company renewals', (from, to) =>
    query.range(from, to),
  );
  const today = signalBusinessDate();
  return data.map((row) => toRenewalRow(row, today));
}

export async function countRenewalsDueWithin(tenantId: string, days = 30): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const cutoffDate = addSignalDays(signalBusinessDate(), days);

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
  if (input.company_id !== ctx.companyId) {
    throw new ApiError('FORBIDDEN', 'company is outside the assigned workspace', 403);
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: companyRow, error: companyErr } = await admin
    .from('company_profiles')
    .select('id, tenant_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', input.company_id)
    .maybeSingle();
  if (companyErr) throw new ApiError('INTERNAL', companyErr.message, 500);
  if (!companyRow) throw new ApiError('NOT_FOUND', 'company not found', 404);
  if (companyRow.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'company belongs to a different tenant', 403);
  }

  const { data: notifyRow, error: notifyErr } = await admin.rpc('compute_notify_at', {
    due: input.due_date,
    renewal_type: input.type,
  });
  if (notifyErr) throw new ApiError('INTERNAL', notifyErr.message, 500);
  const notifyAt = (notifyRow as string[] | null) ?? [];

  const initialStatus = computeStatusFromDays(
    signalDaysBetween(signalBusinessDate(), input.due_date),
  );

  const { data: row, error: insertErr } = await admin
    .from('renewals')
    .insert({
      tenant_id: ctx.tenantId,
      company_id: input.company_id,
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
    company_id: input.company_id,
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
    .select('id, tenant_id, company_id, source, status, due_date, type')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
  if (existing.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
  }
  if (existing.company_id !== ctx.companyId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different company', 403);
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

  const { error: updErr } = await admin
    .from('renewals')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .eq('company_id', ctx.companyId);
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
    .select('id, tenant_id, company_id, source')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
  if (existing.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
  }
  if (existing.company_id !== ctx.companyId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different company', 403);
  }

  const completedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from('renewals')
    .update({ status: 'completed', completed_at: completedAt, updated_at: completedAt })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .eq('company_id', ctx.companyId);
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
    .select('id, tenant_id, company_id, source')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
  if (existing.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
  }
  if (existing.company_id !== ctx.companyId) {
    throw new ApiError('FORBIDDEN', 'renewal belongs to a different company', 403);
  }

  const { error: updErr } = await admin
    .from('renewals')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .eq('company_id', ctx.companyId);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  await logRenewalAudit(ctx.tenantId, ctx.actorId, 'cancelled', {
    op: 'cancel',
    renewal_id: id,
    source: existing.source,
  });
}
