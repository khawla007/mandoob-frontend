import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LeadKanbanBoard } from '@/components/leads/LeadKanbanBoard';
import { requireRole } from '@/lib/auth/require-role';
import {
  getLeadDetail,
  isLeadStage,
  listActiveLeadAssigneeTenants,
  listPlatformLeadKanban,
  type LeadKanbanFilters,
} from '@/lib/data/leads-kanban';
import {
  addAdminLeadNoteAction,
  assignLeadAction,
  setAdminLeadStageAction,
} from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  lead?: string;
  assigned?: string;
  stage?: string;
  jurisdiction?: string;
  q?: string;
};

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin', 'admin');
  const sp = await searchParams;
  const filters: LeadKanbanFilters = {
    assigned: sp.assigned === 'unassigned' ? 'unassigned' : sp.assigned || 'all',
    stage: sp.stage && isLeadStage(sp.stage) ? sp.stage : 'all',
    jurisdiction: sp.jurisdiction || null,
    q: sp.q || null,
  };
  const [kanban, tenants, detail] = await Promise.all([
    listPlatformLeadKanban(filters),
    listActiveLeadAssigneeTenants(),
    sp.lead ? getLeadDetail(sp.lead, { kind: 'platform' }) : Promise.resolve(null),
  ]);
  const total = Object.values(kanban).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lead pipeline</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Questionnaire leads across every tenant. Showing {total}.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]" action="/admin/leads">
            <Input name="q" defaultValue={sp.q ?? ''} placeholder="Search name, email, phone" />
            <select
              name="assigned"
              defaultValue={filters.assigned}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="all">All assignments</option>
              <option value="unassigned">Unassigned</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            <select
              name="stage"
              defaultValue={filters.stage}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="all">All stages</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <LeadKanbanBoard
        kanban={kanban}
        baseHref="/admin/leads"
        detail={detail}
        tenants={tenants}
        assignAction={assignLeadAction}
        stageAction={setAdminLeadStageAction}
        noteAction={addAdminLeadNoteAction}
        canAssign
      />
    </div>
  );
}
