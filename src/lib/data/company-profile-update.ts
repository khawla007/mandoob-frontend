import 'server-only';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type RpcClient = {
  rpc(
    name: 'update_assigned_company_profile',
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

type UpdateDependencies = {
  client?: RpcClient;
  log?: (event: string) => void;
};

export type AssignedCompanyProfileUpdateInput = {
  actorId: string;
  tenantId: string;
  companyId: string;
  expectedUpdatedAt: string;
  companyName: string;
  tradeLicenseNo: string;
  jurisdiction: string;
  licenseExpiry: string;
};

export type AssignedCompanyProfileUpdateResult =
  | { ok: true; updatedAt: string }
  | { ok: false; code: 'notFound' | 'conflict' | 'validation' | 'unexpected' };

const resultSchema = z.object({
  company_id: z.string().uuid(),
  updated_at: z.string().min(1),
});

const ERROR_CODES: Record<
  string,
  Extract<AssignedCompanyProfileUpdateResult, { ok: false }>['code']
> = {
  ASSIGNMENT_NOT_FOUND: 'notFound',
  FORBIDDEN: 'notFound',
  STALE_COMPANY_PROFILE: 'conflict',
  INVALID_PROFILE_INPUT: 'validation',
};

export async function updateAssignedCompanyProfile(
  input: AssignedCompanyProfileUpdateInput,
  dependencies: UpdateDependencies = {},
): Promise<AssignedCompanyProfileUpdateResult> {
  const client = dependencies.client ?? (createSupabaseServiceRoleClient() as unknown as RpcClient);
  const { data, error } = await client.rpc('update_assigned_company_profile', {
    p_actor_profile_id: input.actorId,
    p_tenant_id: input.tenantId,
    p_company_id: input.companyId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_company_name: input.companyName,
    p_trade_license_no: input.tradeLicenseNo,
    p_jurisdiction: input.jurisdiction,
    p_license_expiry: input.licenseExpiry || null,
  });

  if (error) {
    const code = error.message ? ERROR_CODES[error.message] : undefined;
    if (code) return { ok: false, code };
    (dependencies.log ?? ((event) => console.error(event)))('company-profile.update-rpc failed');
    return { ok: false, code: 'unexpected' };
  }

  const parsed = resultSchema.safeParse(data);
  if (!parsed.success || parsed.data.company_id !== input.companyId) {
    (dependencies.log ?? ((event) => console.error(event)))(
      'company-profile.update-rpc invalid-result',
    );
    return { ok: false, code: 'unexpected' };
  }
  return { ok: true, updatedAt: parsed.data.updated_at };
}
