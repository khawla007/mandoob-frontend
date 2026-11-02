import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type SendInput = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult = { ok: true; providerId?: string } | { ok: false; error: string };

export type ResolvedSender = {
  from: string;
  replyTo: string | null;
  transport: 'resend';
  send: (input: SendInput) => Promise<SendResult>;
};

const PLATFORM_FROM = env.RESEND_FROM_EMAIL ?? 'no-reply@mail.fanaticcoders.com';

export type TenantBranding = {
  email_sender_name: string | null;
  email_reply_to: string | null;
} | null;

export type SenderConfig = {
  transport: 'resend';
  from: string;
  replyTo: string | null;
};

type SenderDependencies = {
  readTenant?: (tenantId: string) => Promise<TenantBranding>;
};

export function buildSenderConfig(
  tenant: TenantBranding,
  platformFrom: string = PLATFORM_FROM,
): SenderConfig {
  const senderName = tenant?.email_sender_name?.trim();
  const from = senderName ? `${senderName} <${platformFrom}>` : platformFrom;
  return { transport: 'resend', from, replyTo: tenant?.email_reply_to ?? null };
}

function resendSender(from: string, replyTo: string | null): ResolvedSender {
  return {
    from,
    replyTo,
    transport: 'resend',
    async send(input) {
      if (!env.RESEND_API_KEY) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[mail] RESEND_API_KEY missing — dev no-op', input.to, input.subject);
          return { ok: true, providerId: 'dev-noop' };
        }
        return { ok: false, error: 'RESEND_API_KEY missing' };
      }
      const r = new Resend(env.RESEND_API_KEY);
      const { data, error } = await r.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, providerId: data?.id };
    },
  };
}

async function readTenant(tenantId: string): Promise<TenantBranding> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('tenants')
    .select('email_sender_name, email_reply_to')
    .eq('id', tenantId)
    .maybeSingle();
  return data;
}

export async function resolveSenderForTenant(
  tenantId: string | null,
  deps: SenderDependencies = {},
): Promise<ResolvedSender> {
  if (!tenantId) return resendSender(PLATFORM_FROM, null);

  const tenant = await (deps.readTenant ?? readTenant)(tenantId);
  const cfg = buildSenderConfig(tenant ?? null);
  return resendSender(cfg.from, cfg.replyTo);
}
