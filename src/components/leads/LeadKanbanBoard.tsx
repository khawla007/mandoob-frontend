import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LEAD_STAGES, type LeadCardRow, type LeadDetail, type LeadKanban } from '@/lib/data/leads-kanban';

type TenantOption = { id: string; name: string; slug: string };

type LeadAction = (formData: FormData) => Promise<unknown>;

const STAGE_LABELS: Record<(typeof LEAD_STAGES)[number], string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  won: 'Won',
  lost: 'Lost',
};

const SCORE_BADGE_VARIANT = {
  hot: 'destructive',
  warm: 'secondary',
  cold: 'outline',
} as const;

export function LeadKanbanBoard({
  kanban,
  baseHref,
  detail,
  tenants = [],
  assignAction,
  stageAction,
  noteAction,
  canAssign = false,
}: {
  kanban: LeadKanban;
  baseHref: string;
  detail?: LeadDetail | null;
  tenants?: TenantOption[];
  assignAction?: LeadAction;
  stageAction: LeadAction;
  noteAction: LeadAction;
  canAssign?: boolean;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-5">
        {LEAD_STAGES.map((stage) => (
          <section key={stage} className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
              <Badge variant="outline">{kanban[stage].length}</Badge>
            </div>
            <div className="space-y-3">
              {kanban[stage].length === 0 ? (
                <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                  No leads
                </div>
              ) : (
                kanban[stage].map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    href={`${baseHref}?lead=${lead.id}`}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <LeadDetailPanel
        detail={detail}
        tenants={tenants}
        assignAction={assignAction}
        stageAction={stageAction}
        noteAction={noteAction}
        canAssign={canAssign}
      />
    </div>
  );
}

function LeadCard({ lead, href }: { lead: LeadCardRow; href: string }) {
  return (
    <Link href={href} className="block">
      <Card className="hover:border-foreground/30 transition-colors">
        <CardHeader className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-sm">{lead.name}</CardTitle>
            <Badge variant={SCORE_BADGE_VARIANT[lead.scoreTemperature]} className="shrink-0 capitalize">
              {lead.score} {lead.scoreTemperature}
            </Badge>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
            {lead.email ? <span>Email</span> : null}
            {lead.phone ? <span>Phone</span> : null}
            {!lead.email && !lead.phone ? <span>No contact</span> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 text-xs">
          <div className="text-muted-foreground">
            {lead.jurisdiction ?? 'Any jurisdiction'} · {lead.authority ?? 'Authority TBD'}
          </div>
          <div className="text-muted-foreground">
            {lead.visaCount} visas · {lead.addOns.length ? lead.addOns.join(', ') : 'No add-ons'}
          </div>
          <Badge variant={lead.tenantId ? 'outline' : 'destructive'}>
            {lead.assignedTenantName ?? 'Unassigned'}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

function LeadDetailPanel({
  detail,
  tenants,
  assignAction,
  stageAction,
  noteAction,
  canAssign,
}: {
  detail?: LeadDetail | null;
  tenants: TenantOption[];
  assignAction?: LeadAction;
  stageAction: LeadAction;
  noteAction: LeadAction;
  canAssign: boolean;
}) {
  if (!detail) {
    return (
      <aside className="border-border/70 bg-muted/20 rounded-lg border p-6">
        <h2 className="font-semibold">Lead detail</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Select a lead card to review answers, assignment, stage controls, and activity.
        </p>
      </aside>
    );
  }

  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{detail.name}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {detail.email ?? 'No email'} · {detail.phone ?? 'No phone'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Fact label="Jurisdiction" value={detail.jurisdiction ?? 'Not set'} />
            <Fact label="Authority" value={detail.authority ?? 'Not set'} />
            <Fact label="Visas" value={String(detail.visaCount)} />
            <Fact label="Score" value={`${detail.score} ${detail.scoreTemperature}`} />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-medium">Score factors</h3>
            <div className="space-y-1 text-xs">
              {detail.scoreFactors.slice(0, 6).map((factor) => (
                <div key={factor.key} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{factor.label}</span>
                  <span className="font-medium">+{factor.points}</span>
                </div>
              ))}
            </div>
          </section>

          {canAssign && assignAction ? (
            <form action={assignAction as never} className="space-y-2">
              <input type="hidden" name="leadId" value={detail.id} />
              <Select name="tenantId" defaultValue={detail.tenantId ?? undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign active PRO firm" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" className="w-full">
                Assign lead
              </Button>
            </form>
          ) : null}

          <form action={stageAction as never} className="flex gap-2">
            <input type="hidden" name="leadId" value={detail.id} />
            <Select name="stage" defaultValue={detail.stage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>

          <section>
            <h3 className="mb-2 text-sm font-medium">Questionnaire</h3>
            <div className="text-muted-foreground space-y-1 text-xs">
              <p>Business: {text(detail.formData.businessSummary) ?? 'Not provided'}</p>
              <p>Names: {arrayText(detail.formData.preferredNames) ?? 'Not provided'}</p>
              <p>Office: {text(detail.formData.officeType) ?? 'Not provided'}</p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">Estimate</h3>
            <div className="text-muted-foreground space-y-1 text-xs">
              <p>Reference: {text(detail.estimateData.reference) ?? 'None'}</p>
              <p>Total: {text(detail.estimateData.total) ?? text(detail.estimateData.totalAed) ?? 'Not set'}</p>
            </div>
          </section>

          <form action={noteAction as never} className="space-y-2">
            <input type="hidden" name="leadId" value={detail.id} />
            <Textarea name="note" placeholder="Add an internal note" rows={3} />
            <Button type="submit" size="sm" variant="outline" className="w-full">
              Add note
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {detail.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
          ) : (
            detail.events.map((event) => (
              <div key={event.id} className="border-border/70 border-b pb-3 last:border-0 last:pb-0">
                <div className="font-medium">{event.eventType.replaceAll('_', ' ')}</div>
                <div className="text-muted-foreground text-xs">
                  {event.note ?? [event.fromValue, event.toValue].filter(Boolean).join(' → ')}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-md p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function text(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() ? value : null;
}

function arrayText(value: unknown): string | null {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').join(', ') : null;
}
