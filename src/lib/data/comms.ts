import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type CommChannel = 'email' | 'whatsapp' | 'sms' | 'in_app';
export type CommDirection = 'out' | 'in';

export type CommRow = {
  id: string;
  channel: CommChannel;
  direction: CommDirection;
  subject: string | null;
  preview: string;
  status: string;
  timestamp: string;
  recipient: string;
};

export type CommQueryOpts = {
  limit?: number;
  before?: string; // ISO timestamp — return rows older than this
};

const DEFAULT_LIMIT = 25;

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

async function resolveCustomerScope(
  admin: Supa,
  clientId: string,
): Promise<{ email: string | null; phone: string | null }> {
  const { data: link } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_client_id', clientId)
    .maybeSingle();
  if (!link) return { email: null, phone: null };

  const { data: authUser } = await admin.auth.admin.getUserById(link.profile_id);
  const email = authUser.user?.email ?? null;

  const { data: profile } = await admin
    .from('profiles')
    .select('phone')
    .eq('id', link.profile_id)
    .maybeSingle();

  return { email, phone: profile?.phone ?? null };
}

export async function getCommsForClient(
  tenantId: string,
  clientId: string,
  opts: CommQueryOpts = {},
): Promise<CommRow[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const admin = createSupabaseServiceRoleClient();
  const { email, phone } = await resolveCustomerScope(admin, clientId);

  // pull modestly more per source so the merged DESC slice is correct
  const fetchLimit = limit * 2;
  const beforeIso = opts.before ?? null;

  const [emails, was, smses, waInbox, smsInbox] = await Promise.all([
    fetchEmails(admin, tenantId, email, clientId, fetchLimit, beforeIso),
    fetchWhatsApp(admin, tenantId, phone, clientId, fetchLimit, beforeIso),
    fetchSms(admin, tenantId, phone, clientId, fetchLimit, beforeIso),
    fetchWhatsAppInbox(admin, tenantId, phone, fetchLimit, beforeIso),
    fetchSmsInbox(admin, tenantId, phone, fetchLimit, beforeIso),
  ]);

  return mergeAndSort([...emails, ...was, ...smses, ...waInbox, ...smsInbox], limit);
}

export async function getCommsForCustomer(
  profileId: string,
  opts: CommQueryOpts = {},
): Promise<CommRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data: link } = await admin
    .from('customer_profiles')
    .select('linked_client_id, profile_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!link?.linked_client_id) return [];

  const { data: client } = await admin
    .from('clients')
    .select('tenant_id')
    .eq('id', link.linked_client_id)
    .maybeSingle();
  if (!client) return [];

  return getCommsForClient(client.tenant_id, link.linked_client_id, opts);
}

function mergeAndSort(rows: CommRow[], limit: number): CommRow[] {
  return rows
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
    .slice(0, limit);
}

async function fetchEmails(
  admin: Supa,
  tenantId: string,
  email: string | null,
  clientId: string,
  limit: number,
  beforeIso: string | null,
): Promise<CommRow[]> {
  let q = admin
    .from('outbound_emails')
    .select(
      'id, subject, body_text, to_address, status, sent_at, created_at, linked_entity_id, tenant_id',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeIso) q = q.lt('created_at', beforeIso);
  const filters: string[] = [`linked_entity_id.eq.${clientId}`];
  if (email) filters.push(`to_address.eq.${email}`);
  q = q.or(filters.join(','));

  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: `email:${r.id}`,
    channel: 'email' as const,
    direction: 'out' as const,
    subject: r.subject,
    preview: (r.body_text ?? r.subject ?? '').slice(0, 200),
    status: r.status,
    timestamp: r.sent_at ?? r.created_at,
    recipient: r.to_address,
  }));
}

async function fetchWhatsApp(
  admin: Supa,
  tenantId: string,
  phone: string | null,
  clientId: string,
  limit: number,
  beforeIso: string | null,
): Promise<CommRow[]> {
  let q = admin
    .from('outbound_whatsapp')
    .select(
      'id, template_id, to_phone, status, sent_at, created_at, linked_entity_id, linked_entity_type',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeIso) q = q.lt('created_at', beforeIso);
  const filters: string[] = [`linked_entity_id.eq.${clientId}`];
  if (phone) filters.push(`to_phone.eq.${phone}`);
  q = q.or(filters.join(','));

  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: `wa:${r.id}`,
    channel: 'whatsapp' as const,
    direction: 'out' as const,
    subject: r.template_id,
    preview: `WhatsApp template ${r.template_id}`,
    status: r.status,
    timestamp: r.sent_at ?? r.created_at,
    recipient: r.to_phone,
  }));
}

async function fetchSms(
  admin: Supa,
  tenantId: string,
  phone: string | null,
  clientId: string,
  limit: number,
  beforeIso: string | null,
): Promise<CommRow[]> {
  let q = admin
    .from('outbound_sms')
    .select(
      'id, template_id, to_phone, body, status, sent_at, created_at, linked_entity_id, linked_entity_type',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeIso) q = q.lt('created_at', beforeIso);
  const filters: string[] = [`linked_entity_id.eq.${clientId}`];
  if (phone) filters.push(`to_phone.eq.${phone}`);
  q = q.or(filters.join(','));

  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: `sms:${r.id}`,
    channel: 'sms' as const,
    direction: 'out' as const,
    subject: r.template_id,
    preview: r.body.slice(0, 200),
    status: r.status,
    timestamp: r.sent_at ?? r.created_at,
    recipient: r.to_phone,
  }));
}

async function fetchWhatsAppInbox(
  admin: Supa,
  tenantId: string,
  phone: string | null,
  limit: number,
  beforeIso: string | null,
): Promise<CommRow[]> {
  if (!phone) return [];
  let q = admin
    .from('whatsapp_inbox')
    .select('id, from_phone, body, received_at')
    .eq('tenant_id', tenantId)
    .eq('from_phone', phone)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (beforeIso) q = q.lt('received_at', beforeIso);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: `wa-in:${r.id}`,
    channel: 'whatsapp' as const,
    direction: 'in' as const,
    subject: null,
    preview: (r.body ?? '').slice(0, 200),
    status: 'received',
    timestamp: r.received_at,
    recipient: r.from_phone,
  }));
}

async function fetchSmsInbox(
  admin: Supa,
  tenantId: string,
  phone: string | null,
  limit: number,
  beforeIso: string | null,
): Promise<CommRow[]> {
  if (!phone) return [];
  let q = admin
    .from('sms_inbox')
    .select('id, from_phone, body, received_at')
    .eq('tenant_id', tenantId)
    .eq('from_phone', phone)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (beforeIso) q = q.lt('received_at', beforeIso);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: `sms-in:${r.id}`,
    channel: 'sms' as const,
    direction: 'in' as const,
    subject: null,
    preview: (r.body ?? '').slice(0, 200),
    status: 'received',
    timestamp: r.received_at,
    recipient: r.from_phone,
  }));
}
