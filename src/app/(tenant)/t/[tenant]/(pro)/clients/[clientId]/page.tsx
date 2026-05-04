import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClientTabs } from '@/components/pro/ClientTabs';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getClientForTenant } from '@/lib/data/client-detail';
import { listDocumentsForClient, listOpenRequestsForClient } from '@/lib/data/documents';

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

  const [documents, openRequests] = await Promise.all([
    listDocumentsForClient(tenant.id, clientId),
    listOpenRequestsForClient(tenant.id, clientId),
  ]);

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
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ClientTabs
            client={client}
            slug={slug}
            documents={documents}
            openRequests={openRequests}
          />
        </CardContent>
      </Card>
    </div>
  );
}
