import { CheckCircle2, Circle, ExternalLink, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  TenantBranding,
  TenantContact,
  TenantSmtpRedacted,
  TenantWhatsAppRedacted,
} from '@/lib/data/tenant-settings';
import { deriveProviderState, type SourceState } from '@/lib/settings/provider-state';

type ChecklistItem = {
  key: string;
  label: string;
  state: 'complete' | 'incomplete' | 'unavailable';
  detail: string;
};

export async function SettingsWhiteLabelChecklist({
  workspaceHref,
  branding,
  contact,
  smtp,
  whatsapp,
}: {
  workspaceHref: string;
  branding: SourceState<TenantBranding | null>;
  contact: SourceState<TenantContact | null>;
  smtp: SourceState<TenantSmtpRedacted>;
  whatsapp: SourceState<TenantWhatsAppRedacted>;
}) {
  const t = await getTranslations('pro.settings');
  const smtpState = deriveProviderState(
    smtp.status === 'ready'
      ? {
          status: 'ready',
          data: smtp.data && { enabled: smtp.data.enabled, hasCredential: smtp.data.has_password },
        }
      : smtp,
  );
  const whatsappState = deriveProviderState(
    whatsapp.status === 'ready'
      ? {
          status: 'ready',
          data: whatsapp.data && {
            enabled: whatsapp.data.enabled,
            hasCredential: whatsapp.data.has_access_token,
          },
        }
      : whatsapp,
  );
  const items: ChecklistItem[] = [
    {
      key: 'branding',
      label: t('whiteLabel.items.branding'),
      state:
        branding.status === 'unavailable'
          ? 'unavailable'
          : branding.data?.primary_color
            ? 'complete'
            : 'incomplete',
      detail:
        branding.status === 'unavailable'
          ? t('sourceUnavailable')
          : branding.data?.primary_color
            ? t('whiteLabel.details.brandingComplete')
            : t('whiteLabel.details.brandingIncomplete'),
    },
    {
      key: 'contact',
      label: t('whiteLabel.items.contact'),
      state:
        contact.status === 'unavailable'
          ? 'unavailable'
          : contact.data?.email_sender_name &&
              contact.data.email_reply_to &&
              contact.data.terms_url &&
              contact.data.privacy_url
            ? 'complete'
            : 'incomplete',
      detail:
        contact.status === 'unavailable'
          ? t('sourceUnavailable')
          : contact.data?.terms_url && contact.data.privacy_url
            ? t('whiteLabel.details.contactComplete')
            : t('whiteLabel.details.contactIncomplete'),
    },
    {
      key: 'smtp',
      label: t('whiteLabel.items.smtp'),
      state:
        smtpState === 'enabled'
          ? 'complete'
          : smtpState === 'unavailable'
            ? 'unavailable'
            : 'incomplete',
      detail: t(`providerStatus.${smtpState}`),
    },
    {
      key: 'whatsapp',
      label: t('whiteLabel.items.whatsapp'),
      state:
        whatsappState === 'enabled'
          ? 'complete'
          : whatsappState === 'unavailable'
            ? 'unavailable'
            : 'incomplete',
      detail: t(`providerStatus.${whatsappState}`),
    },
  ];
  const completeCount = items.filter((item) => item.state === 'complete').length;

  return (
    <Card className="signal-panel">
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
          href={workspaceHref}
          className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <span className="truncate font-medium">{t('whiteLabel.openWorkspace')}</span>
          <ExternalLink className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        </Link>
        <ol className="grid gap-2 md:grid-cols-2">
          {items.map((item) => {
            const Icon =
              item.state === 'complete'
                ? CheckCircle2
                : item.state === 'unavailable'
                  ? TriangleAlert
                  : Circle;
            return (
              <li key={item.key} className="border-border rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon
                    className={
                      item.state === 'complete'
                        ? 'text-signal-success size-4'
                        : item.state === 'unavailable'
                          ? 'text-signal-urgent size-4'
                          : 'text-muted-foreground size-4'
                    }
                    aria-hidden="true"
                  />
                  {item.label}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">{item.detail}</div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
