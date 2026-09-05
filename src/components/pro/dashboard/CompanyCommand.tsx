import { ArrowUpRight, Building2, CalendarDays, MapPin, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { AssignedCompanyProfile } from '@/lib/data/company-profile';

export type CompanyCommandLabels = {
  assignedCompany: string;
  lifecycle: string;
  jurisdiction: string;
  licenceExpiry: string;
  licenceMissing: string;
  legalProfile: string;
  profileSections: string;
  activationReadiness: string;
  ready: string;
  blockers: string;
  registration: string;
  registrationUnavailable: string;
  openCompany: string;
  lifecycleValue: string;
  onboardingValue: string;
};

export function CompanyCommand({
  company,
  tenantSlug,
  locale,
  labels,
}: {
  company: AssignedCompanyProfile;
  tenantSlug: string;
  locale: string;
  labels: CompanyCommandLabels;
}) {
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  const completedSections = Object.values(company.sectionProgress).filter(
    (status) => status === 'complete',
  ).length;
  const totalSections = Object.keys(company.sectionProgress).length;

  return (
    <section
      className="signal-company-command signal-panel relative overflow-hidden rounded-xl border p-5"
      aria-labelledby="assigned-company-command"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-1/3 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--brand-accent)_18%,transparent),transparent_70%)]"
      />
      <div className="relative grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)]">
        <div className="min-w-0 border-b pb-5 lg:border-e lg:border-b-0 lg:pe-5 lg:pb-0">
          <p className="text-signal-accent-copy font-mono text-[11px] tracking-[0.14em] uppercase">
            {labels.assignedCompany}
          </p>
          <div className="mt-3 flex min-w-0 items-start gap-3">
            <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <Building2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="assigned-company-command" className="truncate text-xl font-semibold">
                {company.companyName}
              </h2>
              <Badge variant="secondary" className="mt-2">
                {labels.lifecycle}: {labels.lifecycleValue}
              </Badge>
            </div>
          </div>
          <dl className="text-muted-foreground mt-4 grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              <dt className="sr-only">{labels.jurisdiction}</dt>
              <dd>{company.jurisdiction ?? labels.licenceMissing}</dd>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
              <dt>{labels.licenceExpiry}:</dt>
              <dd>
                {company.licenseExpiry
                  ? date.format(new Date(`${company.licenseExpiry}T00:00:00+04:00`))
                  : labels.licenceMissing}
              </dd>
            </div>
          </dl>
          <Link
            href={`/t/${encodeURIComponent(tenantSlug)}/company`}
            className="focus-visible:ring-ring mt-4 inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          >
            {labels.openCompany}
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="bg-muted/45 rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {labels.legalProfile}
            </p>
            <strong className="mt-2 block text-sm">{labels.onboardingValue}</strong>
            <p className="text-muted-foreground mt-1 text-xs">
              {labels.profileSections
                .replace('{complete}', number.format(completedSections))
                .replace('{total}', number.format(totalSections))}
            </p>
          </div>
          <div className="bg-muted/45 rounded-lg border p-3">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              {labels.activationReadiness}
            </p>
            <strong className="mt-2 block text-sm">
              {company.readinessCodes.length === 0 ? labels.ready : labels.blockers}
            </strong>
            <p className="text-muted-foreground mt-1 text-xs">
              {number.format(company.readinessCodes.length)}
            </p>
          </div>
          <div className="bg-muted/45 rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {labels.registration}
            </p>
            <strong className="mt-2 block text-sm">{labels.registrationUnavailable}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
