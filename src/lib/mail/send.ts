import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveSenderForTenant } from './sender';
import { renderTemplate, type TemplateId, type TemplateInputFor } from './templates';

export type EnqueueArgs<T extends TemplateId> = {
  tenantId: string | null;
  templateId: T;
  toAddress: string;
  input: TemplateInputFor<T>;
  scheduledFor?: Date;
  linked?: { entityType: string; entityId: string };
};

export type EnqueueResult =
  | { ok: true; queueId: number; status: 'pending' | 'sent' | 'dead' | 'failed' }
  | { ok: false; reason: string };

export const MAX_ATTEMPTS = 5;
export const BACKOFF_CAP_MIN = 60;

export function nextScheduledFor(attempts: number, now: number = Date.now()): Date {
  const minutes = Math.min(Math.pow(2, attempts), BACKOFF_CAP_MIN);
  return new Date(now + minutes * 60_000);
}

export async function enqueueEmail<T extends TemplateId>(
  args: EnqueueArgs<T>,
): Promise<EnqueueResult> {
  const rendered = renderTemplate(args.templateId, args.input);
  const sender = await resolveSenderForTenant(args.tenantId);
  const supabase = createSupabaseServiceRoleClient();

  const scheduledFor = args.scheduledFor ?? new Date();
  const insert = {
    tenant_id: args.tenantId,
    template_id: args.templateId,
    to_address: args.toAddress,
    from_address: sender.from,
    reply_to: sender.replyTo ?? null,
    subject: rendered.subject,
    body_html: rendered.html,
    body_text: rendered.text ?? null,
    status: 'pending' as const,
    attempts: 0,
    linked_entity_type: args.linked?.entityType ?? null,
    linked_entity_id: args.linked?.entityId ?? null,
    scheduled_for: scheduledFor.toISOString(),
  };

  const { data, error } = await supabase
    .from('outbound_emails')
    .insert(insert)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505' && args.linked) {
      const { data: existing } = await supabase
        .from('outbound_emails')
        .select('id, status')
        .eq('linked_entity_type', args.linked.entityType)
        .eq('linked_entity_id', args.linked.entityId)
        .eq('scheduled_for', insert.scheduled_for)
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          queueId: existing.id,
          status: existing.status as 'pending' | 'sent' | 'dead' | 'failed',
        };
      }
    }
    return { ok: false, reason: error.message };
  }

  if (scheduledFor.getTime() <= Date.now()) {
    void processQueue({ batchSize: 1, onlyId: data.id }).catch(() => {});
  }

  return { ok: true, queueId: data.id, status: 'pending' };
}

export async function processQueue(opts: {
  batchSize?: number;
  onlyId?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const supabase = createSupabaseServiceRoleClient();
  let q = supabase
    .from('outbound_emails')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(opts.batchSize ?? 25);
  if (opts.onlyId !== undefined) q = q.eq('id', opts.onlyId);
  const { data: rows, error } = await q;
  if (error || !rows) return { processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const sender = await resolveSenderForTenant(row.tenant_id);
    const result = await sender.send({
      from: row.from_address,
      to: row.to_address,
      replyTo: row.reply_to ?? undefined,
      subject: row.subject,
      html: row.body_html,
      text: row.body_text ?? undefined,
    });

    const nextAttempts = row.attempts + 1;
    if (result.ok) {
      await supabase
        .from('outbound_emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_id: result.providerId ?? null,
          attempts: nextAttempts,
        })
        .eq('id', row.id);
      sent++;
    } else {
      const dead = nextAttempts >= MAX_ATTEMPTS;
      await supabase
        .from('outbound_emails')
        .update({
          status: dead ? 'dead' : 'pending',
          last_error: result.error.slice(0, 1000),
          attempts: nextAttempts,
          scheduled_for: dead ? row.scheduled_for : nextScheduledFor(nextAttempts).toISOString(),
        })
        .eq('id', row.id);
      failed++;
    }
  }
  return { processed: rows.length, sent, failed };
}
