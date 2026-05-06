import 'server-only';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { decrypt } from '@/lib/crypto/pii';
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
  transport: 'resend' | 'smtp';
  send: (input: SendInput) => Promise<SendResult>;
};

const PLATFORM_FROM = env.RESEND_FROM_EMAIL ?? 'no-reply@mail.fanaticcoders.com';

export type TenantBranding = {
  email_sender_name: string | null;
  email_reply_to: string | null;
} | null;

export type SmtpRow = {
  host: string;
  port: number;
  username: string;
  from_address: string;
  enabled: boolean;
} | null;

export type SenderConfig = {
  transport: 'resend' | 'smtp';
  from: string;
  replyTo: string | null;
};

export function buildSenderConfig(
  tenant: TenantBranding,
  smtp: SmtpRow,
  platformFrom: string = PLATFORM_FROM,
): SenderConfig {
  if (smtp?.enabled) {
    return {
      transport: 'smtp',
      from: smtp.from_address,
      replyTo: tenant?.email_reply_to ?? null,
    };
  }
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

function smtpSender(cfg: {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  replyTo: string | null;
}): ResolvedSender {
  return {
    from: cfg.fromAddress,
    replyTo: cfg.replyTo,
    transport: 'smtp',
    async send(input) {
      try {
        const transporter = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.port === 465,
          auth: { user: cfg.username, pass: cfg.password },
        });
        const info = await transporter.sendMail({
          from: input.from,
          to: input.to,
          replyTo: input.replyTo,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { ok: true, providerId: info.messageId };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

export async function resolveSenderForTenant(tenantId: string | null): Promise<ResolvedSender> {
  if (!tenantId) return resendSender(PLATFORM_FROM, null);

  const supabase = createSupabaseServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('email_sender_name, email_reply_to')
    .eq('id', tenantId)
    .maybeSingle();
  const { data: smtp } = await supabase
    .from('tenant_smtp_config')
    .select('host, port, username, password_encrypted, from_address, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (smtp?.enabled) {
    return smtpSender({
      host: smtp.host,
      port: smtp.port,
      username: smtp.username,
      password: decrypt(smtp.password_encrypted),
      fromAddress: smtp.from_address,
      replyTo: tenant?.email_reply_to ?? null,
    });
  }

  const cfg = buildSenderConfig(tenant ?? null, null);
  return resendSender(cfg.from, cfg.replyTo);
}
