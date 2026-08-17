import 'server-only';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/db/database.types';

type CompanyStatus = Database['public']['Enums']['company_status'];
type DbResult = { data: Record<string, unknown> | null; error: { message?: string } | null };
type Query = {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<DbResult>;
};
type CompanyProfileClient = { from(table: string): Query };
type CompanyProfileDependencies = { supabase?: CompanyProfileClient };

export type AssignedCompanyProfile = {
  id: string;
  tenantId: string;
  companyName: string;
  status: CompanyStatus;
  jurisdiction: string | null;
  tradeLicenseNo: string | null;
  licenseExpiry: string | null;
  shareholders: unknown[];
  registeredActivities: unknown[];
  createdAt: string;
  updatedAt: string;
};

const uuidSchema = z.string().uuid();
const companyRowSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  company_name: z.string(),
  status: z.enum([
    'onboarding',
    'active',
    'renewal_due',
    'renewal_overdue',
    'suspended',
    'churned',
  ]),
  jurisdiction: z.string().nullable(),
  trade_license_no: z.string().nullable(),
  license_expiry: z.string().nullable(),
  shareholders: z.array(z.unknown()),
  registered_activities: z.array(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

const COMPANY_COLUMNS =
  'id, tenant_id, company_name, status, jurisdiction, trade_license_no, license_expiry, shareholders, registered_activities, created_at, updated_at';

export async function readAssignedCompanyForPro(
  profileId: string,
  tenantSlug: string,
  dependencies: CompanyProfileDependencies = {},
): Promise<AssignedCompanyProfile | null> {
  if (!uuidSchema.safeParse(profileId).success || tenantSlug.trim() === '') return null;
  const admin =
    dependencies.supabase ?? (createSupabaseServiceRoleClient() as unknown as CompanyProfileClient);

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id, slug, name, plan, status')
    .eq('slug', tenantSlug)
    .maybeSingle();
  const tenantId = uuidSchema.safeParse(tenant?.id);
  if (tenantError || !tenantId.success) return null;

  const { data: assignment, error: assignmentError } = await admin
    .from('pro_company_assignments')
    .select('company_id')
    .eq('pro_profile_id', profileId)
    .eq('tenant_id', tenantId.data)
    .eq('status', 'active')
    .maybeSingle();
  const companyId = uuidSchema.safeParse(assignment?.company_id);
  if (assignmentError || !companyId.success) return null;

  const { data, error } = await admin
    .from('company_profiles')
    .select(COMPANY_COLUMNS)
    .eq('id', companyId.data)
    .eq('tenant_id', tenantId.data)
    .maybeSingle();
  const row = companyRowSchema.safeParse(data);
  if (error || !row.success) return null;

  return {
    id: row.data.id,
    tenantId: row.data.tenant_id,
    companyName: row.data.company_name,
    status: row.data.status,
    jurisdiction: row.data.jurisdiction,
    tradeLicenseNo: row.data.trade_license_no,
    licenseExpiry: row.data.license_expiry,
    shareholders: row.data.shareholders,
    registeredActivities: row.data.registered_activities,
    createdAt: row.data.created_at,
    updatedAt: row.data.updated_at,
  };
}
