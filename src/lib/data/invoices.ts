import 'server-only';
import { enqueueEmail } from '@/lib/mail/send';
import { formatMoney } from '@/lib/format/money';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type LinkedEntity = {
  type: 'renewal' | 'document_request' | 'manual';
  id: string;
};

export type CreateInvoiceArgs = {
  tenantId: string;
  clientId: string;
  customerProfileId?: string | null;
  linked?: LinkedEntity;
  label: string;
  amountMinor: bigint | number;
  currency?: string;
  dueAt?: Date | string | null;
  createdBy?: string | null;
};

export type CreateInvoiceResult =
  | { ok: true; data: { id: string; emailQueueId: number | null } }
  | { ok: false; error: string; code: string };

export async function createInvoice(args: CreateInvoiceArgs): Promise<CreateInvoiceResult> {
  if (typeof args.amountMinor === 'bigint' && args.amountMinor < BigInt(0)) {
    return { ok: false, error: 'amount cannot be negative', code: 'INVALID_AMOUNT' };
  }
  if (typeof args.amountMinor === 'number' && args.amountMinor < 0) {
    return { ok: false, error: 'amount cannot be negative', code: 'INVALID_AMOUNT' };
  }

  const admin = createSupabaseServiceRoleClient();
  const currency = (args.currency ?? 'AED').toUpperCase();

  const customerProfileId =
    args.customerProfileId ?? (await resolveCustomerProfileId(admin, args.clientId));

  const dueAtIso = normaliseDueAt(args.dueAt);
  const insertPayload = {
    tenant_id: args.tenantId,
    client_id: args.clientId,
    customer_profile_id: customerProfileId,
    linked_entity_type: args.linked?.type ?? 'manual',
    linked_entity_id: args.linked?.id ?? null,
    label: args.label,
    amount_minor: Number(args.amountMinor),
    currency,
    status: 'open' as const,
    due_at: dueAtIso,
    created_by: args.createdBy ?? null,
  };

  const { data: inserted, error } = await admin
    .from('invoices')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? 'insert failed', code: 'DB_INSERT_FAILED' };
  }

  await admin.from('tenant_audit_log').insert({
    tenant_id: args.tenantId,
    actor_id: args.createdBy ?? null,
    action: 'invoice_created',
    source: args.createdBy ? 'admin' : 'system',
    details: {
      entity: 'invoice',
      invoice_id: inserted.id,
      client_id: args.clientId,
      amount_minor: Number(args.amountMinor),
      currency,
      linked_entity_type: insertPayload.linked_entity_type,
      linked_entity_id: insertPayload.linked_entity_id,
    },
  });

  const emailQueueId = await fanOutInvoiceDueEmail({
    admin,
    invoiceId: inserted.id,
    tenantId: args.tenantId,
    clientId: args.clientId,
    customerProfileId,
    label: args.label,
    amountMinor: args.amountMinor,
    currency,
  });

  return { ok: true, data: { id: inserted.id, emailQueueId } };
}

type Admin = ReturnType<typeof createSupabaseServiceRoleClient>;

async function resolveCustomerProfileId(admin: Admin, clientId: string): Promise<string | null> {
  const { data } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_client_id', clientId)
    .maybeSingle();
  return data?.profile_id ?? null;
}

function normaliseDueAt(dueAt: Date | string | null | undefined): string | null {
  if (!dueAt) return null;
  if (dueAt instanceof Date) return dueAt.toISOString().slice(0, 10);
  return dueAt;
}

async function fanOutInvoiceDueEmail(opts: {
  admin: Admin;
  invoiceId: string;
  tenantId: string;
  clientId: string;
  customerProfileId: string | null;
  label: string;
  amountMinor: bigint | number;
  currency: string;
}): Promise<number | null> {
  if (!opts.customerProfileId) return null;

  const [{ data: tenant }, { data: profile }, { data: authUser }] = await Promise.all([
    opts.admin.from('tenants').select('name').eq('id', opts.tenantId).maybeSingle(),
    opts.admin.from('profiles').select('full_name').eq('id', opts.customerProfileId).maybeSingle(),
    opts.admin.auth.admin.getUserById(opts.customerProfileId),
  ]);

  const email = authUser?.user?.email;
  if (!email) return null;

  const result = await enqueueEmail({
    tenantId: opts.tenantId,
    templateId: 'invoice-due',
    toAddress: email,
    input: {
      customerName: profile?.full_name ?? 'there',
      tenantName: tenant?.name ?? '',
      amount: formatMoney(opts.amountMinor, opts.currency),
      invoiceUrl: invoiceUrl(opts.invoiceId),
    },
    linked: { entityType: 'invoice', entityId: opts.invoiceId },
  });

  return result.ok ? result.queueId : null;
}

function invoiceUrl(invoiceId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/portal/payments?invoice=${invoiceId}`;
}
