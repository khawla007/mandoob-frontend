import Link from 'next/link';

import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { applicationSignalHref, type ApplicationScope } from '@/lib/signal-studio-filters';

import { signalLabel } from './widget-format';

type Velocity = ProDashboardData['caseVelocity'];

export type CompanySignalHeroLabels = {
  companyFallback: string;
  prioritySignals: string;
  actionSummary: string;
  openActionDeck: string;
  openCompany: string;
  activationReadiness: string;
  ready: string;
  actionRequired: string;
  registration: string;
  registrationUnavailable: string;
  velocityAria: string;
};

export type CompanySignalHeroProps = {
  company: AssignedCompanyProfile | null;
  dashboard: Pick<ProDashboardData, 'totalPrioritySignals' | 'caseVelocity'>;
  tenantSlug: string;
  locale: string;
  filters: ApplicationScope;
  readinessAvailable: boolean;
  labels: CompanySignalHeroLabels;
};

function velocityPoints(data: Velocity, key: 'opened' | 'completed', maximum: number) {
  const denominator = Math.max(1, data.length - 1);
  return data
    .map((point, index) => `${(index / denominator) * 100},${40 - (point[key] / maximum) * 34}`)
    .join(' ');
}

export function CompanySignalHero({
  company,
  dashboard,
  tenantSlug,
  locale,
  filters,
  readinessAvailable,
  labels,
}: CompanySignalHeroProps) {
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const graphData = dashboard.caseVelocity.slice(-14);
  const opened = graphData.reduce((sum, point) => sum + point.opened, 0);
  const completed = graphData.reduce((sum, point) => sum + point.completed, 0);
  const maximum = Math.max(1, ...graphData.flatMap((point) => [point.opened, point.completed]));
  const openedPoints = velocityPoints(graphData, 'opened', maximum);
  const completedPoints = velocityPoints(graphData, 'completed', maximum);
  const velocityValues = {
    opened: integer.format(opened),
    completed: integer.format(completed),
    days: integer.format(graphData.length),
  };
  const readiness = !readinessAvailable
    ? labels.actionRequired
    : company?.readinessCodes.length === 0
      ? labels.ready
      : labels.actionRequired;
  const applicationsHref = applicationSignalHref(tenantSlug, { view: 'open' }, filters);
  const companyHref = `/t/${encodeURIComponent(tenantSlug)}/company`;

  return (
    <section className="signal-hero relative isolate overflow-hidden rounded-[12px] p-[13px] text-white">
      <div aria-hidden="true" className="signal-hero__orb" />
      <div className="signal-hero__content">
        <p className="signal-hero__tag">
          <span aria-hidden="true">●</span> {integer.format(dashboard.totalPrioritySignals)}{' '}
          {labels.prioritySignals}
        </p>
        <h2>{company?.companyName ?? labels.companyFallback}</h2>
        <p>
          {labels.activationReadiness}: {readiness}
        </p>
        <dl className="signal-hero__facts">
          <div>
            <dt>{labels.registration}</dt>
            <dd>{labels.registrationUnavailable}</dd>
          </div>
          <div>
            <dt className="sr-only">{labels.prioritySignals}</dt>
            <dd>
              {integer.format(dashboard.totalPrioritySignals)} {labels.actionSummary}
            </dd>
          </div>
        </dl>
        <div className="signal-hero__actions">
          <Link href={applicationsHref} className="signal-hero__action-hot">
            {labels.openActionDeck}
          </Link>
          <Link href={companyHref} className="signal-hero__action-glass">
            {labels.openCompany}
          </Link>
        </div>
      </div>

      <div
        role="img"
        aria-label={signalLabel(labels.velocityAria, velocityValues)}
        className="signal-hero__chart"
      >
        <svg aria-hidden="true" viewBox="0 0 100 44" preserveAspectRatio="none">
          <path
            d="M0 10H100M0 25H100M0 40H100"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="0.4"
          />
          {openedPoints ? (
            <>
              <polygon points={`${openedPoints} 100,44 0,44`} fill="white" fillOpacity="0.22" />
              <polyline
                points={openedPoints}
                fill="none"
                stroke="white"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={completedPoints}
                fill="none"
                stroke="#ffb176"
                strokeWidth="1.2"
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>
      </div>
    </section>
  );
}
