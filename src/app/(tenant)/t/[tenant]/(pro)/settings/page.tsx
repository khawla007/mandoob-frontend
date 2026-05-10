import { notFound } from 'next/navigation';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  getTenantBranding,
  getTenantContact,
  getTenantSmtpRedacted,
  getTenantWhatsAppRedacted,
} from '@/lib/data/tenant-settings';
import { SettingsBrandingCard } from '@/components/pro/SettingsBrandingCard';
import { SettingsContactCard } from '@/components/pro/SettingsContactCard';
import { SettingsSmtpCard } from '@/components/pro/SettingsSmtpCard';
import { SettingsWhatsAppCard } from '@/components/pro/SettingsWhatsAppCard';
import { SettingsWhiteLabelChecklist } from '@/components/pro/SettingsWhiteLabelChecklist';
import { buildTenantUrl } from '@/lib/tenant/url';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [branding, contact, smtp, whatsapp] = await Promise.all([
    getTenantBranding(tenant.id),
    getTenantContact(tenant.id),
    getTenantSmtpRedacted(tenant.id),
    getTenantWhatsAppRedacted(tenant.id),
  ]);
  const brandingValue = branding ?? {
    name: tenant.name,
    logo_url: null,
    favicon_url: null,
    primary_color: null,
    secondary_color: null,
  };
  const contactValue = contact ?? {
    email_sender_name: null,
    email_reply_to: null,
    terms_url: null,
    privacy_url: null,
  };

  return (
    <div className="space-y-6">
      <SettingsWhiteLabelChecklist
        workspaceUrl={buildTenantUrl({ slug: tenant.slug, rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN })}
        branding={brandingValue}
        contact={contactValue}
        smtp={smtp}
        whatsapp={whatsapp}
      />

      <SettingsBrandingCard slug={slug} initial={brandingValue} />

      <SettingsContactCard slug={slug} initial={contactValue} />

      <SettingsSmtpCard slug={slug} initial={smtp} />

      <SettingsWhatsAppCard slug={slug} initial={whatsapp} />
    </div>
  );
}
