import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  Bell,
  Building2,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Settings,
  UserCheck,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CUSTOMER_SIGNAL_ORDER,
  buildCustomerPortalHref,
  composeCustomerActions,
  customerDeadlineUrgency,
  customerDubaiDate,
  summarizeCustomerDocuments,
  summarizeCustomerRequests,
  type CustomerActionCandidate,
  type CustomerWidgetState,
} from '@/lib/customer/customer-overview';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { loadCustomerAssignedPro } from '@/lib/data/customer-assigned-pro-loader';
import { loadCustomerOverview } from '@/lib/data/customer-overview-loader';
import { formatMoney } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations<'customer.overview'>>>;
const OVERVIEW_ROW_LIMIT = 6;

function stateText<T>(state: CustomerWidgetState<T>, t: Translator): string {
  if (state.kind === 'error') return t('states.error');
  if (state.kind === 'unavailable') return t('states.unavailable');
  if (state.kind === 'empty') return t('states.empty');
  return t('states.ready');
}

function dateOnly(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

function formatDate(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dubai', dateStyle: 'medium' }).format(
    parsed,
  );
}

function PanelState({ state, t }: { state: CustomerWidgetState<unknown>; t: Translator }) {
  if (state.kind === 'ready') return null;
  return (
    <p role="status" className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
      {stateText(state, t)}
    </p>
  );
}

function mapActionState<T>(
  state: CustomerWidgetState<T>,
  map: (value: T) => CustomerActionCandidate[],
): CustomerWidgetState<CustomerActionCandidate[]> {
  if (state.kind === 'ready') return { kind: 'ready', value: map(state.value) };
  if (state.kind === 'empty') return { kind: 'empty', value: [] };
  return state;
}

