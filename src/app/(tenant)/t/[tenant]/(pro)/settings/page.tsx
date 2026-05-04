import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  getTenantBranding,
  getTenantContact,
  getTenantSmtpRedacted,
} from '@/lib/data/tenant-settings';
import { SettingsBrandingCard } from '@/components/pro/SettingsBrandingCard';
import { SettingsContactCard } from '@/components/pro/SettingsContactCard';
import { SettingsSmtpCard } from '@/components/pro/SettingsSmtpCard';
import { SettingsReadOnlyNotice } from '@/components/pro/SettingsReadOnlyNotice';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const session = await requireRole('pro', 'admin', 'super_admin');
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const readOnly = session.role === 'pro';

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

      {readOnly && <SettingsReadOnlyNotice />}

      <SettingsBrandingCard
        slug={slug}
        disabled={readOnly}
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
        disabled={readOnly}
        initial={
          contact ?? {
            email_sender_name: null,
            email_reply_to: null,
            terms_url: null,
            privacy_url: null,
          }
        }
      />

      <SettingsSmtpCard slug={slug} disabled={readOnly} initial={smtp} />
    </div>
  );
}
