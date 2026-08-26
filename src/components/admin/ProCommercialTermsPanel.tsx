import { CircleDollarSign } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAedMinor, type ProCommercialTerm } from '@/lib/data/pro-commercial-terms';
import { ProCommercialTermForm } from './ProCommercialTermForm';
import { formatProCommercialDate } from './pro-lifecycle-ui';
import { ProTermStatusBadge } from './ProLifecycleStatusBadge';
import { ProLifecycleRecoveryPanel } from './ProLifecycleRecoveryPanel';

export type ProTermsSourceState = { kind: 'ready'; terms: ProCommercialTerm[] } | { kind: 'error' };

export async function ProCommercialTermsPanel({
  userId,
  terms,
  sourceState,
}: {
  userId: string;
  terms: ProCommercialTerm[];
  sourceState?: ProTermsSourceState;
}) {
  const [t, locale] = await Promise.all([getTranslations('admin.user.proLifecycle'), getLocale()]);
  const resolved = sourceState ?? { kind: 'ready', terms };
  if (resolved.kind === 'error') {
    return (
      <ProLifecycleRecoveryPanel
        title={t('terms.title')}
        description={t('terms.loadError')}
        retryLabel={t('terms.retry')}
        formLabel={t('terms.retryFormLabel')}
        action={`/admin/users/${userId}`}
      />
    );
  }
  const availableTerms = resolved.terms;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('terms.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="bg-muted/50 flex gap-3 rounded-lg p-3 text-sm">
          <CircleDollarSign aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{t('terms.disclaimer')}</p>
        </div>
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          {(['pricing', 'compensation'] as const).map((termKind) => {
            const matches = availableTerms.filter((term) => term.termKind === termKind);
            const active = matches.find((term) => term.status === 'active');
            const draft = matches.find((term) => term.status === 'draft');
            const actionable = [active, draft].filter(
              (term): term is NonNullable<typeof term> => term !== undefined,
            );
            return (
              <section key={termKind} className="min-w-0 space-y-3">
                <h3 className="font-medium">{t(`terms.${termKind}Title`)}</h3>
                {actionable.length ? (
                  <div className="space-y-5">
                    {actionable.map((current) => (
                      <div
                        key={current.termId}
                        className="border-border space-y-3 rounded-lg border p-4"
                      >
                        <dl className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-muted-foreground text-xs">{t('terms.amount')}</dt>
                            <dd className="mt-1 tabular-nums" dir="ltr">
                              {formatAedMinor(
                                current.amountMinor,
                                locale === 'ar' ? 'ar-AE' : 'en-AE',
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">{t('terms.status')}</dt>
                            <dd className="mt-1">
                              <ProTermStatusBadge
                                status={current.status}
                                label={t(`terms.statuses.${current.status}`)}
                              />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">{t('terms.model')}</dt>
                            <dd className="mt-1">{t(`terms.models.${current.model}`)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              {t('terms.effectivePeriod')}
                            </dt>
                            <dd className="mt-1">
                              <time dateTime={current.effectiveFrom} dir="ltr">
                                {formatProCommercialDate(current.effectiveFrom, locale)}
                              </time>{' '}
                              –{' '}
                              {current.effectiveTo ? (
                                <time dateTime={current.effectiveTo} dir="ltr">
                                  {formatProCommercialDate(current.effectiveTo, locale)}
                                </time>
                              ) : (
                                t('terms.ongoing')
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">{t('terms.interval')}</dt>
                            <dd className="mt-1">
                              {current.retainerInterval
                                ? t(`terms.intervals.${current.retainerInterval}`)
                                : t('terms.notApplicable')}
                            </dd>
                          </div>
                        </dl>
                        <ProCommercialTermForm userId={userId} termKind={termKind} term={current} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('terms.empty')}</p>
                )}
                {!draft ? (
                  <ProCommercialTermForm userId={userId} termKind={termKind} term={null} />
                ) : null}
              </section>
            );
          })}
        </div>
        {availableTerms.length ? (
          <div
            className="overflow-x-auto"
            role="region"
            aria-label={t('terms.historyLabel')}
            tabIndex={0}
          >
            <table className="w-full min-w-[64rem] text-start text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.kind')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.model')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.interval')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.amount')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.effectivePeriod')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.status')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.version')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {availableTerms.map((term) => (
                  <tr key={term.termId} className="border-b last:border-0">
                    <td className="p-2">{t(`terms.kinds.${term.termKind}`)}</td>
                    <td className="p-2">{t(`terms.models.${term.model}`)}</td>
                    <td className="p-2">
                      {term.retainerInterval
                        ? t(`terms.intervals.${term.retainerInterval}`)
                        : t('terms.notApplicable')}
                    </td>
                    <td className="p-2 tabular-nums" dir="ltr">
                      {formatAedMinor(term.amountMinor, locale === 'ar' ? 'ar-AE' : 'en-AE')}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <time dateTime={term.effectiveFrom} dir="ltr">
                        {formatProCommercialDate(term.effectiveFrom, locale)}
                      </time>{' '}
                      –{' '}
                      {term.effectiveTo ? (
                        <time dateTime={term.effectiveTo} dir="ltr">
                          {formatProCommercialDate(term.effectiveTo, locale)}
                        </time>
                      ) : (
                        t('terms.ongoing')
                      )}
                    </td>
                    <td className="p-2">
                      <ProTermStatusBadge
                        status={term.status}
                        label={t(`terms.statuses.${term.status}`)}
                      />
                    </td>
                    <td className="p-2 font-mono tabular-nums" dir="ltr">
                      {term.version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
