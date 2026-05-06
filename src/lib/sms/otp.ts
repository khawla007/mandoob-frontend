import 'server-only';
import { env } from '@/lib/env';
import { sendViaTwilio } from './providers/twilio';
import { enqueueSms } from './send';
import { renderSmsTemplate } from './templates';

export type SendOtpSmsArgs = {
  to: string;
  code: string;
  // Optional tenant context. If supplied and the tenant has SMS enabled,
  // we route through the queue (carries audit, retry, rate-limit). Otherwise
  // we fall back to the platform Twilio creds for cross-tenant employee OTP.
  tenantId?: string;
};

export type SendOtpSmsResult = { ok: true } | { ok: false; reason: string };

export async function sendOtpSms(args: SendOtpSmsArgs): Promise<SendOtpSmsResult> {
  if (args.tenantId) {
    const result = await enqueueSms({
      tenantId: args.tenantId,
      templateId: 'otp-code',
      toPhone: args.to,
      input: { code: args.code },
    });
    if (result.ok) return { ok: true };
    if (result.reason !== 'SMS_NOT_CONFIGURED') return { ok: false, reason: result.reason };
    // fall through to platform Twilio
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[otp-sms] TWILIO_* missing — dev fallback.\n  to: ${args.to}\n  code: ${args.code}`,
      );
      return { ok: true };
    }
    return { ok: false, reason: 'TWILIO_NOT_CONFIGURED' };
  }

  const senderId = env.TWILIO_MESSAGING_SERVICE_SID ?? env.TWILIO_FROM_NUMBER;
  if (!senderId) return { ok: false, reason: 'TWILIO_SENDER_NOT_CONFIGURED' };

  const rendered = renderSmsTemplate('otp-code', { code: args.code });
  const result = await sendViaTwilio({
    credentials: {
      account_sid: env.TWILIO_ACCOUNT_SID,
      auth_token: env.TWILIO_AUTH_TOKEN,
    },
    toPhone: args.to,
    body: rendered.body,
    senderId,
  });
  if (!result.ok) return { ok: false, reason: result.error };
  return { ok: true };
}
