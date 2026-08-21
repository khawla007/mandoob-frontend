import {
  COMPANY_ONBOARDING_SECTION_KEYS,
  type CompanyOnboardingSectionKey,
} from '@/lib/company-onboarding/contracts';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import type { OnboardingStep } from '@/components/company-onboarding/OnboardingShell';

export type AdminCompanyOnboardingSection = CompanyOnboardingSectionKey | 'review';

const ADMIN_ONBOARDING_SECTIONS: readonly AdminCompanyOnboardingSection[] = [
  ...COMPANY_ONBOARDING_SECTION_KEYS,
  'review',
];
const sectionSet = new Set<string>(ADMIN_ONBOARDING_SECTIONS);

export function parseAdminCompanyOnboardingSection(
  value: string,
): AdminCompanyOnboardingSection | null {
  return sectionSet.has(value) ? (value as AdminCompanyOnboardingSection) : null;
}

export function canonicalAdminCompanyOnboardingSection(snapshot: {
  sectionProgress: CompanyOnboardingSnapshot['sectionProgress'];
}): AdminCompanyOnboardingSection {
  return (
    COMPANY_ONBOARDING_SECTION_KEYS.find(
      (key) => snapshot.sectionProgress[key].status !== 'complete',
    ) ?? 'review'
  );
}

export function adminCompanyOnboardingSectionHref(
  companyId: string,
  section: AdminCompanyOnboardingSection,
): string {
  return `/admin/companies/${encodeURIComponent(companyId)}/onboarding/${section}`;
}

export function nextAdminCompanyOnboardingSection(
  section: CompanyOnboardingSectionKey,
): AdminCompanyOnboardingSection {
  const index = COMPANY_ONBOARDING_SECTION_KEYS.indexOf(section);
  return COMPANY_ONBOARDING_SECTION_KEYS[index + 1] ?? 'review';
}

export function buildAdminCompanyOnboardingSteps(
  companyId: string,
  snapshot: Pick<CompanyOnboardingSnapshot, 'onboardingStatus' | 'sectionProgress'>,
  current: AdminCompanyOnboardingSection,
  labels: Record<AdminCompanyOnboardingSection, string>,
): OnboardingStep[] {
  return ADMIN_ONBOARDING_SECTIONS.map((key) => ({
    key,
    href: adminCompanyOnboardingSectionHref(companyId, key),
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
