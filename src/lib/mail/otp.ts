import 'server-only';
import { env } from '@/lib/env';
import { enqueueEmail } from './send';

export async function sendOtpEmail(args: { to: string; code: string }): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[otp] RESEND_API_KEY missing — dev fallback.\n  to: ${args.to}\n  code: ${args.code}`,
      );
      return;
    }
    throw new Error('Email provider not configured (set RESEND_API_KEY)');
  }

  const result = await enqueueEmail({
    tenantId: null,
    templateId: 'otp-code',
    toAddress: args.to,
    input: { code: args.code },
  });
  if (!result.ok) throw new Error(`enqueue otp failed: ${result.reason}`);
}
