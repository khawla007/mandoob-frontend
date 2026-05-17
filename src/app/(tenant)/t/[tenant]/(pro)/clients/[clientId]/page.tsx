import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClientTabs } from '@/components/pro/ClientTabs';
import { EditClientForm } from '@/components/pro/EditClientForm';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getClientForTenant } from '@/lib/data/client-detail';
import { listDocumentsForClient, listOpenRequestsForClient } from '@/lib/data/documents';
import { listInvoicesForTenant } from '@/lib/data/invoices';
import { listRenewalsForClient } from '@/lib/data/renewals';
import { getCommsForClient } from '@/lib/data/comms';
import { getConsentStateForPhone } from '@/lib/comms/consent';
import { loadOlderCommsAction } from './comms-actions';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; clientId: string }>;
}) {
  const { tenant: slug, clientId } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const client = await getClientForTenant(tenant.id, clientId);
  if (!client) notFound();

  const [documents, openRequests, renewals, invoices, comms, consentState] = await Promise.all([
    listDocumentsForClient(tenant.id, clientId),
    listOpenRequestsForClient(tenant.id, clientId),
    listRenewalsForClient(tenant.id, clientId, { includeCancelled: true }),
    listInvoicesForTenant(tenant.id, { clientId }),
    getCommsForClient(tenant.id, clientId, { limit: 25 }),
    getConsentStateForPhone(client.contact_phone),
  ]);

  const loadOlder = async (beforeIso: string) =>
    loadOlderCommsAction(tenant.id, clientId, beforeIso);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/t/${slug}/clients`}>
          <ChevronLeft className="size-4" />
          Back to clients
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.company_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{client.status}</Badge>
            {client.jurisdiction && (
              <span className="text-muted-foreground">· {client.jurisdiction}</span>
            )}
            {client.license_expiry && (
              <span className="text-muted-foreground">
                · License expires {client.license_expiry}
              </span>
            )}
            {client.contact_phone && (
              <>
                <span className="text-muted-foreground">· {client.contact_phone}</span>
                {consentState.whatsapp && <Badge variant="destructive">WhatsApp opted out</Badge>}
                {consentState.sms && <Badge variant="destructive">SMS opted out</Badge>}
              </>
            )}
          </div>
        </div>
        <EditClientForm
          slug={slug}
          client={{
            id: client.id,
            company_name: client.company_name,
            trade_license_no: client.trade_license_no,
            jurisdiction: client.jurisdiction,
            license_expiry: client.license_expiry,
          }}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <ClientTabs
            client={client}
            slug={slug}
            documents={documents}
            openRequests={openRequests}
            renewals={renewals}
            invoices={invoices}
            comms={comms}
            consentState={consentState}
            loadOlderComms={loadOlder}
          />
        </CardContent>
      </Card>
    </div>
  );
}
