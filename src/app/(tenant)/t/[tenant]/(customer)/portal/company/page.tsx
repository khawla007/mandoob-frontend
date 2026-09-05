import { getLocale, getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CustomerWidgetState } from '@/lib/customer/customer-overview';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { loadCustomerCompanyDisplay } from '@/lib/data/customer-company-display-loader';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations<'customer.company'>>>;

function formatDate(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? fallback
    : new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dubai', dateStyle: 'medium' }).format(date);
}

function Field({
  label,
  value,
  fallback,
}: {
  label: string;
  value: React.ReactNode;
  fallback: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium break-words">{value ?? fallback}</dd>
    </div>
  );
}

function SourceState({ state, t }: { state: CustomerWidgetState<unknown>; t: Translator }) {
  if (state.kind === 'ready') return null;
  return (
    <p role="status" className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
      {t(`states.${state.kind}`)}
    </p>
  );
}

export default async function CustomerCompanyPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const [t, locale] = await Promise.all([getTranslations('customer.company'), getLocale()]);
  const company = access.kind === 'authorized' ? await loadCustomerCompanyDisplay(access) : null;

  return (
    <div className="signal-dashboard space-y-4">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {access.kind === 'authorized' ? t('subtitle') : t('unavailableContext')}
        </p>
      </header>

      {!company ? (
        <Card className="signal-panel">
          <CardContent>
            <p role="status" className="text-muted-foreground text-sm">
              {t('unavailableContext')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Card className="signal-panel xl:col-span-2">
            <CardHeader>
              <CardTitle>{t('legal.title')}</CardTitle>
              <CardDescription>{t('legal.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceState state={company.legalIdentity} t={t} />
              {company.legalIdentity.kind === 'ready' ? (
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label={t('fields.companyName')}
                    value={company.legalIdentity.value.companyName}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.displayName')}
                    value={company.legalIdentity.value.displayName}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.jurisdictionType')}
                    value={
                      company.legalIdentity.value.jurisdictionType
                        ? t(
                            `jurisdictions.${company.legalIdentity.value.jurisdictionType}` as never,
                          )
                        : null
                    }
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.licensingAuthority')}
                    value={company.legalIdentity.value.licensingAuthority}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.legalStructure')}
                    value={company.legalIdentity.value.legalStructure}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.tradeLicense')}
                    value={company.legalIdentity.value.tradeLicenseNumber}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.licenseExpiry')}
                    value={formatDate(
                      company.legalIdentity.value.licenseExpiry,
                      locale,
                      t('notProvided'),
                    )}
                    fallback={t('notProvided')}
                  />
                </dl>
              ) : null}
            </CardContent>
          </Card>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('shareholders.title')}</CardTitle>
              <CardDescription>{t('shareholders.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceState state={company.shareholders} t={t} />
              {company.shareholders.kind === 'ready' ? (
                <ul className="divide-border divide-y">
                  {company.shareholders.value.map((row) => (
                    <li key={row.id} className="grid gap-1 py-3 sm:grid-cols-2">
                      <strong className="break-words">{row.displayName ?? t('notProvided')}</strong>
                      <span>{t(`shareholderKinds.${row.kind}`)}</span>
                      <span>{row.nationality ?? t('notProvided')}</span>
                      <span>
                        {new Intl.NumberFormat(locale, {
                          style: 'percent',
                          maximumFractionDigits: 4,
                        }).format(row.ownershipPercent / 100)}
                      </span>
                      {row.protectedIdentifier ? (
                        <span className="font-mono text-sm">{row.protectedIdentifier}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('activities.title')}</CardTitle>
              <CardDescription>{t('activities.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceState state={company.activities} t={t} />
              {company.activities.kind === 'ready' ? (
                <ul className="divide-border divide-y">
                  {company.activities.value.map((row) => (
                    <li key={row.id} className="py-3">
                      <strong className="block">{row.name}</strong>
                      <span className="text-muted-foreground text-sm">
                        {row.code} · {row.authority}
                        {row.isPrimary ? ` · ${t('activities.primary')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('office.title')}</CardTitle>
              <CardDescription>{t('office.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceState state={company.office} t={t} />
              {company.office.kind === 'ready' && company.office.value ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('fields.officeType')}
                    value={t(`officeTypes.${company.office.value.officeType}` as never)}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.address')}
                    value={company.office.value.address || null}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.provider')}
                    value={company.office.value.providerName}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.leaseExpiry')}
                    value={formatDate(company.office.value.leaseExpiry, locale, t('notProvided'))}
                    fallback={t('notProvided')}
                  />
                </dl>
              ) : null}
            </CardContent>
          </Card>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('establishment.title')}</CardTitle>
              <CardDescription>{t('establishment.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceState state={company.establishment} t={t} />
              {company.establishment.kind === 'ready' && company.establishment.value ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('fields.establishmentCard')}
                    value={company.establishment.value.cardMasked}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.establishmentExpiry')}
                    value={formatDate(company.establishment.value.expiry, locale, t('notProvided'))}
                    fallback={t('notProvided')}
                  />
                </dl>
              ) : null}
            </CardContent>
          </Card>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('bank.title')}</CardTitle>
              <CardDescription>{t('bank.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceState state={company.bank} t={t} />
              {company.bank.kind === 'ready' && company.bank.value ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('fields.bankName')}
                    value={company.bank.value.bankName}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.accountHolder')}
                    value={company.bank.value.accountHolderName}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.currency')}
                    value={company.bank.value.currencyCode}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.iban')}
                    value={company.bank.value.ibanMasked}
                    fallback={t('notProvided')}
                  />
                  <Field
                    label={t('fields.accountNumber')}
                    value={company.bank.value.accountNumberMasked}
                    fallback={t('notProvided')}
                  />
                </dl>
              ) : null}
            </CardContent>
          </Card>

          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('status.title')}</CardTitle>
              <CardDescription>{t('status.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-xs">{t('status.lifecycle')}</p>
                <SourceState state={company.lifecycle} t={t} />
                {company.lifecycle.kind === 'ready' ? (
                  <strong>{t(`lifecycle.${company.lifecycle.value}` as never)}</strong>
                ) : null}
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t('status.onboarding')}</p>
                <SourceState state={company.onboarding} t={t} />
                {company.onboarding.kind === 'ready' ? (
                  <strong>{t(`onboarding.${company.onboarding.value}` as never)}</strong>
                ) : null}
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t('status.readiness')}</p>
                <SourceState state={company.readiness} t={t} />
              </div>
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm sm:col-span-3"
              >
                {t('deepUnavailable')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
