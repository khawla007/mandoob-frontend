import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  TenantBranding,
  TenantContact,
  TenantSmtpRedacted,
  TenantWhatsAppRedacted,
} from '@/lib/data/tenant-settings';

type ChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  detail: string;
};

export async function SettingsWhiteLabelChecklist({
  workspaceUrl,
  branding,
  contact,
  smtp,
  whatsapp,
}: {
  workspaceUrl: string;
  branding: TenantBranding;
  contact: TenantContact;
  smtp: TenantSmtpRedacted;
  whatsapp: TenantWhatsAppRedacted;
}) {
  const t = await getTranslations('pro.settings');
  const items: ChecklistItem[] = [
    {
      key: 'branding',
      label: t('whiteLabel.items.branding'),
      complete: Boolean(
        branding.name && (branding.logo_url || branding.name.slice(0, 1)) && branding.primary_color,
      ),
      detail: branding.logo_url
        ? t('whiteLabel.details.brandingComplete')
        : t('whiteLabel.details.brandingIncomplete'),
    },
    {
      key: 'contact',
      label: t('whiteLabel.items.contact'),
      complete: Boolean(
        contact.email_sender_name &&
        contact.email_reply_to &&
        contact.terms_url &&
        contact.privacy_url,
      ),
      detail:
        contact.terms_url && contact.privacy_url
          ? t('whiteLabel.details.contactComplete')
          : t('whiteLabel.details.contactIncomplete'),
    },
    {
      key: 'smtp',
      label: t('whiteLabel.items.smtp'),
      complete: Boolean(smtp?.enabled && smtp.has_password),
      detail: smtp?.enabled
        ? t('whiteLabel.details.smtpComplete')
        : t('whiteLabel.details.smtpIncomplete'),
    },
    {
      key: 'whatsapp',
      label: t('whiteLabel.items.whatsapp'),
      complete: Boolean(whatsapp?.enabled && whatsapp.has_access_token),
      detail: whatsapp?.enabled
        ? t('whiteLabel.details.whatsappComplete')
        : t('whiteLabel.details.whatsappIncomplete'),
    },
  ];
  const completeCount = items.filter((item) => item.complete).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('whiteLabel.title')}</CardTitle>
            <CardDescription>{t('whiteLabel.description')}</CardDescription>
          </div>
          <Badge variant={completeCount === items.length ? 'default' : 'secondary'}>
            {t('whiteLabel.ready', { complete: completeCount, total: items.length })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Link
          href={workspaceUrl}
          target="_blank"
          className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <span className="truncate font-medium">{workspaceUrl}</span>
          <ExternalLink className="text-muted-foreground size-4 shrink-0" />
        </Link>
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((item) => {
            const Icon = item.complete ? CheckCircle2 : Circle;
            return (
              <div key={item.key} className="border-border rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon
                    className={
                      item.complete ? 'size-4 text-emerald-600' : 'text-muted-foreground size-4'
                    }
                  />
                  {item.label}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">{item.detail}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
