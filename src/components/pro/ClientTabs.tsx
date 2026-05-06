'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';
import { DocumentsTab } from '@/components/pro/DocumentsTab';
import { ClientRenewalsPanel } from '@/components/pro/ClientRenewalsPanel';
import type { ClientDetail } from '@/lib/data/client-detail';
import type { DocumentListEntry, OpenRequestEntry } from '@/lib/data/documents';
import type { RenewalRow } from '@/lib/data/renewals';

export function ClientTabs({
  client,
  slug,
  documents,
  openRequests,
  renewals,
}: {
  client: ClientDetail;
  slug: string;
  documents: DocumentListEntry[];
  openRequests: OpenRequestEntry[];
  renewals: RenewalRow[];
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="renewals">Renewals</TabsTrigger>
        <TabsTrigger value="communications">Communications</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="pt-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Company name" value={client.company_name} />
          <Field label="Status" value={client.status} mono />
          <Field label="Jurisdiction" value={client.jurisdiction ?? '—'} />
          <Field label="Trade license #" value={client.trade_license_no ?? '—'} mono />
          <Field label="License expiry" value={client.license_expiry ?? '—'} />
          <Field label="Shareholders" value={String(client.shareholders.length)} />
          <Field
            label="Registered activities"
            value={String(client.registered_activities.length)}
          />
          <Field label="Created" value={new Date(client.created_at).toLocaleDateString()} />
        </dl>
      </TabsContent>

      <TabsContent value="documents" className="pt-6">
        <DocumentsTab
          slug={slug}
          clientId={client.id}
          documents={documents}
          openRequests={openRequests}
        />
      </TabsContent>

      <TabsContent value="renewals" className="pt-6">
        <ClientRenewalsPanel
          slug={slug}
          client={{ id: client.id, company_name: client.company_name }}
          renewals={renewals}
        />
      </TabsContent>

      <TabsContent value="communications" className="pt-6">
        <ComingSoon
          title="Communications"
          subtitle="Email, WhatsApp, SMS history — wired in Phase 2."
          icon={<MessageSquare className="size-6" />}
        />
      </TabsContent>
    </Tabs>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : 'font-medium'}>{value}</dd>
    </div>
  );
}
