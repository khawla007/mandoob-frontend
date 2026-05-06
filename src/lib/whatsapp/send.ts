import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { nextScheduledFor, MAX_ATTEMPTS } from '@/lib/mail/send';
import { resolveWhatsAppForTenant } from './config';
import { consumeWhatsAppQuota } from './rate-limit';
import { sendTemplateMessage } from './client';
import {
  renderWhatsAppTemplate,
  type WhatsAppTemplateId,
  type WhatsAppTemplateInputFor,
  type MetaComponent,
} from './templates';

export type EnqueueWhatsAppArgs<T extends WhatsAppTemplateId> = {
  tenantId: string;
  templateId: T;
  toPhone: string;
  input: WhatsAppTemplateInputFor<T>;
  scheduledFor?: Date;
  linked?: { entityType: string; entityId: string };
};

export type EnqueueWhatsAppResult =
  | {
      ok: true;
      queueId: number;
      status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'dead';
    }
  | { ok: false; reason: 'WHATSAPP_NOT_CONFIGURED' | 'RATE_LIMITED' | string };

export { nextScheduledFor, MAX_ATTEMPTS } from '@/lib/mail/send';

export async function enqueueWhatsApp<T extends WhatsAppTemplateId>(
  args: EnqueueWhatsAppArgs<T>,
): Promise<EnqueueWhatsAppResult> {
  const tenantConfig = await resolveWhatsAppForTenant(args.tenantId);
  if (!tenantConfig) return { ok: false, reason: 'WHATSAPP_NOT_CONFIGURED' };

  const rendered = renderWhatsAppTemplate(args.templateId, args.input);
  const supabase = createSupabaseServiceRoleClient();

  const scheduledFor = args.scheduledFor ?? new Date();
  const insert = {
    tenant_id: args.tenantId,
    template_id: args.templateId,
    meta_template_name: rendered.metaTemplateName,
    meta_template_lang: rendered.language,
    to_phone: args.toPhone,
    components: rendered.components as unknown as Record<string, unknown>[] as never,
    status: 'pending' as const,
    attempts: 0,
    linked_entity_type: args.linked?.entityType ?? null,
    linked_entity_id: args.linked?.entityId ?? null,
    scheduled_for: scheduledFor.toISOString(),
  };

  const { data, error } = await supabase
    .from('outbound_whatsapp')
    .insert(insert)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505' && args.linked) {
      const { data: existing } = await supabase
        .from('outbound_whatsapp')
        .select('id, status')
        .eq('linked_entity_type', args.linked.entityType)
        .eq('linked_entity_id', args.linked.entityId)
        .eq('scheduled_for', insert.scheduled_for)
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          queueId: existing.id,
          status: existing.status as EnqueueWhatsAppResult extends { ok: true; status: infer S }
            ? S
            : never,
        };
      }
    }
    return { ok: false, reason: error.message };
  }

  if (scheduledFor.getTime() <= Date.now()) {
    void processWhatsAppQueue({ batchSize: 1, onlyId: data.id }).catch(() => {});
  }

  return { ok: true, queueId: data.id, status: 'pending' };
}

export async function processWhatsAppQueue(opts: {
  batchSize?: number;
  onlyId?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const supabase = createSupabaseServiceRoleClient();
  let q = supabase
    .from('outbound_whatsapp')
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
    const tenantConfig = await resolveWhatsAppForTenant(row.tenant_id);
    if (!tenantConfig) {
      const nextAttempts = row.attempts + 1;
      const dead = nextAttempts >= MAX_ATTEMPTS;
      await supabase
        .from('outbound_whatsapp')
        .update({
          status: dead ? 'dead' : 'pending',
          last_error: 'WHATSAPP_NOT_CONFIGURED',
          attempts: nextAttempts,
          scheduled_for: dead ? row.scheduled_for : nextScheduledFor(nextAttempts).toISOString(),
        })
        .eq('id', row.id);
      failed++;
      continue;
    }

    const quota = await consumeWhatsAppQuota(row.tenant_id);
    if (!quota.ok) {
      await supabase
        .from('outbound_whatsapp')
        .update({
          scheduled_for: new Date(Date.now() + 60 * 60_000).toISOString(),
        })
        .eq('id', row.id);
      continue;
    }

    const result = await sendTemplateMessage({
      tenantConfig,
      toPhone: row.to_phone,
      templateName: row.meta_template_name,
      language: row.meta_template_lang,
      components: row.components as unknown as MetaComponent[],
    });

    const nextAttempts = row.attempts + 1;
    if (result.ok) {
      await supabase
        .from('outbound_whatsapp')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: result.wamid,
          attempts: nextAttempts,
        })
        .eq('id', row.id);
      sent++;
    } else {
      const dead = !result.retryable || nextAttempts >= MAX_ATTEMPTS;
      await supabase
        .from('outbound_whatsapp')
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
