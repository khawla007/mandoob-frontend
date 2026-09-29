'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { updateEmployeeSelf } from '@/lib/employees/commands';
import { p308Client } from '@/lib/p308/server';
import { P308Error } from '@/lib/p308/rpc';
import {
  authorizeEmployeePortalRead,
  employeePortalHref,
} from '@/lib/data/employee-portal-workspace';
import { employeeSelfUpdateSchema } from '@/lib/validation/employee';

export type EmployeeReminderActionState = {
  status: 'idle' | 'success' | 'error' | 'conflict';
};

/** P3-CONTRACT-0195: versioned, operation-id based, same-transaction audited preference write. */
export async function updateEmployeeReminderPreferenceAction(
  slug: string,
  _previous: EmployeeReminderActionState,
  formData: FormData,
): Promise<EmployeeReminderActionState> {
  try {
    const access = await authorizeEmployeePortalRead(slug);
    const parsed = employeeSelfUpdateSchema.safeParse({
      operation_id: formData.get('operation_id'),
      expected_version: Number(formData.get('expected_version')),
      renewal_reminders_enabled: formData.get('renewal_reminders_enabled') === 'on',
    });
    if (!parsed.success) return { status: 'error' };
    await updateEmployeeSelf(
      p308Client(),
      { actorId: access.session.id, tenantId: access.tenant.id },
      parsed.data,
    );
    revalidatePath(employeePortalHref(access.tenant.slug, 'settings'));
    revalidatePath(employeePortalHref(access.tenant.slug, 'dashboard'));
    return { status: 'success' };
  } catch (error) {
    if (error instanceof P308Error && error.code === 'STALE_VERSION') return { status: 'conflict' };
    logSafeActionError('employee.preference.update', error);
    return { status: 'error' };
  }
}

export type EmployeeProfileActionState = EmployeeReminderActionState;

/** Employee self profile: only the contact phone is self-editable. */
export async function updateEmployeeProfileAction(
  slug: string,
  _previous: EmployeeProfileActionState,
  formData: FormData,
): Promise<EmployeeProfileActionState> {
  try {
    const access = await authorizeEmployeePortalRead(slug);
    const phone = String(formData.get('phone') ?? '').trim();
    const parsed = employeeSelfUpdateSchema.safeParse({
      operation_id: formData.get('operation_id'),
      expected_version: Number(formData.get('expected_version')),
      phone: phone === '' ? null : phone,
    });
    if (!parsed.success) return { status: 'error' };
    await updateEmployeeSelf(
      p308Client(),
      { actorId: access.session.id, tenantId: access.tenant.id },
      parsed.data,
    );
    revalidatePath(employeePortalHref(access.tenant.slug, 'profile'));
    return { status: 'success' };
  } catch (error) {
    if (error instanceof P308Error && error.code === 'STALE_VERSION') return { status: 'conflict' };
    logSafeActionError('employee.profile.update', error);
    return { status: 'error' };
  }
}
