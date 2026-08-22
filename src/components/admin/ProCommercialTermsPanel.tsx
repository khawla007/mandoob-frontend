import { CircleDollarSign } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAedMinor } from '@/lib/data/pro-commercial-terms';
import type { ProLifecycleDetail } from '@/lib/data/pro-lifecycle-detail';
import { ProCommercialTermForm } from './ProCommercialTermForm';

type Term = ProLifecycleDetail['commercialTerms'][number];

function actionable(terms: Term[]): Term | null {
  return (
    terms.find((term) => term.status === 'active') ??
    terms.find((term) => term.status === 'draft') ??
    null
  );
}

export async function ProCommercialTermsPanel({
  userId,
  terms,
}: {
  userId: string;
  terms: ProLifecycleDetail['commercialTerms'];
}) {
  const [t, locale] = await Promise.all([getTranslations('admin.user.proLifecycle'), getLocale()]);
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
            const matches = terms.filter((term) => term.termKind === termKind);
            const current = actionable(matches);
            return (
              <section key={termKind} className="min-w-0 space-y-3">
                <h3 className="font-medium">{t(`terms.${termKind}Title`)}</h3>
                {current ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">{t('terms.amount')}</dt>
                      <dd className="mt-1 tabular-nums">
                        {formatAedMinor(current.amountMinor, locale === 'ar' ? 'ar-AE' : 'en-AE')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">{t('terms.status')}</dt>
                      <dd className="mt-1">
                        <Badge variant={current.status === 'active' ? 'default' : 'outline'}>
                          {t(`terms.statuses.${current.status}`)}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">{t('terms.model')}</dt>
                      <dd className="mt-1">{t(`terms.models.${current.model}`)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">{t('terms.effectiveFrom')}</dt>
                      <dd className="mt-1" dir="ltr">
                        {current.effectiveFrom}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('terms.empty')}</p>
                )}
                <ProCommercialTermForm
                  key={`${current?.termId ?? termKind}-${current?.status ?? 'none'}-${current?.version ?? 0}`}
                  userId={userId}
                  termKind={termKind}
                  term={current}
                />
              </section>
            );
          })}
        </div>
        {terms.length ? (
          <div className="overflow-x-auto" role="region" aria-label={t('terms.historyLabel')}>
            <table className="w-full min-w-2xl text-start text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.kind')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.model')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.amount')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('terms.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.termId} className="border-b last:border-0">
                    <td className="p-2">{t(`terms.kinds.${term.termKind}`)}</td>
                    <td className="p-2">{t(`terms.models.${term.model}`)}</td>
                    <td className="p-2 tabular-nums">
                      {formatAedMinor(term.amountMinor, locale === 'ar' ? 'ar-AE' : 'en-AE')}
                    </td>
                    <td className="p-2">{t(`terms.statuses.${term.status}`)}</td>
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
