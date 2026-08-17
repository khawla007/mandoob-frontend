import 'server-only';
import type { AssignedCompanyProfile } from './company-profile';

type ReadAssignedCompany = (
  profileId: string,
  tenantSlug: string,
) => Promise<AssignedCompanyProfile | null>;

export async function resolveImportCompany(
  profileId: string,
  tenantId: string,
  tenantSlug: string,
  read?: ReadAssignedCompany,
) {
  const reader = read ?? (await import('./company-profile')).readAssignedCompanyForPro;
  const company = await reader(profileId, tenantSlug);
  return company?.tenantId === tenantId ? company : null;
}
