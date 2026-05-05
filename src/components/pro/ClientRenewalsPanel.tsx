'use client';

import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewRenewalDialog } from '@/components/pro/NewRenewalDialog';
import { RenewalsTable } from '@/components/pro/RenewalsTable';
import type { RenewalRow } from '@/lib/data/renewals';

export function ClientRenewalsPanel({
  slug,
  client,
  renewals,
}: {
  slug: string;
  client: { id: string; company_name: string };
  renewals: RenewalRow[];
}) {
  const [showCancelled, setShowCancelled] = useState(false);

  const clientsMap = useMemo(
    () => new Map([[client.id, { id: client.id, company_name: client.company_name }]]),
    [client.id, client.company_name],
  );

  const active = renewals.filter(
    (r) => r.status === 'upcoming' || r.status === 'due_soon' || r.status === 'overdue',
  );
  const completed = renewals.filter((r) => r.status === 'completed');
  const cancelled = renewals.filter((r) => r.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <CalendarClock className="size-4" />
          <span>
            {active.length} active · {completed.length} completed
            {showCancelled ? ` · ${cancelled.length} cancelled` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCancelled((v) => !v)}
            disabled={cancelled.length === 0}
          >
            {showCancelled ? 'Hide cancelled' : 'Show cancelled'}
          </Button>
          <NewRenewalDialog
            slug={slug}
            clients={[{ id: client.id, company_name: client.company_name }]}
            fixedClientId={client.id}
          />
        </div>
      </div>

      <Section title="Active">
        <RenewalsTable
          rows={active}
          clients={clientsMap}
          showClientColumn={false}
          slug={slug}
          mode="flat"
          emptyMessage="No active renewals for this client."
        />
      </Section>

      {completed.length > 0 && (
        <Section title="Completed">
          <RenewalsTable
            rows={completed}
            clients={clientsMap}
            showClientColumn={false}
            slug={slug}
            mode="flat"
          />
        </Section>
      )}

      {showCancelled && cancelled.length > 0 && (
        <Section title="Cancelled">
          <RenewalsTable
            rows={cancelled}
            clients={clientsMap}
            showClientColumn={false}
            slug={slug}
            mode="flat"
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
