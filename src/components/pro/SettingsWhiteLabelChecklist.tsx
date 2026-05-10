import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  TenantBranding,
  TenantContact,
  TenantSmtpRedacted,
  TenantWhatsAppRedacted,
} from '@/lib/data/tenant-settings';

type ChecklistItem = {
  label: string;
  complete: boolean;
  detail: string;
};

export function SettingsWhiteLabelChecklist({
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
  const items: ChecklistItem[] = [
    {
      label: 'Branding',
      complete: Boolean(branding.name && (branding.logo_url || branding.name.slice(0, 1)) && branding.primary_color),
      detail: branding.logo_url ? 'Logo and primary color set' : 'Fallback initial is active',
    },
    {
      label: 'Contact & legal',
      complete: Boolean(contact.email_sender_name && contact.email_reply_to && contact.terms_url && contact.privacy_url),
      detail: contact.terms_url && contact.privacy_url ? 'Legal links configured' : 'Add sender and legal links',
    },
    {
      label: 'SMTP',
      complete: Boolean(smtp?.enabled && smtp.has_password),
      detail: smtp?.enabled ? 'Tenant SMTP enabled' : 'Using platform email fallback',
    },
    {
      label: 'WhatsApp',
      complete: Boolean(whatsapp?.enabled && whatsapp.has_access_token),
      detail: whatsapp?.enabled ? 'Tenant WhatsApp enabled' : 'Not configured or disabled',
    },
  ];
  const completeCount = items.filter((item) => item.complete).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">White-label setup</CardTitle>
            <CardDescription>Subdomain, brand, sender, and comms readiness.</CardDescription>
          </div>
          <Badge variant={completeCount === items.length ? 'default' : 'secondary'}>
            {completeCount}/{items.length} ready
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
              <div key={item.label} className="border-border rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={item.complete ? 'size-4 text-emerald-600' : 'text-muted-foreground size-4'} />
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
