'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  createEmployee,
  setEmployeeStatus,
  updateEmployee,
  type EmployeeReceipt,
} from '@/lib/employees/commands';
import {
  assignedProActor,
  employeeCrypto,
  p308Client,
  p308Failure,
  type P308ActionResult,
} from '@/lib/p308/server';
import {
  createEmployeeSchema,
  setEmployeeStatusSchema,
  updateEmployeeSchema,
} from '@/lib/validation/employee';

export type ActionResult<T = void> = P308ActionResult<T>;

function invalid(): ActionResult<never> {
  return {
    ok: false,
    code: 'VALIDATION_FAILED',
    error: 'Check the highlighted values and try again.',
  };
}

function revalidateEmployeeRoutes(slug: string) {
  revalidatePath(`/t/${slug}/employees`);
  revalidatePath(`/t/${slug}/dashboard`);
}

export async function createEmployeeAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<EmployeeReceipt>> {
  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const actor = await assignedProActor(await requireProTenantRouteAccess(slug), slug);
    const receipt = await createEmployee(p308Client(), actor, parsed.data, await employeeCrypto());
    revalidateEmployeeRoutes(slug);
    return { ok: true, data: receipt };
  } catch (error) {
    return p308Failure('employee.create', error);
  }
}

export async function updateEmployeeAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<EmployeeReceipt>> {
  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const actor = await assignedProActor(await requireProTenantRouteAccess(slug), slug);
    const receipt = await updateEmployee(p308Client(), actor, parsed.data, await employeeCrypto());
    revalidateEmployeeRoutes(slug);
    return { ok: true, data: receipt };
  } catch (error) {
    return p308Failure('employee.update', error);
  }
}

export async function setEmployeeStatusAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<EmployeeReceipt>> {
  const parsed = setEmployeeStatusSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const actor = await assignedProActor(await requireProTenantRouteAccess(slug), slug);
    const receipt = await setEmployeeStatus(p308Client(), actor, parsed.data);
    revalidateEmployeeRoutes(slug);
    return { ok: true, data: receipt };
  } catch (error) {
    return p308Failure('employee.status', error);
  }
}
