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

type ProSession = { id: string; tenantId: string | null };
type TenantIdentity = { id: string };

export type ApplicationActionDependencies = {
  requirePro(): Promise<ProSession>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
  createCase: typeof createServiceCase;
  updateCase: typeof updateServiceCase;
  revalidate(path: string): void;
};

function optionalFormValue(form: FormData, key: string): string | null | undefined {
  if (!form.has(key)) return undefined;
  const value = form.get(key);
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}

function timestampFormValue(form: FormData, key: string): string | null | undefined {
  const value = optionalFormValue(form, key);
  if (!value) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeCreateRaw(raw: unknown): unknown {
  if (!(raw instanceof FormData)) return raw;
  return {
    client_id: optionalFormValue(raw, 'client_id') ?? '',
    title: optionalFormValue(raw, 'title') ?? '',
    service_type: optionalFormValue(raw, 'service_type') ?? '',
    priority: optionalFormValue(raw, 'priority') ?? undefined,
    assigned_to: optionalFormValue(raw, 'assigned_to'),
    due_at: timestampFormValue(raw, 'due_at'),
    sla_due_at: timestampFormValue(raw, 'sla_due_at'),
    blocked_reason: optionalFormValue(raw, 'blocked_reason'),
  };
}

function normalizeUpdateRaw(raw: unknown): unknown {
  if (!(raw instanceof FormData)) return raw;
  return {
    status: optionalFormValue(raw, 'status') ?? undefined,
    priority: optionalFormValue(raw, 'priority') ?? undefined,
    assigned_to: optionalFormValue(raw, 'assigned_to'),
    due_at: timestampFormValue(raw, 'due_at'),
    sla_due_at: timestampFormValue(raw, 'sla_due_at'),
    blocked_reason: optionalFormValue(raw, 'blocked_reason'),
    completed_at: timestampFormValue(raw, 'completed_at'),
  };
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
  const session = await dependencies.requirePro();
  try {
    const { tenant } = await authorize(slug, session, dependencies);
    const parsed = createServiceCaseSchema.safeParse(normalizeCreateRaw(raw));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0].message,
        code: 'VALIDATION_FAILED',
      };
    }
    const result = await dependencies.createCase(
      { tenantId: tenant.id, actorId: session.id, role: 'pro' },
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
  const session = await dependencies.requirePro();
  try {
    const { tenant } = await authorize(slug, session, dependencies);
    const parsed = updateServiceCaseSchema.safeParse(normalizeUpdateRaw(raw));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0].message,
        code: 'VALIDATION_FAILED',
      };
    }
    await dependencies.updateCase(
      { tenantId: tenant.id, actorId: session.id, role: 'pro' },
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
