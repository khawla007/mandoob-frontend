import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActivitiesForm } from '@/components/company-onboarding/ActivitiesForm';
import { BankDetailsForm } from '@/components/company-onboarding/BankDetailsForm';
import { EstablishmentCardForm } from '@/components/company-onboarding/EstablishmentCardForm';
import { LegalProfileForm } from '@/components/company-onboarding/LegalProfileForm';
import { OfficeDetailsForm } from '@/components/company-onboarding/OfficeDetailsForm';
import { OnboardingReview } from '@/components/company-onboarding/OnboardingReview';
import { OnboardingShell } from '@/components/company-onboarding/OnboardingShell';
import { ShareholdersForm } from '@/components/company-onboarding/ShareholdersForm';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  COMPANY_ONBOARDING_READINESS_CODES,
  COMPANY_ONBOARDING_SECTION_KEYS,
  type CompanyReadinessCode,
  type CompanyReadinessSection,
} from '@/lib/company-onboarding/contracts';
import { readCompanyOnboarding } from '@/lib/data/company-onboarding';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { createOnboardingActionState } from '../action-logic';
import {
  activateCompanyOnboardingAction,
  clearBankIdentifierAction,
  saveActivitiesSectionAction,
  saveBankSectionAction,
  saveEstablishmentSectionAction,
  saveLegalSectionAction,
  saveOfficeSectionAction,
  saveShareholdersSectionAction,
  submitCompanyOnboardingAction,
} from '../actions';
import {
  buildCompanyOnboardingSteps,
  companyOnboardingSectionHref,
  isCompanyOnboardingTenantStatusAllowed,
  parseCompanyOnboardingSection,
  type CompanyOnboardingRouteSection,
} from '../route-logic';

export const dynamic = 'force-dynamic';

const publicErrorCodes = [
  'COMPANY_NOT_FOUND',
  'ASSIGNMENT_NOT_FOUND',
  'COMPANY_INACTIVE',
  'STALE_ONBOARDING_VERSION',
  'INVALID_SECTION_INPUT',
  'SECTION_NOT_COMPLETABLE',
  'ONBOARDING_NOT_SUBMITTABLE',
  'COMPANY_NOT_READY',
  'OPERATION_REUSED',
  'INTERNAL',
] as const;

