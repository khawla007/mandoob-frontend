import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getTranslations } from 'next-intl/server';
import {
  LEAD_STAGES,
  type LeadCardRow,
  type LeadDetail,
  type LeadKanban,
} from '@/lib/data/leads-kanban';

type TenantOption = { id: string; name: string; slug: string };

type LeadAction = (formData: FormData) => Promise<unknown>;

const SCORE_BADGE_VARIANT = {
  hot: 'destructive',
  warm: 'secondary',
  cold: 'outline',
} as const;

export async function LeadKanbanBoard({
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
  const t = await getTranslations('leads');
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-5">
        {LEAD_STAGES.map((stage) => (
          <section key={stage} className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t(`stage.${stage}`)}</h2>
              <Badge variant="outline">{kanban[stage].length}</Badge>
            </div>
            <div className="space-y-3">
              {kanban[stage].length === 0 ? (
                <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                  {t('empty.noLeads')}
                </div>
              ) : (
                kanban[stage].map((lead) => (
                  <LeadCard key={lead.id} lead={lead} href={`${baseHref}?lead=${lead.id}`} />
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

async function LeadCard({ lead, href }: { lead: LeadCardRow; href: string }) {
  const t = await getTranslations('leads');
  return (
    <Link href={href} className="block">
      <Card className="hover:border-foreground/30 transition-colors">
        <CardHeader className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-sm">{lead.name}</CardTitle>
            <Badge
              variant={SCORE_BADGE_VARIANT[lead.scoreTemperature]}
              className="shrink-0 capitalize"
            >
              {lead.score} {lead.scoreTemperature}
            </Badge>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
            {lead.email ? <span>{t('card.email')}</span> : null}
            {lead.phone ? <span>{t('card.phone')}</span> : null}
            {!lead.email && !lead.phone ? <span>{t('card.noContact')}</span> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 text-xs">
          <div className="text-muted-foreground">
            {lead.jurisdiction ?? t('card.anyJurisdiction')} ·{' '}
            {lead.authority ?? t('card.authorityTbd')}
          </div>
          <div className="text-muted-foreground">
            {t('card.visas', { count: lead.visaCount })} ·{' '}
            {lead.addOns.length ? lead.addOns.join(', ') : t('card.noAddOns')}
          </div>
          <Badge variant={lead.tenantId ? 'outline' : 'destructive'}>
            {lead.assignedTenantName ?? t('card.unassigned')}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

async function LeadDetailPanel({
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
  const t = await getTranslations('leads');
  if (!detail) {
    return (
      <aside className="border-border/70 bg-muted/20 rounded-lg border p-6">
        <h2 className="font-semibold">{t('detail.emptyTitle')}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{t('detail.emptyBody')}</p>
      </aside>
    );
  }

  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{detail.name}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {detail.email ?? t('detail.noEmail')} · {detail.phone ?? t('detail.noPhone')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Fact
              label={t('detail.jurisdiction')}
              value={detail.jurisdiction ?? t('detail.notSet')}
            />
            <Fact label={t('detail.authority')} value={detail.authority ?? t('detail.notSet')} />
            <Fact label={t('detail.visas')} value={String(detail.visaCount)} />
            <Fact label={t('detail.score')} value={`${detail.score} ${detail.scoreTemperature}`} />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-medium">{t('detail.scoreFactors')}</h3>
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
                  <SelectValue placeholder={t('detail.assignPlaceholder')} />
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
                {t('detail.assignLead')}
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
                    {t(`stage.${stage}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm">
              {t('detail.save')}
            </Button>
          </form>

          <section>
            <h3 className="mb-2 text-sm font-medium">{t('detail.questionnaire')}</h3>
            <div className="text-muted-foreground space-y-1 text-xs">
              <p>
                {t('detail.businessLabel')}:{' '}
                {text(detail.formData.businessSummary) ?? t('detail.notProvided')}
              </p>
              <p>
                {t('detail.namesLabel')}:{' '}
                {arrayText(detail.formData.preferredNames) ?? t('detail.notProvided')}
              </p>
              <p>
                {t('detail.officeLabel')}:{' '}
                {text(detail.formData.officeType) ?? t('detail.notProvided')}
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">{t('detail.estimate')}</h3>
            <div className="text-muted-foreground space-y-1 text-xs">
              <p>
                {t('detail.referenceLabel')}:{' '}
                {text(detail.estimateData.reference) ?? t('detail.none')}
              </p>
              <p>
                {t('detail.totalLabel')}:{' '}
                {text(detail.estimateData.total) ??
                  text(detail.estimateData.totalAed) ??
                  t('detail.notSet')}
              </p>
            </div>
          </section>

          <form action={noteAction as never} className="space-y-2">
            <input type="hidden" name="leadId" value={detail.id} />
            <Textarea name="note" placeholder={t('detail.notePlaceholder')} rows={3} />
            <Button type="submit" size="sm" variant="outline" className="w-full">
              {t('detail.addNote')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.activity')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {detail.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('detail.noActivity')}</p>
          ) : (
            detail.events.map((event) => (
              <div
                key={event.id}
                className="border-border/70 border-b pb-3 last:border-0 last:pb-0"
              >
                {event.eventType === 'inbound_reply' ? (
                  <InboundReplyActivity event={event} />
                ) : (
                  <>
                    <div className="font-medium">{event.eventType.replaceAll('_', ' ')}</div>
                    <div className="text-muted-foreground text-xs">
                      {event.note ?? [event.fromValue, event.toValue].filter(Boolean).join(' → ')}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

async function InboundReplyActivity({ event }: { event: LeadDetail['events'][number] }) {
  const t = await getTranslations('leads');
  const channel = text(event.metadata.channel)?.toUpperCase() ?? t('activity.message');
  const fromPhone =
    text(event.metadata.from_phone) ?? event.fromValue ?? t('activity.unknownSender');
  const body = text(event.metadata.body_preview) ?? event.note ?? t('activity.noMessageBody');
  const receivedAt = text(event.metadata.received_at) ?? event.createdAt;
  const ambiguous = event.metadata.ambiguous === true;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t('activity.inboundReply')}</span>
        <Badge variant="outline">{channel}</Badge>
        {ambiguous ? <Badge variant="secondary">{t('activity.ambiguousMatch')}</Badge> : null}
      </div>
      <div className="text-muted-foreground text-xs">
        {fromPhone} · {formatDateTime(receivedAt)}
      </div>
      <p className="text-sm break-words">{body}</p>
    </div>
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-AE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
