import Link from 'next/link';
import type { AdminCommandDashboard } from '@/lib/data/admin-command-dashboard';
import type { KpiId, WidgetState, KpiDatum } from '@/lib/admin-dashboard/contracts';
import { ADMIN_DASHBOARD_LINKS } from '@/lib/admin-dashboard/links';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

const HERO_FACTS: readonly KpiId[] = [
  'unassignedCompanies',
  'unassignedPros',
  'pendingRenewals',
  'pendingPayments',
];

function stateValue(state: WidgetState<KpiDatum>, locale: string, t: Translate): string {
  if (state.state === 'data' || state.state === 'empty') {
    return new Intl.NumberFormat(locale).format(state.data.value);
  }
  return state.state === 'error'
    ? t('dashboard.command.error.title')
    : t('dashboard.command.unavailable.title');
}

export function PlatformSignalHero({
  dashboard,
  locale,
  t,
}: {
  dashboard: AdminCommandDashboard;
  locale: string;
  t: Translate;
}) {
  const funnelRows =
    dashboard.leadFunnel.state === 'data' || dashboard.leadFunnel.state === 'empty'
      ? dashboard.leadFunnel.data
      : [];
  const funnelAvailable =
    dashboard.leadFunnel.state === 'data' || dashboard.leadFunnel.state === 'empty';
  const maximum = Math.max(1, ...funnelRows.map((row) => row.count));

  return (
    <section
      data-platform-signal
      className="admin-platform-signal"
      aria-labelledby="platform-signal-title"
    >
      <div aria-hidden="true" className="admin-platform-signal__mesh" />
      <div className="admin-platform-signal__content">
        <p className="admin-platform-signal__tag">{t('dashboard.command.hero.tag')}</p>
        <h2 id="platform-signal-title">{t('dashboard.command.hero.title')}</h2>
        <p className="admin-platform-signal__description">
          {t('dashboard.command.hero.description')}
        </p>
        <dl className="admin-platform-signal__facts">
          {HERO_FACTS.map((id) => (
            <div key={id} data-hero-fact={id} data-widget-state={dashboard.kpis[id].state}>
              <dt>{t(`dashboard.command.kpis.${id}.label`)}</dt>
              <dd>{stateValue(dashboard.kpis[id], locale, t)}</dd>
            </div>
          ))}
        </dl>
        <div className="admin-platform-signal__actions">
          <Link
            href={ADMIN_DASHBOARD_LINKS.leads}
            className="admin-platform-signal__action-primary"
          >
            {t('dashboard.command.actions.leads')}
          </Link>
          <Link
            href={ADMIN_DASHBOARD_LINKS.companies}
            className="admin-platform-signal__action-secondary"
          >
            {t('dashboard.command.actions.companies')}
          </Link>
        </div>
      </div>
      <div className="admin-platform-signal__visual">
        <p>{t('dashboard.command.hero.funnel')}</p>
        {funnelAvailable ? (
          <div className="admin-platform-signal__bars" aria-hidden="true">
            {funnelRows.map((row) => (
              <span key={row.stage} data-hero-stage={row.stage}>
                {row.count > 0 ? (
                  <i
                    data-signal-mark={row.stage}
                    style={{ height: `${(row.count / maximum) * 100}%` }}
                  />
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <p role="status" className="admin-platform-signal__visual-state">
            {dashboard.leadFunnel.state === 'error'
              ? t('dashboard.command.error.short')
              : t('dashboard.command.unavailable.title')}
          </p>
        )}
      </div>
    </section>
  );
}