export default async function CustomerPortal({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const [t, locale] = await Promise.all([getTranslations('customer.overview'), getLocale()]);
  const [overview, assignment] =
    access.kind === 'authorized'
      ? await Promise.all([loadCustomerOverview(access), loadCustomerAssignedPro(access)])
      : [null, null];
  const company = access.kind === 'authorized' ? access.company : null;
  const href = (route: Parameters<typeof buildCustomerPortalHref>[1]) =>
    buildCustomerPortalHref(access.tenant.slug, route);
  const settingsHref = href('settings');
  const generatedAt = new Date();
  const generatedLabel = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(generatedAt);

  const paymentData = overview?.invoices.kind === 'ready' ? overview.invoices.value : null;
  const invoiceSummaries = paymentData?.totals.kind === 'complete' ? paymentData.totals.values : [];
  const requestSummary =
    overview?.documentRequests.kind === 'ready'
      ? summarizeCustomerRequests(overview.documentRequests.value, OVERVIEW_ROW_LIMIT)
      : null;
  const documentSummary =
    overview?.documents.kind === 'ready'
      ? summarizeCustomerDocuments(overview.documents.value, OVERVIEW_ROW_LIMIT)
      : null;
  const actionState = overview
    ? composeCustomerActions(
        {
          documents: mapActionState(overview.documentRequests, (value) =>
            summarizeCustomerRequests(value, OVERVIEW_ROW_LIMIT).rows.map((request) => ({
              kind: 'document-request',
              id: request.id,
              label: request.label,
              dueDate: customerDubaiDate(request.dueDate),
              href: href('documents'),
              actionable: request.status === 'pending',
              status: request.status,
            })),
          ),
          renewals: mapActionState(overview.renewals, (value) =>
            value.rows.map((renewal) => ({
              kind: 'renewal',
              id: renewal.id,
              label: renewal.label,
              dueDate: renewal.due_date,
              href: `${href('renewals')}?focus=${encodeURIComponent(renewal.id)}`,
              actionable: true,
              status: renewal.status,
            })),
          ),
          invoices: mapActionState(overview.invoices, (value) =>
            value.recent.map((invoice) => ({
              kind: 'invoice',
              id: invoice.id,
              label: invoice.label,
              dueDate: dateOnly(invoice.dueDate),
              href: `${href('payments')}/${encodeURIComponent(invoice.id)}`,
              // Viewing is safe, but payment is not actionable until an atomic initiation
              // contract exists. The invoice remains available in the finance panel.
              actionable: false,
              status: invoice.status,
            })),
          ),
        },
        generatedAt,
        6,
      )
    : ({ kind: 'unavailable' } as const);

  const onboardingStatus = company
    ? ['not_started', 'in_progress', 'ready_for_activation', 'completed', 'complete'].includes(
        company.onboardingStatus,
      )
      ? t(`registration.onboardingValues.${company.onboardingStatus}` as never)
      : t('states.unavailable')
    : t('states.unavailable');

  function signalValue(signal: (typeof CUSTOMER_SIGNAL_ORDER)[number]) {
    if (!overview) return t('states.unavailable');
    if (signal === 'registration') return onboardingStatus;
    if (signal === 'documents') {
      const state = overview.documentRequests;
      return state.kind === 'ready' && requestSummary
        ? t('boundedCount', {
            count: requestSummary.count.value,
            more: requestSummary.count.completeness === 'at-least' ? '+' : '',
          })
        : stateText(state, t);
    }
    if (signal === 'renewals') {
      const state = overview.renewals;
      return state.kind === 'ready' || state.kind === 'empty'
        ? t('boundedCount', {
            count: state.value.rows.length,
            more: state.value.hasMore ? '+' : '',
          })
        : stateText(state, t);
    }
    if (signal === 'invoices') {
      if (overview.invoices.kind === 'error') return t('states.error');
      if (overview.invoices.kind === 'unavailable') return t('states.unavailable');
      return t('invoices.exactOpenCount', { count: overview.invoices.value.openCount });
    }
    return t('notificationsUnavailable');
  }

  const signalHref: Partial<Record<(typeof CUSTOMER_SIGNAL_ORDER)[number], string>> = {
    registration: href('company'),
    documents: href('documents'),
    renewals: href('renewals'),
    invoices: href('payments'),
  };
  const signalIcons = {
    registration: Building2,
    documents: FileText,
    renewals: CalendarClock,
    invoices: CircleDollarSign,
    notifications: Bell,
  };

  return (
    <div className="signal-dashboard customer-overview space-y-4">
      <div className="signal-dashboard__masthead customer-overview__masthead">
        <strong>{t('masthead')}</strong>
        <time dateTime={generatedAt.toISOString()}>
          {t('generatedAt', { date: generatedLabel })}
        </time>
      </div>
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{company ? t('title', { company: company.companyName }) : t('titleUnavailable')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {access.kind === 'unlinked' ? t('unlinked') : t('subtitle')}
        </p>
      </header>

      <section
        aria-label={t('signalsLabel')}
        className="customer-overview__signals grid gap-3 md:grid-cols-5"
      >
        {CUSTOMER_SIGNAL_ORDER.map((signal, index) => {
          const Icon = signalIcons[signal];
          const content = (
            <>
              <Icon aria-hidden="true" className="size-4" />
              <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t(`signals.${signal}`)}
              </span>
              <strong className="mt-2 block text-lg">{signalValue(signal)}</strong>
            </>
          );
          const className = `signal-kpi signal-kpi--${['info', 'orange', 'warning', 'success', 'info'][index]} relative min-w-0 rounded-xl border p-4`;
          return signalHref[signal] ? (
            <Link key={signal} href={signalHref[signal]} className={className}>
              {content}
            </Link>
          ) : (
            <div key={signal} className={className}>
              {content}
            </div>
          );
        })}
      </section>

      <div className="signal-dashboard__layout">
        <div className="signal-dashboard__operations">
          <Card className="signal-panel customer-overview__registration">
            <CardHeader>
              <CardTitle>{t('registration.title')}</CardTitle>
              <CardDescription>{t('registration.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground text-xs">{t('registration.lifecycle')}</span>
                <strong className="block">
                  {company ? t(`lifecycle.${company.status}` as never) : t('states.unavailable')}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  {t('registration.legalProfile')}
                </span>
                <strong className="block">{onboardingStatus}</strong>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">{t('registration.readiness')}</span>
                <strong className="block">{t('registration.readinessUnavailable')}</strong>
              </div>
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm sm:col-span-3"
              >
                {t('registrationUnavailable')}
              </p>
              <Link className="text-primary text-sm font-semibold" href={href('company')}>
                {t('view')}
              </Link>
            </CardContent>
          </Card>

          <Card className="signal-panel customer-overview__actions">
            <CardHeader>
              <CardTitle>{t('actions.title')}</CardTitle>
              <CardDescription>{t('actions.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {actionState.kind === 'error' || actionState.kind === 'unavailable' ? (
                <PanelState state={actionState} t={t} />
              ) : actionState.kind === 'empty' ? (
                <p className="text-muted-foreground text-sm">{t('actions.empty')}</p>
              ) : (
                <>
                  {actionState.kind === 'partial' ? (
                    <p role="status" className="text-muted-foreground mb-2 text-sm">
                      {stateText({ kind: actionState.sourceState }, t)}
                    </p>
                  ) : null}
                  <ol className="divide-border divide-y">
                    {actionState.value.map((action) => (
                      <li
                        key={`${action.kind}:${action.id}`}
                        className="flex min-w-0 items-center gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{action.label}</strong>
                          <span className="text-muted-foreground text-xs">
                            {t(`actions.kinds.${action.kind}`)} ·{' '}
                            {t(`urgency.${customerDeadlineUrgency(action.dueDate, generatedAt)}`)}
                          </span>
                        </div>
                        <Link
                          className="text-primary text-sm font-semibold underline-offset-4 hover:underline"
                          href={action.href}
                        >
                          {t('open')}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-3 xl:grid-cols-3">
            <Card className="signal-panel customer-overview__documents">
              <CardHeader>
                <CardTitle>{t('documents.title')}</CardTitle>
                <CardDescription>{t('documents.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {overview ? (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-semibold tracking-wide uppercase">
                        {t('documents.requested')}
                      </p>
                      <PanelState state={overview.documentRequests} t={t} />
                      {requestSummary ? (
                        <p className="text-lg font-semibold">
                          {t('documents.requestedCount', {
                            count: requestSummary.count.value,
                            more: requestSummary.count.completeness === 'at-least' ? '+' : '',
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <p className="mb-1 text-xs font-semibold tracking-wide uppercase">
                        {t('documents.submitted')}
                      </p>
                      <PanelState state={overview.documents} t={t} />
                      {documentSummary ? (
                        <p className="text-lg font-semibold">
                          {t('documents.submittedSummary', {
                            submitted: documentSummary.submitted.value,
                            submittedMore:
                              documentSummary.submitted.completeness === 'at-least' ? '+' : '',
                          })}
                        </p>
                      ) : null}
                      {documentSummary &&
                      documentSummary.reviewed.kind === 'complete' &&
                      documentSummary.rejected.kind === 'complete' ? (
                        <p className="text-muted-foreground text-sm">
                          {t('documents.statusSummary', {
                            reviewed: documentSummary.reviewed.value,
                            rejected: documentSummary.rejected.value,
                          })}
                        </p>
                      ) : documentSummary ? (
                        <p role="status" className="text-muted-foreground text-sm">
                          {t('documents.statusCountsUnavailable')}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <PanelState state={{ kind: 'unavailable' }} t={t} />
                )}
                <Link
                  className="text-primary mt-3 inline-block text-sm font-semibold"
                  href={href('documents')}
                >
                  {t('view')}
                </Link>
              </CardContent>
            </Card>
            <Card className="signal-panel customer-overview__employees">
              <CardHeader>
                <CardTitle>{t('employees.title')}</CardTitle>
                <CardDescription>{t('employees.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {overview ? <PanelState state={overview.employees} t={t} /> : null}
                {overview?.employees.kind === 'ready' ? (
                  <p className="text-lg font-semibold">
                    {t('employees.exactCount', { count: overview.employees.value })}
                  </p>
                ) : null}
                <Link
                  className="text-primary mt-3 inline-block text-sm font-semibold"
                  href={href('employees')}
                >
                  {t('view')}
                </Link>
              </CardContent>
            </Card>
            <Card className="signal-panel customer-overview__invoices">
              <CardHeader>
                <CardTitle>{t('invoices.title')}</CardTitle>
                <CardDescription>{t('invoices.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {overview ? (
                  <>
                    <PanelState state={overview.invoices} t={t} />
                    {overview.invoices.kind === 'ready' ? (
                      <p className="text-sm font-semibold">
                        {t('invoices.exactOpenCount', { count: overview.invoices.value.openCount })}
                      </p>
                    ) : null}
                    {invoiceSummaries.map((summary) => (
                      <p key={summary.currency} className="font-semibold">
                        {formatMoney(summary.amountMinor, summary.currency, locale)}{' '}
                        <span className="text-muted-foreground text-xs">
                          {t('invoices.openCount', { count: summary.count })}
                        </span>
                      </p>
                    ))}
                    {overview.invoices.kind === 'ready' &&
                    overview.invoices.value.totals.kind === 'unavailable' ? (
                      <p role="status" className="text-muted-foreground text-sm">
                        {t('invoices.totalsUnavailable')}
                      </p>
                    ) : null}
                    {overview.invoices.kind === 'ready' ? (
                      <ul className="mt-3 space-y-1">
                        {overview.invoices.value.recent.map((invoice) => (
                          <li key={invoice.id} className="text-sm">
                            <Link
                              className="font-medium underline-offset-4 hover:underline focus-visible:ring-2"
                              href={`${href('payments')}/${encodeURIComponent(invoice.id)}`}
                            >
                              {invoice.label}
                            </Link>{' '}
                            ·{' '}
                            {t(
                              `invoices.status.${
                                invoice.status === 'open' &&
                                customerDeadlineUrgency(invoice.dueDate, generatedAt) === 'overdue'
                                  ? 'overdue'
                                  : invoice.status
                              }` as never,
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <PanelState state={{ kind: 'unavailable' }} t={t} />
                )}
                <Link
                  className="text-primary mt-3 inline-block text-sm font-semibold"
                  href={href('payments')}
                >
                  {t('view')}
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('communications.title')}</CardTitle>
              <CardDescription>{t('communications.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {!overview ? (
                <PanelState state={{ kind: 'unavailable' }} t={t} />
              ) : (
                <PanelState state={overview.communications} t={t} />
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="signal-dashboard__rail">
          <Card className="signal-panel customer-overview__renewals">
            <CardHeader>
              <CardTitle>{t('renewals.title')}</CardTitle>
              <CardDescription>{t('renewals.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {!overview ? (
                <PanelState state={{ kind: 'unavailable' }} t={t} />
              ) : (
                <>
                  <PanelState state={overview.renewals} t={t} />
                  {(overview.renewals.kind === 'ready' || overview.renewals.kind === 'empty') && (
                    <ul className="space-y-3">
                      {overview.renewals.value.rows.slice(0, 5).map((row) => (
                        <li key={row.id}>
                          <Link className="block rounded-lg border p-3" href={href('renewals')}>
                            <strong className="block text-sm">{row.label}</strong>
                            <span className="text-muted-foreground text-xs">
                              {t(`renewalTypes.${row.type}` as never)} ·{' '}
                              {formatDate(row.due_date, locale, t('dateUnavailable'))} ·{' '}
                              {t(`urgency.${customerDeadlineUrgency(row.due_date, generatedAt)}`)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          <Card className="signal-panel customer-overview__notifications">
            <CardHeader>
              <CardTitle>{t('notifications.title')}</CardTitle>
              <CardDescription>{t('notifications.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
              >
                {t('notificationsUnavailable')}
              </p>
            </CardContent>
          </Card>
          <Card className="signal-panel customer-overview__assigned-pro">
            <CardHeader>
              <CardTitle>{t('assignedPro.title')}</CardTitle>
              <CardDescription>{t('assignedPro.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {!assignment ? (
                <PanelState state={{ kind: 'unavailable' }} t={t} />
              ) : assignment.kind === 'active' ? (
                <div className="space-y-2">
                  <strong className="block">
                    {assignment.value.fullName ?? t('assignedPro.nameUnavailable')}
                  </strong>
                  {assignment.value.title ? (
                    <span className="text-muted-foreground block text-sm">
                      {assignment.value.title}
                    </span>
                  ) : null}
                  <p role="status" className="text-muted-foreground text-sm">
                    {t('assignedPro.channelsUnavailable')}
                  </p>
                </div>
              ) : (
                <p role="status" className="text-muted-foreground text-sm">
                  {t(`assignedPro.${assignment.kind}`)}
                </p>
              )}
              <Link
                className="text-primary mt-3 inline-block text-sm font-semibold"
                href={href('pro')}
              >
                {t('view')}
              </Link>
            </CardContent>
          </Card>
          <Card className="signal-panel customer-overview__quick-actions">
            <CardHeader>
              <CardTitle>{t('quickActions.title')}</CardTitle>
              <CardDescription>{t('quickActions.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <nav aria-label={t('quickActions.label')} className="grid gap-2">
                {(
                  [
                    ['documents', FileText],
                    ['employees', Users],
                    ['payments', CircleDollarSign],
                    ['renewals', CalendarClock],
                    ['pro', UserCheck],
                    ['settings', Settings],
                  ] as const
                ).map(([route, Icon]) => (
                  <Link
                    key={route}
                    href={route === 'settings' ? settingsHref : href(route)}
                    className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {t(`quickActions.${route}`)}
                  </Link>
                ))}
              </nav>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
