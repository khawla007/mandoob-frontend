import { ApiError } from '@/lib/errors';
import type { createServiceCase, updateServiceCase } from '@/lib/data/service-cases';
import {
  createServiceCaseSchema,
  updateServiceCaseSchema,
  type CreateServiceCaseRawInput,
  type UpdateServiceCaseRawInput,
} from '@/lib/validation/service-case';

export type ApplicationActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type ProSession = { id: string; role: 'pro'; tenantId: string | null };
type TenantIdentity = { id: string };
type CompanyIdentity = { id: string; tenantId: string };

export type ApplicationActionDependencies = {
  requirePro(slug: string): Promise<ProSession>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
  resolveAssignedCompany(profileId: string, slug: string): Promise<CompanyIdentity | null>;
  createCase: typeof createServiceCase;
  updateCase: typeof updateServiceCase;
  revalidate(path: string): void;
  now(): Date;
};

function optionalFormValue(form: FormData, key: string): string | null | undefined {
  if (!form.has(key)) return undefined;
  const value = form.get(key);
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}

export function parseDubaiDateTimeLocal(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }
  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:00+04:00`;
}

function timestampFormValue(form: FormData, key: string): string | null | undefined {
  const value = optionalFormValue(form, key);
  if (!value) return value;
  return parseDubaiDateTimeLocal(value) ?? value;
}

function normalizeCreateRaw(raw: unknown): unknown {
  if (!(raw instanceof FormData)) {
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  }
  return {
    title: optionalFormValue(raw, 'title') ?? '',
    service_type: optionalFormValue(raw, 'service_type') ?? '',
    priority: optionalFormValue(raw, 'priority') ?? undefined,
    assigned_to: optionalFormValue(raw, 'assigned_to'),
    due_at: timestampFormValue(raw, 'due_at'),
    sla_due_at: timestampFormValue(raw, 'sla_due_at'),
    blocked_reason: optionalFormValue(raw, 'blocked_reason'),
  };
}

function normalizeUpdateRaw(raw: unknown, now: Date): unknown {
  const candidate: Record<string, unknown> =
    raw instanceof FormData
      ? {
          status: optionalFormValue(raw, 'status') ?? undefined,
          priority: optionalFormValue(raw, 'priority') ?? undefined,
          assigned_to: optionalFormValue(raw, 'assigned_to'),
          due_at: timestampFormValue(raw, 'due_at'),
          sla_due_at: timestampFormValue(raw, 'sla_due_at'),
          blocked_reason: optionalFormValue(raw, 'blocked_reason'),
        }
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
  delete candidate.completed_at;
  if (candidate.status !== undefined) {
    candidate.completed_at = candidate.status === 'completed' ? now.toISOString() : null;
  }
  return candidate;
}

function errorResult(error: unknown, fallback: string): ApplicationActionResult<never> {
  if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
  console.error(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

async function authorize(
  slug: string,
  session: ProSession,
  dependencies: ApplicationActionDependencies,
) {
  const tenant = await dependencies.resolveTenant(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (!session.tenantId || session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await dependencies.requireActive(tenant.id);
  return { session, tenant };
}

export async function runCreateApplicationAction(
  slug: string,
  raw: unknown,
  dependencies: ApplicationActionDependencies,
): Promise<ApplicationActionResult<{ id: string }>> {
  const session = await dependencies.requirePro(slug);
  try {
    const { tenant } = await authorize(slug, session, dependencies);
    const company = await dependencies.resolveAssignedCompany(session.id, slug);
    if (!company || company.tenantId !== tenant.id) {
      throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
    }
    const parsed = createServiceCaseSchema.safeParse({
      ...(normalizeCreateRaw(raw) as Record<string, unknown>),
      company_id: company.id,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0].message,
        code: 'VALIDATION_FAILED',
      };
    }
    const result = await dependencies.createCase(
      { tenantId: tenant.id, actorId: session.id, role: session.role },
      parsed.data as CreateServiceCaseRawInput,
    );
    dependencies.revalidate(`/t/${slug}/applications`);
    dependencies.revalidate(`/t/${slug}/dashboard`);
    return { ok: true, data: result };
  } catch (error) {
    return errorResult(error, 'Could not create application');
  }
}

export async function runUpdateApplicationAction(
  slug: string,
  caseId: string,
  raw: unknown,
  dependencies: ApplicationActionDependencies,
): Promise<ApplicationActionResult<void>> {
  const session = await dependencies.requirePro(slug);
  try {
    const { tenant } = await authorize(slug, session, dependencies);
    const company = await dependencies.resolveAssignedCompany(session.id, slug);
    if (!company || company.tenantId !== tenant.id) {
      throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
    }
    const parsed = updateServiceCaseSchema.safeParse(normalizeUpdateRaw(raw, dependencies.now()));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0].message,
        code: 'VALIDATION_FAILED',
      };
    }
    await dependencies.updateCase(
      { tenantId: tenant.id, companyId: company.id, actorId: session.id, role: session.role },
      caseId,
      parsed.data as UpdateServiceCaseRawInput,
    );
    dependencies.revalidate(`/t/${slug}/applications`);
    dependencies.revalidate(`/t/${slug}/dashboard`);
    return { ok: true, data: undefined };
  } catch (error) {
    return errorResult(error, 'Could not update application');
  }
}
