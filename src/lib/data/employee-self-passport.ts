import 'server-only';
import { z } from 'zod';
import { encryptOptional } from '@/lib/crypto/pii';
import { hashPassportForLookup, normalizePassportForLookup } from '@/lib/crypto/passport-lookup';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type EmployeeScope = { employeeId: string; tenantId: string; companyId: string };
type RpcError = { code?: string; message?: string };
type Dependencies = {
  readScope?: (profileId: string) => Promise<EmployeeScope | null>;
  rpc?: (args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  log?: (event: string) => void;
};

export type EmployeeSelfPassportResult =
  | { ok: true }
  | { ok: false; code: 'notFound' | 'duplicate' | 'unexpected' };

const uuid = z.string().uuid();

export async function updateEmployeeSelfPassport(
  profileId: string,
  passportNo: string | null | undefined,
  dependencies: Dependencies = {},
): Promise<EmployeeSelfPassportResult> {
  if (!uuid.safeParse(profileId).success) return { ok: false, code: 'notFound' };
  const scope = await (dependencies.readScope ?? readLiveEmployeeScope)(profileId);
  if (!scope) return { ok: false, code: 'notFound' };

  const normalized = normalizePassportForLookup(passportNo);
  const args = {
    p_actor_profile_id: profileId,
    p_expected_tenant_id: scope.tenantId,
    p_expected_company_id: scope.companyId,
    p_passport_no_encrypted: encryptOptional(normalized || null),
    p_passport_no_hash: hashPassportForLookup(scope.companyId, normalized),
  };
  const rpc = dependencies.rpc ?? runUpdateRpc;
  const { data, error } = await rpc(args);
  if (error?.code === '23505') return { ok: false, code: 'duplicate' };
  if (error?.message === 'EMPLOYEE_SCOPE_MISMATCH') return { ok: false, code: 'notFound' };
  if (error || data !== scope.employeeId) {
    (dependencies.log ?? ((event) => console.error(event)))('employee-self-passport.update failed');
    return { ok: false, code: 'unexpected' };
  }
  return { ok: true };
}

async function readLiveEmployeeScope(profileId: string): Promise<EmployeeScope | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, tenant_id, role, status')
    .eq('id', profileId)
    .eq('role', 'employee')
    .eq('status', 'active')
    .maybeSingle();
  if (profileError || !profile?.tenant_id) return null;

  const { data: employee, error: employeeError } = await admin
    .from('employees')
    .select('id, tenant_id, company_id, profile_id, status')
    .eq('profile_id', profileId)
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .maybeSingle();
  if (employeeError || !employee) return null;
  return {
    employeeId: employee.id,
    tenantId: employee.tenant_id,
    companyId: employee.company_id,
  };
}

async function runUpdateRpc(args: Record<string, unknown>) {
  const admin = createSupabaseServiceRoleClient();
  return await admin.rpc('update_employee_self_passport', args as never);
}
