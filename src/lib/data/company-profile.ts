import 'server-only';
import { z } from 'zod';
import {
  COMPANY_ONBOARDING_SECTION_KEYS,
  COMPANY_ONBOARDING_SECTION_STATUSES,
  COMPANY_ONBOARDING_STATUSES,
  type CompanyOnboardingSectionKey,
  type CompanyOnboardingSectionStatus,
  type CompanyReadinessCode,
} from '@/lib/company-onboarding/contracts';
import { parseCompanyReadinessRequirements } from '@/lib/company-onboarding/readiness';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/db/database.types';

type CompanyStatus = Database['public']['Enums']['company_status'];
type OnboardingStatus = Database['public']['Enums']['company_onboarding_status'];
type DbResult = { data: unknown; error: { message?: string } | null };
type Query = {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<DbResult>;
};
type CompanyProfileClient = {
  from(table: string): Query;
  rpc(name: string, parameters: Record<string, unknown>): Promise<DbResult>;
};
type CompanyProfileDependencies = { supabase?: CompanyProfileClient };

export type AssignedCompanyProfile = {
  id: string;
  tenantId: string;
  companyName: string;
  status: CompanyStatus;
  jurisdiction: string | null;
  tradeLicenseNo: string | null;
  licenseExpiry: string | null;
  shareholderCount: number;
  registeredActivityCount: number;
  onboardingStatus: OnboardingStatus;
  onboardingVersion: number;
  sectionProgress: Record<CompanyOnboardingSectionKey, CompanyOnboardingSectionStatus>;
  readinessCodes: CompanyReadinessCode[];
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
  licensing_authority: z.string().nullable(),
  trade_license_no: z.string().nullable(),
  license_expiry: z.string().nullable(),
  onboarding_status: z.enum(COMPANY_ONBOARDING_STATUSES),
  onboarding_version: z.number().int().nonnegative(),
  company_shareholders: z.array(z.object({ count: z.number().int().nonnegative() })).length(1),
  company_registered_activities: z
    .array(z.object({ count: z.number().int().nonnegative() }))
    .length(1),
  company_onboarding_sections: z
    .array(
      z.object({
        section_key: z.enum(COMPANY_ONBOARDING_SECTION_KEYS),
        status: z.enum(COMPANY_ONBOARDING_SECTION_STATUSES),
      }),
    )
    .length(COMPANY_ONBOARDING_SECTION_KEYS.length)
    .refine(
      (sections) =>
        new Set(sections.map((section) => section.section_key)).size === sections.length,
    ),
  created_at: z.string(),
  updated_at: z.string(),
});

const COMPANY_COLUMNS =
  'id, tenant_id, company_name, status, licensing_authority, trade_license_no, license_expiry, onboarding_status, onboarding_version, company_shareholders!company_shareholders_company_tenant_fk(count), company_registered_activities!company_registered_activities_company_tenant_fk(count), company_onboarding_sections!company_onboarding_sections_company_tenant_fk(section_key, status), created_at, updated_at';

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
  const tenantRow = z.object({ id: uuidSchema }).safeParse(tenant);
  if (tenantError || !tenantRow.success) return null;

  const { data: assignment, error: assignmentError } = await admin
    .from('pro_company_assignments')
    .select('company_id')
    .eq('pro_profile_id', profileId)
    .eq('tenant_id', tenantRow.data.id)
    .eq('status', 'active')
    .maybeSingle();
  const assignmentRow = z.object({ company_id: uuidSchema }).safeParse(assignment);
  if (assignmentError || !assignmentRow.success) return null;

  const { data, error } = await admin
    .from('company_profiles')
    .select(COMPANY_COLUMNS)
    .eq('id', assignmentRow.data.company_id)
    .eq('tenant_id', tenantRow.data.id)
    .maybeSingle();
  const row = companyRowSchema.safeParse(data);
  if (error || !row.success) return null;

  const readiness = await admin.rpc('evaluate_company_activation_readiness', {
    p_company_id: assignmentRow.data.company_id,
  });
  if (readiness.error) return null;

  let readinessCodes: CompanyReadinessCode[];
  try {
    readinessCodes = parseCompanyReadinessRequirements(readiness.data).map(({ code }) => code);
  } catch {
    return null;
  }

  const sectionProgress = Object.fromEntries(
    row.data.company_onboarding_sections.map(({ section_key, status }) => [section_key, status]),
  ) as Record<CompanyOnboardingSectionKey, CompanyOnboardingSectionStatus>;

  return {
    id: row.data.id,
    tenantId: row.data.tenant_id,
    companyName: row.data.company_name,
    status: row.data.status,
    jurisdiction: row.data.licensing_authority,
    tradeLicenseNo: row.data.trade_license_no,
    licenseExpiry: row.data.license_expiry,
    shareholderCount: row.data.company_shareholders[0].count,
    registeredActivityCount: row.data.company_registered_activities[0].count,
    onboardingStatus: row.data.onboarding_status,
    onboardingVersion: row.data.onboarding_version,
    sectionProgress,
    readinessCodes,
    createdAt: row.data.created_at,
    updatedAt: row.data.updated_at,
  };
}
