'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { updateEmployeeNotificationPreferences } from '@/lib/data/employee-portal';
import {
  authorizeEmployeePortalRead,
  employeePortalHref,
} from '@/lib/data/employee-portal-workspace';

export type EmployeeReminderActionState = { status: 'idle' | 'success' | 'error' };

export async function updateEmployeeReminderPreferenceAction(
  slug: string,
  _previous: EmployeeReminderActionState,
  formData: FormData,
): Promise<EmployeeReminderActionState> {
  try {
    const access = await authorizeEmployeePortalRead(slug);
    await updateEmployeeNotificationPreferences(access.session.id, access.tenant.id, {
      renewal_reminders_enabled: formData.get('renewal_reminders_enabled') === 'on',
    });
    revalidatePath(employeePortalHref(access.tenant.slug, 'settings'));
    revalidatePath(employeePortalHref(access.tenant.slug, 'dashboard'));
    return { status: 'success' };
  } catch (error) {
    logSafeActionError('employee.preference.update', error);
    return { status: 'error' };
  }
}
