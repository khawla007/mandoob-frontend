import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsBrandingCard } from '@/components/pro/SettingsBrandingCard';
import { SettingsContactCard } from '@/components/pro/SettingsContactCard';
import { SettingsSmtpCard } from '@/components/pro/SettingsSmtpCard';
import { SettingsSourceUnavailable } from '@/components/pro/SettingsSourceUnavailable';
import { SettingsWhatsAppCard } from '@/components/pro/SettingsWhatsAppCard';
import { SettingsWhiteLabelChecklist } from '@/components/pro/SettingsWhiteLabelChecklist';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { getTenantSettingsSnapshot } from '@/lib/data/tenant-settings';
import { buildTenantPath } from '@/lib/tenant/url';

export const dynamic = 'force-dynamic';

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const [t, snapshot] = await Promise.all([
    getTranslations('pro.settings'),
    getTenantSettingsSnapshot(tenant.id),
  ]);
  const branding =
    snapshot.branding.status === 'ready' && snapshot.branding.data
      ? snapshot.branding.data
      : {
          name: tenant.name,
          logo_url: null,
          favicon_url: null,
          primary_color: null,
          secondary_color: null,
        };
  const contact =
    snapshot.contact.status === 'ready' && snapshot.contact.data
      ? snapshot.contact.data
      : {
          email_sender_name: null,
          email_reply_to: null,
          terms_url: null,
          privacy_url: null,
        };

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-signal-accent-copy font-mono text-xs tracking-[0.14em] uppercase">
            {t('eyebrow')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('description')}</p>
        </div>
        <Badge variant="outline" className="min-h-8 w-fit px-3">
          {t('context.assignmentActive')}
        </Badge>
      </header>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="text-lg">{t('context.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>{t('context.company', { company: company.companyName })}</span>
          <span>{t('context.workspace', { workspace: tenant.name })}</span>
        </CardContent>
      </Card>

      <SettingsWhiteLabelChecklist
        workspaceHref={buildTenantPath(tenant.slug)}
        branding={snapshot.branding}
        contact={snapshot.contact}
        smtp={snapshot.smtp}
        whatsapp={snapshot.whatsapp}
      />

      {snapshot.branding.status === 'unavailable' ? (
        <SettingsSourceUnavailable title={t('branding.title')} message={t('sourceUnavailable')} />
      ) : (
        <SettingsBrandingCard slug={slug} initial={branding} />
      )}

      {snapshot.contact.status === 'unavailable' ? (
        <SettingsSourceUnavailable title={t('contact.title')} message={t('sourceUnavailable')} />
      ) : (
        <SettingsContactCard slug={slug} initial={contact} />
      )}

      {snapshot.smtp.status === 'unavailable' ? (
        <SettingsSourceUnavailable title={t('smtp.title')} message={t('sourceUnavailable')} />
      ) : (
        <SettingsSmtpCard slug={slug} initial={snapshot.smtp.data} />
      )}

      {snapshot.whatsapp.status === 'unavailable' ? (
        <SettingsSourceUnavailable title={t('whatsapp.title')} message={t('sourceUnavailable')} />
      ) : (
        <SettingsWhatsAppCard slug={slug} initial={snapshot.whatsapp.data} />
      )}
    </div>
  );
}
