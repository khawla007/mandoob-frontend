import { notFound } from 'next/navigation';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  getTenantBranding,
  getTenantContact,
  getTenantSmtpRedacted,
} from '@/lib/data/tenant-settings';
import { SettingsBrandingCard } from '@/components/pro/SettingsBrandingCard';
import { SettingsContactCard } from '@/components/pro/SettingsContactCard';
import { SettingsSmtpCard } from '@/components/pro/SettingsSmtpCard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [branding, contact, smtp] = await Promise.all([
    getTenantBranding(tenant.id),
    getTenantContact(tenant.id),
    getTenantSmtpRedacted(tenant.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Workspace configuration for {tenant.name}.
        </p>
      </div>

      <SettingsBrandingCard
        slug={slug}
        initial={
          branding ?? {
            name: tenant.name,
            logo_url: null,
            favicon_url: null,
            primary_color: null,
            secondary_color: null,
          }
        }
      />

      <SettingsContactCard
        slug={slug}
        initial={
          contact ?? {
            email_sender_name: null,
            email_reply_to: null,
            terms_url: null,
            privacy_url: null,
          }
        }
      />

      <SettingsSmtpCard slug={slug} initial={smtp} />
    </div>
  );
}
