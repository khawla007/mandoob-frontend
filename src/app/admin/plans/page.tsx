import { getLocale, getTranslations } from 'next-intl/server';
import { randomUUID } from 'node:crypto';

import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { PlanCatalogEditor } from '@/components/finance/PlanCatalogEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { listCatalogVersions } from '@/lib/finance/catalog-repository';
import { activateCatalogAction, cloneCatalogAction, editCatalogAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  await requirePlatformOperator();
  const [t, locale, catalogs] = await Promise.all([
    getTranslations('admin.management.plans'),
    getLocale(),
    listCatalogVersions(),
  ]);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <section className="grid min-w-0 gap-4 lg:grid-cols-2" aria-label={t('catalogs')}>
        {catalogs.map((catalog) => (
          <PlanCatalogEditor
            key={catalog.id}
            title={catalog.label}
            description={catalog.catalogKey}
            stateLabel={t(`states.${catalog.state}`)}
          >
            <div className="space-y-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t('version')}</dt>
                  <dd className="font-mono break-all">{catalog.catalogKey}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('class')}</dt>
                  <dd>{t(`classes.${catalog.catalogClass}`)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('currency')}</dt>
                  <dd>{catalog.currency}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('revision')}</dt>
                  <dd>{catalog.revision}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('effectiveFrom')}</dt>
                  <dd>
                    {catalog.effectiveFrom
                      ? date.format(new Date(catalog.effectiveFrom))
                      : t('notScheduled')}
                  </dd>
                </div>
              </dl>
              <div>
                <h2 className="text-sm font-semibold">{t('providers')}</h2>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {catalog.providers.map((provider) => (
                    <li
                      className="bg-muted rounded-md px-2 py-1"
                      key={`${provider.provider}-${provider.destination}`}
                    >
                      {provider.provider} · {provider.destination} ·{' '}
                      {provider.enabled ? t('enabled') : t('disabled')}
                    </li>
                  ))}
                </ul>
              </div>
              {catalog.state === 'draft' ? (
                <div className="space-y-4 border-t pt-4">
                  <form
                    action={editCatalogAction}
                    className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="versionId" value={catalog.id} />
                    <input type="hidden" name="expectedRevision" value={catalog.revision} />
                    <input type="hidden" name="operationId" value={randomUUID()} />
                    <div className="space-y-2">
                      <Label htmlFor={`label-${catalog.id}`}>{t('label')}</Label>
                      <Input
                        id={`label-${catalog.id}`}
                        name="label"
                        defaultValue={catalog.label}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`edit-review-${catalog.id}`}>{t('reviewReference')}</Label>
                      <Input id={`edit-review-${catalog.id}`} name="reviewReference" required />
                    </div>
                    <Button type="submit" variant="outline" className="min-h-11">
                      {t('edit')}
                    </Button>
                  </form>
                  <form
                    action={activateCatalogAction}
                    className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="versionId" value={catalog.id} />
                    <input type="hidden" name="expectedRevision" value={catalog.revision} />
                    <input type="hidden" name="operationId" value={randomUUID()} />
                    <input type="hidden" name="effectiveFrom" value={new Date().toISOString()} />
                    <div className="space-y-2">
                      <Label htmlFor={`activate-review-${catalog.id}`}>
                        {t('reviewReference')}
                      </Label>
                      <Input id={`activate-review-${catalog.id}`} name="reviewReference" required />
                    </div>
                    <Button type="submit" className="min-h-11">
                      {t('activate')}
                    </Button>
                  </form>
                </div>
              ) : (
                <form
                  action={cloneCatalogAction}
                  className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="sourceVersionId" value={catalog.id} />
                  <input type="hidden" name="operationId" value={randomUUID()} />
                  <div className="space-y-2">
                    <Label htmlFor={`clone-review-${catalog.id}`}>{t('reviewReference')}</Label>
                    <Input id={`clone-review-${catalog.id}`} name="reviewReference" required />
                  </div>
                  <Button type="submit" variant="outline" className="min-h-11">
                    {t('clone')}
                  </Button>
                </form>
              )}
            </div>
          </PlanCatalogEditor>
        ))}
      </section>
    </div>
  );
}
