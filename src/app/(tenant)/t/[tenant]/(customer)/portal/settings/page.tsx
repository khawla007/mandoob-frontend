import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { optInSelfCommsAction } from '@/app/account/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadCustomerCommunicationConsent } from '@/lib/customer/customer-communication-consent';
import { readSelfProfile } from '@/lib/data/account-self';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { getTenantBrandingSource } from '@/lib/data/tenant-settings';
import { buildTenantBrandingView } from '@/lib/tenant/branding';

export const dynamic = 'force-dynamic';

export default async function CustomerSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const [t, brandingSource, profileSource] = await Promise.all([
    getTranslations('customer.settings'),
    getTenantBrandingSource(access.tenant.id),
    readSelfProfile().then(
      (profile) => ({ status: 'ready' as const, profile }),
      () => ({ status: 'unavailable' as const, profile: null }),
    ),
  ]);
  const company = access.kind === 'authorized' ? access.company : null;
  const branding =
    brandingSource.status === 'ready' && brandingSource.data
      ? buildTenantBrandingView(brandingSource.data)
      : null;
  const erasureHref = `/t/${encodeURIComponent(access.tenant.slug)}/portal/account/erasure`;
  const settingsHref = `/t/${encodeURIComponent(access.tenant.slug)}/portal/settings`;
  const communicationConsent = await loadCustomerCommunicationConsent(
    profileSource.status === 'ready' && profileSource.profile.id === access.session.id
      ? profileSource.profile.phone
      : null,
  );

  return (
    <div className="signal-dashboard space-y-4">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="signal-panel">
          <CardHeader>
            <CardTitle>{t('account.title')}</CardTitle>
            <CardDescription>{t('account.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <nav aria-label={t('account.label')} className="grid gap-2">
              <Link className="rounded-lg border p-3 font-medium" href="/account">
                {t('account.profile')}
              </Link>
              <Link className="rounded-lg border p-3 font-medium" href="/account/security">
                {t('account.security')}
              </Link>
              <Link className="rounded-lg border p-3 font-medium" href="/account/security">
                {t('account.mfa')}
              </Link>
              <span
                aria-disabled="true"
                className="text-muted-foreground rounded-lg border border-dashed p-3"
              >
                {t('account.sessionsUnavailable')}
              </span>
            </nav>
          </CardContent>
        </Card>
        <Card className="signal-panel">
          <CardHeader>
            <CardTitle>{t('company.title')}</CardTitle>
            <CardDescription>{t('company.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <dt className="text-muted-foreground text-xs">{t('company.label')}</dt>
              <dd className="mt-1 font-medium">
                {company ? company.companyName : t('unavailable')}
              </dd>
            </dl>
          </CardContent>
        </Card>
        <Card className="signal-panel">
          <CardHeader>
            <CardTitle>{t('legal.title')}</CardTitle>
            <CardDescription>{t('legal.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {brandingSource.status === 'unavailable' ? (
              <p role="status" className="text-muted-foreground">
                {t('unavailable')}
              </p>
            ) : (
              <>
                {branding?.termsUrl ? (
                  <Link
                    className="text-primary font-medium"
                    href={branding.termsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('legal.terms')}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t('legal.termsUnavailable')}</span>
                )}
                {branding?.privacyUrl ? (
                  <Link
                    className="text-primary font-medium"
                    href={branding.privacyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('legal.privacy')}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t('legal.privacyUnavailable')}</span>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="signal-panel">
          <CardHeader>
            <CardTitle>{t('privacy.title')}</CardTitle>
            <CardDescription>{t('privacy.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link className="text-primary font-medium" href={erasureHref}>
              {t('privacy.erasure')}
            </Link>
          </CardContent>
        </Card>
        <Card className="signal-panel lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('communications.title')}</CardTitle>
            <CardDescription>{t('communications.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {communicationConsent.kind === 'opted-out' ? (
              <div className="rounded-lg border p-4">
                <p role="status" className="text-sm">
                  {t('communications.optedOut', {
                    channels: communicationConsent.channels
                      .map((channel) => t(`communications.channels.${channel}`))
                      .join(', '),
                  })}
                </p>
                <form action={optInSelfCommsAction as never} className="mt-3">
                  <input type="hidden" name="confirmation" value="OPT IN" />
                  <input type="hidden" name="returnPath" value={settingsHref} />
                  <button
                    className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
                    type="submit"
                  >
                    {t('communications.optIn')}
                  </button>
                </form>
              </div>
            ) : (
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-4"
              >
                {t('communications.consentUnavailable')}
              </p>
            )}
            <p role="status" className="text-muted-foreground rounded-lg border border-dashed p-4">
              {t('communications.preferencesUnavailable')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
