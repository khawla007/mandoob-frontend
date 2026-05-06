import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { enqueueEmail } from '@/lib/mail/send';

export function reminderVariantFor(due: Date, at: Date): 30 | 7 | 1 {
  const daysOut = Math.round((due.getTime() - at.getTime()) / 86_400_000);
  if (daysOut >= 21) return 30;
  if (daysOut >= 4) return 7;
  return 1;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? '';
}

export async function scheduleRenewalReminders(renewalId: string): Promise<{ scheduled: number }> {
  const admin = createSupabaseServiceRoleClient();
  const { data: r } = await admin
    .from('renewals')
    .select('id, tenant_id, client_id, label, due_date, notify_at, status')
    .eq('id', renewalId)
    .maybeSingle();
  if (!r || !ACTIVE_STATUSES.has(r.status as string) || !r.notify_at?.length) {
    return { scheduled: 0 };
  }

  const { data: client } = await admin
    .from('clients')
    .select('id, company_name, tenant_id')
    .eq('id', r.client_id)
    .maybeSingle();
  if (!client) return { scheduled: 0 };

  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', r.tenant_id)
    .maybeSingle();

  const { data: customerLink } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_client_id', client.id)
    .maybeSingle();

  if (!customerLink) return { scheduled: 0 };

  const { data: authUser } = await admin.auth.admin.getUserById(customerLink.profile_id);
  const email = authUser.user?.email;
  if (!email) return { scheduled: 0 };

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', customerLink.profile_id)
    .maybeSingle();
  const customerName = profile?.full_name ?? 'there';

  const due = new Date(`${r.due_date}T00:00:00Z`);
  const now = Date.now();
  let scheduled = 0;
  for (const ts of r.notify_at) {
    const at = new Date(ts);
    if (at.getTime() < now) continue;
    const variant = reminderVariantFor(due, at);
    const result = await enqueueEmail({
      tenantId: r.tenant_id,
      templateId: 'renewal-reminder',
      toAddress: email,
      input: {
        customerName,
        tenantName: tenant?.name ?? '',
        renewalLabel: r.label,
        dueDate: r.due_date,
        daysOut: variant,
        detailUrl: `${appUrl()}/portal/renewals/${r.id}`,
      },
      scheduledFor: at,
      linked: { entityType: 'renewal', entityId: r.id },
    });
    if (result.ok) scheduled++;
  }
  return { scheduled };
}

const ACTIVE_STATUSES = new Set<string>(['upcoming', 'due_soon', 'overdue']);
