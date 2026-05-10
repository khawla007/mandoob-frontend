import { notFound } from 'next/navigation';
import { LeadKanbanBoard } from '@/components/leads/LeadKanbanBoard';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getLeadDetail, listTenantLeadKanban } from '@/lib/data/leads-kanban';
import { addProLeadNoteAction, setProLeadStageAction } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = { lead?: string };

export default async function ProLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [kanban, detail] = await Promise.all([
    listTenantLeadKanban(tenant.id),
    sp.lead ? getLeadDetail(sp.lead, { kind: 'tenant', tenantId: tenant.id }) : Promise.resolve(null),
  ]);
  const total = Object.values(kanban).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Assigned questionnaire leads for {tenant.name}. Showing {total}.
        </p>
      </div>

      <LeadKanbanBoard
        kanban={kanban}
        baseHref={`/t/${slug}/leads`}
        detail={detail}
        stageAction={setProLeadStageAction.bind(null, slug)}
        noteAction={addProLeadNoteAction.bind(null, slug)}
      />
    </div>
  );
}