export default async function CompanyOnboardingSectionPage({
  params,
}: {
  params: Promise<{ tenant: string; section: string }>;
}) {
  const { tenant: slug, section: rawSection } = await params;
  const section = parseCompanyOnboardingSection(rawSection);
  if (!section) notFound();

  const { session, tenant } = await requireProTenantRouteAccess(slug);
  if (!isCompanyOnboardingTenantStatusAllowed(tenant.status)) notFound();
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company) notFound();
  const snapshot = await readCompanyOnboarding({
    actorProfileId: session.id,
    tenantId: tenant.id,
    companyId: company.id,
  });
  if (!snapshot) notFound();

  const t = await getTranslations('companyOnboarding');
  const tx = (key: string) => t(key as never);
  const initialState = createOnboardingActionState(snapshot.onboardingVersion);
  const clearBankInitialState = createOnboardingActionState(snapshot.onboardingVersion);
  const commonLabels = {
    saved: tx('form.saved'),
    saving: tx('form.saving'),
    save: tx('form.save'),
    saveContinue: tx('form.saveContinue'),
    errorTitle: tx('form.errorTitle'),
    errorSummary: tx('form.errorSummary'),
    leaveWarning: tx('form.leaveWarning'),
    errors: Object.fromEntries(
      publicErrorCodes.map((code) => [code, tx(`errors.${code}`)]),
    ) as Record<string, string>,
  };
  const sectionLabels = Object.fromEntries(
    [...COMPANY_ONBOARDING_SECTION_KEYS, 'review'].map((key) => [key, tx(`sections.${key}.step`)]),
  ) as Record<CompanyOnboardingRouteSection, string>;
  const steps = buildCompanyOnboardingSteps(slug, snapshot, section, sectionLabels);
  const sectionHrefs = {
    ...Object.fromEntries(
      COMPANY_ONBOARDING_SECTION_KEYS.map((key) => [key, companyOnboardingSectionHref(slug, key)]),
    ),
    assignment: `/t/${encodeURIComponent(slug)}/company`,
    workspace: `/t/${encodeURIComponent(slug)}/company`,
  } as Record<CompanyReadinessSection, string>;

  const legalAction = saveLegalSectionAction.bind(null, slug, snapshot.companyId);
  const shareholdersAction = saveShareholdersSectionAction.bind(null, slug, snapshot.companyId);
  const activitiesAction = saveActivitiesSectionAction.bind(null, slug, snapshot.companyId);
  const officeAction = saveOfficeSectionAction.bind(null, slug, snapshot.companyId);
  const establishmentAction = saveEstablishmentSectionAction.bind(null, slug, snapshot.companyId);
  const bankAction = saveBankSectionAction.bind(null, slug, snapshot.companyId);
  const clearBankAction = clearBankIdentifierAction.bind(null, slug, snapshot.companyId);
  const submitAction = submitCompanyOnboardingAction.bind(null, slug, snapshot.companyId);
  const activateAction = activateCompanyOnboardingAction.bind(null, slug, snapshot.companyId);

  const content = (() => {
    switch (section) {
      case 'legal':
        return (
          <LegalProfileForm
            snapshot={snapshot}
            action={legalAction}
            initialState={initialState}
            labels={{
              ...commonLabels,
              title: tx('sections.legal.title'),
              description: tx('sections.legal.description'),
              complete: tx('form.completeSection'),
              fields: {
                companyName: tx('sections.legal.fields.companyName'),
                displayName: tx('sections.legal.fields.displayName'),
                jurisdictionType: tx('sections.legal.fields.jurisdictionType'),
                licensingAuthority: tx('sections.legal.fields.licensingAuthority'),
                legalStructure: tx('sections.legal.fields.legalStructure'),
                tradeLicenseNo: tx('sections.legal.fields.tradeLicenseNo'),
                licenseExpiry: tx('sections.legal.fields.licenseExpiry'),
              },
              jurisdictionOptions: {
                mainland: tx('sections.legal.jurisdictions.mainland'),
                free_zone: tx('sections.legal.jurisdictions.free_zone'),
                offshore: tx('sections.legal.jurisdictions.offshore'),
              },
            }}
          />
        );
      case 'shareholders':
        return (
          <ShareholdersForm
            snapshot={snapshot}
            action={shareholdersAction}
            initialState={initialState}
            labels={{
              ...commonLabels,
              title: tx('sections.shareholders.title'),
              description: tx('sections.shareholders.description'),
              complete: tx('form.completeSection'),
              kindLegend: tx('sections.shareholders.kindLegend'),
              kinds: {
                individual: tx('sections.shareholders.kinds.individual'),
                company: tx('sections.shareholders.kinds.company'),
              },
              fields: {
                fullName: tx('sections.shareholders.fields.fullName'),
                nationalityCode: tx('sections.shareholders.fields.nationalityCode'),
                passportNumber: tx('sections.shareholders.fields.passportNumber'),
                legalName: tx('sections.shareholders.fields.legalName'),
                countryOfIncorporation: tx('sections.shareholders.fields.countryOfIncorporation'),
                registrationNumber: tx('sections.shareholders.fields.registrationNumber'),
                ownershipPercent: tx('sections.shareholders.fields.ownershipPercent'),
              },
              addIndividual: tx('sections.shareholders.addIndividual'),
              addCompany: tx('sections.shareholders.addCompany'),
              moveUp: tx('form.moveUp'),
              moveDown: tx('form.moveDown'),
              remove: tx('form.remove'),
              removed: tx('form.removed'),
              undo: tx('form.undo'),
            }}
          />
        );
      case 'activities':
        return (
          <ActivitiesForm
            snapshot={snapshot}
            action={activitiesAction}
            initialState={initialState}
            labels={{
              ...commonLabels,
              title: tx('sections.activities.title'),
              description: tx('sections.activities.description'),
              complete: tx('form.completeSection'),
              fields: {
                activityCode: tx('sections.activities.fields.activityCode'),
                activityName: tx('sections.activities.fields.activityName'),
                authorityName: tx('sections.activities.fields.authorityName'),
              },
              primaryLegend: tx('sections.activities.primaryLegend'),
              primary: tx('sections.activities.primary'),
              add: tx('sections.activities.add'),
              moveUp: tx('form.moveUp'),
              moveDown: tx('form.moveDown'),
              remove: tx('form.remove'),
              removed: tx('form.removed'),
              undo: tx('form.undo'),
            }}
          />
        );
      case 'office':
        return (
          <OfficeDetailsForm
            snapshot={snapshot}
            action={officeAction}
            initialState={initialState}
            labels={{
              ...commonLabels,
              title: tx('sections.office.title'),
              description: tx('sections.office.description'),
              complete: tx('form.completeSection'),
              officeTypeLegend: tx('sections.office.officeTypeLegend'),
              officeTypes: {
                physical: tx('sections.office.types.physical'),
                flexi_desk: tx('sections.office.types.flexi_desk'),
                virtual: tx('sections.office.types.virtual'),
              },
              fields: {
                addressLine1: tx('sections.office.fields.addressLine1'),
                addressLine2: tx('sections.office.fields.addressLine2'),
                area: tx('sections.office.fields.area'),
                city: tx('sections.office.fields.city'),
                emirate: tx('sections.office.fields.emirate'),
                postalCode: tx('sections.office.fields.postalCode'),
                providerName: tx('sections.office.fields.providerName'),
                leaseReference: tx('sections.office.fields.leaseReference'),
                leaseExpiry: tx('sections.office.fields.leaseExpiry'),
              },
            }}
          />
        );
      case 'establishment':
        return (
          <EstablishmentCardForm
            snapshot={snapshot}
            action={establishmentAction}
            initialState={initialState}
            labels={{
              ...commonLabels,
              title: tx('sections.establishment.title'),
              description: tx('sections.establishment.description'),
              maskedLabel: tx('sections.establishment.maskedLabel'),
              none: tx('form.none'),
              cardNumber: tx('sections.establishment.cardNumber'),
              cardExpiry: tx('sections.establishment.cardExpiry'),
              complete: tx('form.completeSection'),
            }}
          />
        );
      case 'bank':
        return (
          <BankDetailsForm
            snapshot={snapshot}
            action={bankAction}
            clearBankIdentifier={clearBankAction}
            initialState={initialState}
            clearInitialState={clearBankInitialState}
            labels={{
              ...commonLabels,
              title: tx('sections.bank.title'),
              description: tx('sections.bank.description'),
              maskedLabel: tx('sections.bank.maskedLabel'),
              none: tx('form.none'),
              complete: tx('form.completeSection'),
              fields: {
                bankName: tx('sections.bank.fields.bankName'),
                branchName: tx('sections.bank.fields.branchName'),
                accountHolderName: tx('sections.bank.fields.accountHolderName'),
                swiftBic: tx('sections.bank.fields.swiftBic'),
                iban: tx('sections.bank.fields.iban'),
                accountNumber: tx('sections.bank.fields.accountNumber'),
              },
              clearTitle: tx('sections.bank.clearTitle'),
              clearDescription: tx('sections.bank.clearDescription'),
              clearIdentifier: tx('sections.bank.clearIdentifier'),
              clearConfirmation: tx('sections.bank.clearConfirmation'),
              clear: tx('sections.bank.clear'),
            }}
          />
        );
      case 'review':
        return (
          <OnboardingReview
            snapshot={snapshot}
            submitAction={submitAction}
            activateAction={activateAction}
            initialState={initialState}
            sectionHrefs={sectionHrefs}
            labels={{
              ...commonLabels,
              title: tx('sections.review.title'),
              description: tx('sections.review.description'),
              ready: tx('sections.review.ready'),
              blocked: tx('sections.review.blocked'),
              submit: tx('sections.review.submit'),
              activate: tx('sections.review.activate'),
              requirements: Object.fromEntries(
                COMPANY_ONBOARDING_READINESS_CODES.map((code) => [
                  code,
                  tx(`requirements.${code}`),
                ]),
              ) as Record<CompanyReadinessCode, string>,
            }}
          />
        );
    }
  })();

  return (
    <OnboardingShell
      steps={steps}
      labels={{
        eyebrow: tx('shell.eyebrow'),
        title: tx('shell.title'),
        description: tx('shell.description'),
        navigationLabel: tx('shell.navigationLabel'),
        leaveWarning: tx('form.leaveWarning'),
        status: {
          complete: tx('shell.status.complete'),
          current: tx('shell.status.current'),
          incomplete: tx('shell.status.incomplete'),
        },
      }}
    >
      {content}
    </OnboardingShell>
  );
}
