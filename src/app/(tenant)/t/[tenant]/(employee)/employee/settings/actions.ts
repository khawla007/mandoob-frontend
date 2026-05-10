'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { updateEmployeeNotificationPreferences } from '@/lib/data/employee-portal';

export async function updateEmployeeReminderPreferenceAction(slug: string, formData: FormData) {
  const session = await requireRole('employee');
  if (!session.tenantId) throw new ApiError('FORBIDDEN', 'Session missing tenant binding', 403);
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);

  await updateEmployeeNotificationPreferences(session.id, tenant.id, {
    renewal_reminders_enabled: formData.get('renewal_reminders_enabled') === 'on',
  });

  revalidatePath(`/t/${tenant.slug}/employee/settings`);
  revalidatePath(`/t/${tenant.slug}/employee/dashboard`);
}
