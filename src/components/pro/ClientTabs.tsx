'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarClock, FileText, MessageSquare } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';
import type { ClientDetail } from '@/lib/data/client-detail';

export function ClientTabs({ client }: { client: ClientDetail }) {
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
        <ComingSoon
          title="Documents"
          subtitle="Passport, Emirates ID, license, MoA — wired in Step 11."
          icon={<FileText className="size-6" />}
        />
      </TabsContent>

      <TabsContent value="renewals" className="pt-6">
        <ComingSoon
          title="Renewals"
          subtitle="License, visa, EID, Ejari — wired in Step 11."
          icon={<CalendarClock className="size-6" />}
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
