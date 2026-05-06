import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { nextScheduledFor, MAX_ATTEMPTS } from '@/lib/mail/send';
import { resolveSmsForTenant, type TenantSmsConfig } from './config';
import { consumeSmsQuota } from './rate-limit';
import { pickProvider, type SmsProviderName } from './router';
import { sendViaTwilio } from './providers/twilio';
import { sendViaUnifonic } from './providers/unifonic';
import { renderSmsTemplate, type SmsTemplateId, type SmsTemplateInputFor } from './templates';

export { nextScheduledFor, MAX_ATTEMPTS } from '@/lib/mail/send';

export type EnqueueSmsArgs<T extends SmsTemplateId> = {
  tenantId: string;
  templateId: T;
  toPhone: string;
  input: SmsTemplateInputFor<T>;
  scheduledFor?: Date;
  linked?: { entityType: string; entityId: string };
};

export type EnqueueSmsResult =
  | {
      ok: true;
      queueId: number;
      status: 'pending' | 'sent' | 'delivered' | 'failed' | 'dead';
    }
  | { ok: false; reason: 'SMS_NOT_CONFIGURED' | 'INVALID_PHONE' | string };

function providerAvailability(config: TenantSmsConfig): { unifonic: boolean; twilio: boolean } {
  return {
    unifonic: config.provider === 'unifonic',
    twilio: config.provider === 'twilio',
  };
}

export async function enqueueSms<T extends SmsTemplateId>(
  args: EnqueueSmsArgs<T>,
): Promise<EnqueueSmsResult> {
  const tenantConfig = await resolveSmsForTenant(args.tenantId);
  if (!tenantConfig) return { ok: false, reason: 'SMS_NOT_CONFIGURED' };

  let provider: SmsProviderName;
  try {
    provider = pickProvider(args.toPhone, providerAvailability(tenantConfig));
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'INVALID_PHONE' };
  }

  const rendered = renderSmsTemplate(args.templateId, args.input);
  const supabase = createSupabaseServiceRoleClient();
  const scheduledFor = args.scheduledFor ?? new Date();

  const insert = {
    tenant_id: args.tenantId,
    template_id: args.templateId,
    to_phone: args.toPhone,
    body: rendered.body,
    provider,
    sender_id: tenantConfig.senderId,
    status: 'pending' as const,
    attempts: 0,
    linked_entity_type: args.linked?.entityType ?? null,
    linked_entity_id: args.linked?.entityId ?? null,
    scheduled_for: scheduledFor.toISOString(),
  };

  const { data, error } = await supabase.from('outbound_sms').insert(insert).select('id').single();

  if (error) {
    if (error.code === '23505' && args.linked) {
      const { data: existing } = await supabase
        .from('outbound_sms')
        .select('id, status')
        .eq('linked_entity_type', args.linked.entityType)
        .eq('linked_entity_id', args.linked.entityId)
        .eq('scheduled_for', insert.scheduled_for)
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          queueId: existing.id,
          status: existing.status as EnqueueSmsResult extends { ok: true; status: infer S }
            ? S
            : never,
        };
      }
    }
    return { ok: false, reason: error.message };
  }

  if (scheduledFor.getTime() <= Date.now()) {
    void processSmsQueue({ batchSize: 1, onlyId: data.id }).catch(() => {});
  }

  return { ok: true, queueId: data.id, status: 'pending' };
}

export async function processSmsQueue(opts: {
  batchSize?: number;
  onlyId?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const supabase = createSupabaseServiceRoleClient();
  let q = supabase
    .from('outbound_sms')
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
    const tenantConfig = await resolveSmsForTenant(row.tenant_id);
    if (!tenantConfig) {
      const nextAttempts = row.attempts + 1;
      const dead = nextAttempts >= MAX_ATTEMPTS;
      await supabase
        .from('outbound_sms')
        .update({
          status: dead ? 'dead' : 'pending',
          last_error: 'SMS_NOT_CONFIGURED',
          attempts: nextAttempts,
          scheduled_for: dead ? row.scheduled_for : nextScheduledFor(nextAttempts).toISOString(),
        })
        .eq('id', row.id);
      failed++;
      continue;
    }

    const quota = await consumeSmsQuota(row.tenant_id);
    if (!quota.ok) {
      await supabase
        .from('outbound_sms')
        .update({
          scheduled_for: new Date(Date.now() + 60 * 60_000).toISOString(),
        })
        .eq('id', row.id);
      continue;
    }

    const result =
      row.provider === 'twilio'
        ? await sendViaTwilio({
            credentials: tenantConfig.credentials as { account_sid: string; auth_token: string },
            toPhone: row.to_phone,
            body: row.body,
            senderId: tenantConfig.senderId,
          })
        : await sendViaUnifonic({
            credentials: tenantConfig.credentials as { app_sid: string },
            toPhone: row.to_phone,
            body: row.body,
            senderId: tenantConfig.senderId,
          });

    const nextAttempts = row.attempts + 1;
    if (result.ok) {
      await supabase
        .from('outbound_sms')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: result.providerMessageId,
          attempts: nextAttempts,
        })
        .eq('id', row.id);
      sent++;
    } else {
      const dead = !result.retryable || nextAttempts >= MAX_ATTEMPTS;
      await supabase
        .from('outbound_sms')
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
