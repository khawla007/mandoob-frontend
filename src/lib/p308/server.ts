import 'server-only';

import { logSafeActionError } from '@/lib/actions/server-action-security';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { EmployeeCryptoDeps } from '@/lib/employees/commands';
import { P308Error, type P308Actor, type P308RpcClient } from './rpc';

export type P308ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export function p308Client(): P308RpcClient {
  return createSupabaseServiceRoleClient() as unknown as P308RpcClient;
}

export async function employeeCrypto(): Promise<EmployeeCryptoDeps> {
  const [{ encrypt, createBlindIndex }, { hashPassportForLookup }] = await Promise.all([
    import('@/lib/crypto/pii'),
    import('@/lib/crypto/passport-lookup'),
  ]);
  return { encrypt, blind: createBlindIndex, hashPassport: hashPassportForLookup };
}

/**
 * PRO command boundary, called after the action's own `requireProTenantRouteAccess`:
 * active tenant plus the single active assignment. The RPC re-checks both.
 */
export async function assignedProActor(
  access: { session: { id: string }; tenant: { id: string } },
  tenantSlug: string,
): Promise<P308Actor> {
  const [{ requireActiveTenant }, { readAssignedCompanyForPro }] = await Promise.all([
    import('@/lib/auth/require-active-tenant'),
    import('@/lib/data/company-profile'),
  ]);
  await requireActiveTenant(access.tenant.id);
  const company = await readAssignedCompanyForPro(access.session.id, tenantSlug);
  if (!company || company.tenantId !== access.tenant.id) throw new P308Error('FORBIDDEN', 403);
  return { actorId: access.session.id, tenantId: access.tenant.id, companyId: company.id };
}

const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'This record is outside your company access.',
  VALIDATION_FAILED: 'Check the highlighted values and try again.',
  STALE_VERSION: 'This record changed since you opened it. Refresh and try again.',
  OPERATION_REUSED: 'This request was already used for a different change.',
  INTERNAL: 'The change could not be saved. Try again.',
};

/** Converts any failure into a stable, non-disclosing action result. */
export function p308Failure(
  label: string,
  error: unknown,
): { ok: false; error: string; code: string } {
  if (error instanceof P308Error) {
    if (error.code === 'INTERNAL') logSafeActionError(label, error);
    return { ok: false, code: error.code, error: MESSAGES[error.code] ?? error.code };
  }
  if (
    error instanceof Error &&
    ['FORBIDDEN', 'TENANT_NOT_FOUND', 'TENANT_INACTIVE'].includes(error.message)
  ) {
    return { ok: false, code: 'FORBIDDEN', error: MESSAGES.FORBIDDEN };
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'FORBIDDEN' || code === 'TENANT_INACTIVE') {
    return { ok: false, code: 'FORBIDDEN', error: MESSAGES.FORBIDDEN };
  }
  logSafeActionError(label, error);
  return { ok: false, code: 'INTERNAL', error: MESSAGES.INTERNAL };
}
