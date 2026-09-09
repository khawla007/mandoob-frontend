import Link from 'next/link';
import { AlertTriangle, Building2, CheckCircle2, Landmark, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type {
  CompanyOnboardingSectionKey,
  CompanyReadinessCode,
  CompanyReadinessSection,
} from '@/lib/company-onboarding/contracts';
import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import type { CompanyPanelState } from '@/lib/data/company-workspace';

type OverviewLabels = {
  unavailableTitle: string;
  unavailableDescription: string;
  emptyValue: string;
  legalCompleteness: string;
  activationReadiness: string;
  lifecycle: string;
  lifecycleValue: string;
  sectionsComplete: string;
  activationReady: string;
  activationBlocked: string;
  primaryActivity: string;
  additionalActivity: string;
  openSection: string;
  sectionStatuses: Record<'complete' | 'incomplete', string>;
  sections: Record<CompanyOnboardingSectionKey, string>;
  fields: {
    registeredName: string;
    displayName: string;
    jurisdictionType: string;
    licensingAuthority: string;
    legalStructure: string;
    tradeLicense: string;
    licenseExpiry: string;
    shareholderType: string;
    nationality: string;
    incorporationCountry: string;
    registrationNumber: string;
    ownershipPercent: string;
    activityCode: string;
    authorityName: string;
    officeType: string;
    address: string;
    providerName: string;
    leaseReference: string;
    leaseExpiry: string;
    establishmentCard: string;
    establishmentExpiry: string;
    bankName: string;
    branchName: string;
    accountHolderName: string;
    currency: string;
    iban: string;
    accountNumber: string;
  };
  jurisdictions: Record<'mainland' | 'free_zone' | 'offshore', string>;
  officeTypes: Record<'physical' | 'flexi_desk' | 'virtual', string>;
  shareholderKinds: Record<'individual' | 'company', string>;
  requirements: Record<CompanyReadinessCode, string>;
};

export function AssignedCompanyOverview({
  company,
  profile,
  locale,
  dateFormatter,
  sectionHrefs,
  labels,
}: {
  company: AssignedCompanyProfile;
  profile: CompanyPanelState<CompanyOnboardingSnapshot>;
  locale: string;
  dateFormatter: Intl.DateTimeFormat;
  sectionHrefs: Record<CompanyReadinessSection, string>;
  labels: OverviewLabels;
}) {
  if (profile.status === 'unrequested') return null;
  if (profile.status === 'error') {
    return (
      <div className="border-destructive/25 bg-destructive/5 rounded-xl border p-5" role="status">
        <h2 className="font-semibold">{labels.unavailableTitle}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{labels.unavailableDescription}</p>
      </div>
    );
  }

  const snapshot = profile.data;
  const completedSections = Object.values(snapshot.sectionProgress).filter(
    ({ status }) => status === 'complete',
  ).length;
  const totalSections = Object.keys(snapshot.sectionProgress).length;
  const percentage = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-3">
        <StatusSignal
          icon={CheckCircle2}
          label={labels.legalCompleteness}
          value={labels.sectionsComplete}
          tone={completedSections === totalSections ? 'success' : 'warning'}
        />
        <StatusSignal
          icon={snapshot.requirements.length === 0 ? CheckCircle2 : AlertTriangle}
          label={labels.activationReadiness}
          value={
            snapshot.requirements.length === 0 ? labels.activationReady : labels.activationBlocked
          }
          tone={snapshot.requirements.length === 0 ? 'success' : 'urgent'}
        />
        <StatusSignal
          icon={Building2}
          label={labels.lifecycle}
          value={company.status}
          tone="info"
          displayValue={labels.lifecycleValue}
        />
      </div>

      {snapshot.requirements.length > 0 ? (
        <section
          className="rounded-xl border border-[var(--signal-warning)]/40 bg-[var(--signal-sand-soft)] p-4"
          aria-labelledby="activation-readiness-title"
        >
          <h2 id="activation-readiness-title" className="font-semibold">
            {labels.activationReadiness}
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {snapshot.requirements.map((requirement) => (
              <li key={requirement.code}>
                <Link
                  href={sectionHrefs[requirement.section]}
                  className="text-signal-warning-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                  {labels.requirements[requirement.code]}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <FactSection
          icon={Building2}
          title={labels.sections.legal}
          status={snapshot.sectionProgress.legal.status}
          href={sectionHrefs.legal}
          labels={labels}
        >
          <FactGrid>
            <Fact label={labels.fields.registeredName} value={snapshot.companyName} />
            <Fact
              label={labels.fields.displayName}
              value={snapshot.displayName}
              empty={labels.emptyValue}
            />
            <Fact
              label={labels.fields.jurisdictionType}
              value={
                snapshot.jurisdictionType ? labels.jurisdictions[snapshot.jurisdictionType] : null
              }
              empty={labels.emptyValue}
            />
            <Fact
              label={labels.fields.licensingAuthority}
              value={snapshot.licensingAuthority}
              empty={labels.emptyValue}
            />
            <Fact
              label={labels.fields.legalStructure}
              value={snapshot.legalStructure}
              empty={labels.emptyValue}
            />
            <Fact
              label={labels.fields.tradeLicense}
              value={snapshot.tradeLicenseNo}
              empty={labels.emptyValue}
              mono
            />
            <Fact
              label={labels.fields.licenseExpiry}
              value={businessDate(snapshot.licenseExpiry, dateFormatter)}
              empty={labels.emptyValue}
            />
          </FactGrid>
        </FactSection>

        <FactSection
          icon={Users}
          title={labels.sections.shareholders}
          status={snapshot.sectionProgress.shareholders.status}
          href={sectionHrefs.shareholders}
          labels={labels}
        >
          {snapshot.shareholders.length === 0 ? (
            <p className="text-muted-foreground text-sm">{labels.emptyValue}</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {snapshot.shareholders.map((shareholder) => (
                <li
                  key={shareholder.id}
                  className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {shareholder.kind === 'individual'
                        ? shareholder.fullName
                        : shareholder.legalName}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {labels.shareholderKinds[shareholder.kind]} ·{' '}
                      {shareholder.kind === 'individual'
                        ? `${labels.fields.nationality}: ${shareholder.nationalityCode}`
                        : `${labels.fields.incorporationCountry}: ${shareholder.countryOfIncorporation}`}
                    </p>
                    {shareholder.kind === 'company' ? (
                      <p className="text-muted-foreground mt-1 font-mono text-xs">
                        {labels.fields.registrationNumber}: {shareholder.registrationMasked}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-mono text-sm tabular-nums">
                    {labels.fields.ownershipPercent}:{' '}
                    {percentage.format(Number(shareholder.ownershipPercent) / 100)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </FactSection>

        <FactSection
          icon={Landmark}
          title={labels.sections.activities}
          status={snapshot.sectionProgress.activities.status}
          href={sectionHrefs.activities}
          labels={labels}
        >
          {snapshot.activities.length === 0 ? (
            <p className="text-muted-foreground text-sm">{labels.emptyValue}</p>
          ) : (
            <ul className="space-y-2">
              {snapshot.activities.map((activity) => (
                <li key={activity.id} className="rounded-lg border px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium break-words">{activity.activityName}</p>
                    <Badge variant={activity.isPrimary ? 'default' : 'outline'}>
                      {activity.isPrimary ? labels.primaryActivity : labels.additionalActivity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    <span className="font-mono">{activity.activityCode}</span> ·{' '}
                    {labels.fields.authorityName}: {activity.authorityName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </FactSection>

        <FactSection
          icon={MapPin}
          title={labels.sections.office}
          status={snapshot.sectionProgress.office.status}
          href={sectionHrefs.office}
          labels={labels}
        >
          {snapshot.office ? (
            <FactGrid>
              <Fact
                label={labels.fields.officeType}
                value={labels.officeTypes[snapshot.office.officeType]}
              />
              <Fact
                label={labels.fields.address}
                value={officeAddress(snapshot.office)}
                empty={labels.emptyValue}
              />
              <Fact
                label={labels.fields.providerName}
                value={snapshot.office.providerName}
                empty={labels.emptyValue}
              />
              <Fact
                label={labels.fields.leaseReference}
                value={snapshot.office.leaseReference}
                empty={labels.emptyValue}
                mono
              />
              <Fact
                label={labels.fields.leaseExpiry}
                value={businessDate(snapshot.office.leaseExpiry, dateFormatter)}
                empty={labels.emptyValue}
              />
            </FactGrid>
          ) : (
            <p className="text-muted-foreground text-sm">{labels.emptyValue}</p>
          )}
        </FactSection>

        <FactSection
          icon={Building2}
          title={labels.sections.establishment}
          status={snapshot.sectionProgress.establishment.status}
          href={sectionHrefs.establishment}
          labels={labels}
        >
          <FactGrid>
            <Fact
              label={labels.fields.establishmentCard}
              value={snapshot.establishmentCardMasked}
              empty={labels.emptyValue}
              mono
            />
            <Fact
              label={labels.fields.establishmentExpiry}
              value={businessDate(snapshot.establishmentCardExpiry, dateFormatter)}
              empty={labels.emptyValue}
            />
          </FactGrid>
        </FactSection>

        <FactSection
          icon={Landmark}
          title={labels.sections.bank}
          status={snapshot.sectionProgress.bank.status}
          href={sectionHrefs.bank}
          labels={labels}
        >
          {snapshot.bank ? (
            <FactGrid>
              <Fact label={labels.fields.bankName} value={snapshot.bank.bankName} />
              <Fact
                label={labels.fields.branchName}
                value={snapshot.bank.branchName}
                empty={labels.emptyValue}
              />
              <Fact
                label={labels.fields.accountHolderName}
                value={snapshot.bank.accountHolderName}
              />
              <Fact label={labels.fields.currency} value={snapshot.bank.currencyCode} mono />
              <Fact
                label={labels.fields.iban}
                value={snapshot.bank.ibanMasked}
                empty={labels.emptyValue}
                mono
              />
              <Fact
                label={labels.fields.accountNumber}
                value={snapshot.bank.accountNumberMasked}
                empty={labels.emptyValue}
                mono
              />
            </FactGrid>
          ) : (
            <p className="text-muted-foreground text-sm">{labels.emptyValue}</p>
          )}
        </FactSection>
      </div>
    </div>
  );
}

function StatusSignal({
  icon: Icon,
  label,
  value,
  displayValue,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  displayValue?: string;
  tone: 'success' | 'warning' | 'urgent' | 'info';
}) {
  const tones = {
    success: 'border-[var(--signal-success)]/30 bg-[var(--signal-mint-soft)]',
    warning: 'border-[var(--signal-warning)]/30 bg-[var(--signal-sand-soft)]',
    urgent: 'border-[var(--signal-urgent)]/30 bg-[var(--signal-coral-soft)]',
    info: 'border-[var(--signal-info)]/30 bg-[var(--signal-blue-soft)]',
  } as const;
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${tones[tone]}`}>
      <Icon className="size-5" aria-hidden="true" />
      <p className="text-muted-foreground mt-3 text-xs font-medium">{label}</p>
      <p className="mt-1 font-semibold break-words" data-value={value}>
        {displayValue ?? value}
      </p>
    </div>
  );
}

function FactSection({
  icon: Icon,
  title,
  status,
  href,
  labels,
  children,
}: {
  icon: typeof Building2;
  title: string;
  status: 'complete' | 'incomplete';
  href: string;
  labels: OverviewLabels;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border p-4">
      <header className="mb-4 flex items-start justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={status === 'complete' ? 'secondary' : 'outline'}>
            {labels.sectionStatuses[status]}
          </Badge>
          <Link
            href={href}
            className="text-primary inline-flex min-h-11 items-center text-xs font-medium underline underline-offset-4"
          >
            {labels.openSection}
          </Link>
        </div>
      </header>
      {children}
    </section>
  );
}

function FactGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>;
}

function Fact({
  label,
  value,
  empty = '',
  mono = false,
}: {
  label: string;
  value: string | null;
  empty?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className={`mt-1 text-sm break-words ${mono ? 'font-mono' : 'font-medium'}`}>
        {value || empty}
      </dd>
    </div>
  );
}

function businessDate(value: string | null, formatter: Intl.DateTimeFormat): string | null {
  return value ? formatter.format(new Date(`${value}T00:00:00+04:00`)) : null;
}

function officeAddress(office: CompanyOnboardingSnapshot['office']): string | null {
  if (!office) return null;
  const parts = [
    office.addressLine1,
    office.addressLine2,
    office.area,
    office.city,
    office.emirate,
    office.postalCode,
    office.countryCode,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}
