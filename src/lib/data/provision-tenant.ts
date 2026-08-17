import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  TENANT_PLANS,
  tenantSlugSchema,
  type TenantPlan,
} from '@/lib/validation/tenant-onboarding';

export type ProvisionCompanyInput = { companyName: string; slug: string; plan: TenantPlan };
export type ProvisionCompanyResult = { tenantId: string; companyId: string };
export type ProvisionCompanyDependencies = {
  provision(input: ProvisionCompanyInput & { actorId: string }): Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
  reportError?(context: string, code: string): void;
};

const schema = z.object({
  companyName: z.string().trim().min(3).max(200),
  slug: tenantSlugSchema,
  plan: z.enum(TENANT_PLANS),
  actorId: z.string().uuid(),
});

function productionDependencies(): ProvisionCompanyDependencies {
  const admin = createSupabaseServiceRoleClient();
  return {
    async provision(input) {
      return admin.rpc('provision_company_workspace_atomic', {
        p_actor_id: input.actorId,
        p_company_name: input.companyName,
        p_slug: input.slug,
        p_plan: input.plan,
      });
    },
    reportError: (context, code) => console.error(context, { code }),
  };
}

export async function provisionTenant(
  input: ProvisionCompanyInput,
  actorId: string,
  dependencies: ProvisionCompanyDependencies = productionDependencies(),
): Promise<ProvisionCompanyResult> {
  const parsed = schema.parse({ ...input, actorId });
  const { data, error } = await dependencies.provision(parsed);
  if (error) {
    dependencies.reportError?.(
      'atomic company workspace provisioning failed',
      error.code ?? 'unknown',
    );
    if (error.code === '23505') throw new ApiError('VALIDATION_FAILED', 'Slug already in use', 409);
    if (error.code === '42501') throw new ApiError('FORBIDDEN', 'Operator is not authorized', 403);
    throw new ApiError('INTERNAL', 'Could not create company workspace', 500);
  }
  const result = data as { tenant_id?: unknown; company_id?: unknown } | null;
  if (
    !result ||
    !z.string().uuid().safeParse(result.tenant_id).success ||
    !z.string().uuid().safeParse(result.company_id).success
  ) {
    throw new ApiError('INTERNAL', 'Could not create company workspace', 500);
  }
  return { tenantId: result.tenant_id as string, companyId: result.company_id as string };
}
