import 'server-only';
import { enqueueWhatsApp } from './send';

export type SendOtpWhatsAppArgs = {
  tenantId: string;
  toPhone: string;
  code: string;
};

export type SendOtpWhatsAppResult = { ok: true; queueId: number } | { ok: false; reason: string };

export async function sendOtpWhatsApp(args: SendOtpWhatsAppArgs): Promise<SendOtpWhatsAppResult> {
  const result = await enqueueWhatsApp({
    tenantId: args.tenantId,
    templateId: 'otp-code',
    toPhone: args.toPhone,
    input: { code: args.code },
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, queueId: result.queueId };
}
