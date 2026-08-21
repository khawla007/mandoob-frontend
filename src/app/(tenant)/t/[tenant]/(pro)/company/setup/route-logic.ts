import {
  COMPANY_ONBOARDING_SECTION_KEYS,
  type CompanyOnboardingSectionKey,
} from '@/lib/company-onboarding/contracts';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import type { OnboardingStep } from '@/components/company-onboarding/OnboardingShell';

export type CompanyOnboardingRouteSection = CompanyOnboardingSectionKey | 'review';

const COMPANY_ONBOARDING_ROUTE_SECTIONS: readonly CompanyOnboardingRouteSection[] = [
  ...COMPANY_ONBOARDING_SECTION_KEYS,
  'review',
];
const routeSections = new Set<string>(COMPANY_ONBOARDING_ROUTE_SECTIONS);
const ONBOARDING_TENANT_STATUSES = new Set(['pending', 'unassigned', 'active']);

export function isCompanyOnboardingTenantStatusAllowed(status: string): boolean {
  return ONBOARDING_TENANT_STATUSES.has(status);
}

export function parseCompanyOnboardingSection(value: string): CompanyOnboardingRouteSection | null {
  return routeSections.has(value) ? (value as CompanyOnboardingRouteSection) : null;
}

export function canonicalCompanyOnboardingSection(snapshot: {
  sectionProgress: Record<
    CompanyOnboardingSectionKey,
    'complete' | 'incomplete' | { status: 'complete' | 'incomplete' }
  >;
}): CompanyOnboardingRouteSection {
  return (
    COMPANY_ONBOARDING_SECTION_KEYS.find((section) => {
      const progress = snapshot.sectionProgress[section];
      return (typeof progress === 'string' ? progress : progress.status) !== 'complete';
    }) ?? 'review'
  );
}

export function companyOnboardingSectionHref(
  tenantSlug: string,
  section: CompanyOnboardingRouteSection,
): string {
  return `/t/${encodeURIComponent(tenantSlug)}/company/setup/${section}`;
}

export function buildCompanyOnboardingSteps(
  tenantSlug: string,
  snapshot: Pick<CompanyOnboardingSnapshot, 'onboardingStatus' | 'sectionProgress'>,
  current: CompanyOnboardingRouteSection,
  labels: Record<CompanyOnboardingRouteSection, string>,
): OnboardingStep[] {
  return COMPANY_ONBOARDING_ROUTE_SECTIONS.map((key) => ({
    key,
    href: companyOnboardingSectionHref(tenantSlug, key),
    label: labels[key],
    status:
      key === current
        ? 'current'
        : key === 'review'
          ? snapshot.onboardingStatus === 'completed'
            ? 'complete'
            : 'incomplete'
          : snapshot.sectionProgress[key].status,
  }));
}

export function nextCompanyOnboardingSection(
  section: CompanyOnboardingSectionKey,
): CompanyOnboardingRouteSection {
  const index = COMPANY_ONBOARDING_SECTION_KEYS.indexOf(section);
  return COMPANY_ONBOARDING_SECTION_KEYS[index + 1] ?? 'review';
}
