import 'server-only';
import { env } from '@/lib/env';
import { DEFAULT_FROM, getResend } from './client';

export async function sendOtpEmail(args: { to: string; code: string }): Promise<void> {
  // Dev fallback: if Resend isn't configured, log the code instead of failing.
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[otp] RESEND_API_KEY missing — dev fallback.\n  to: ${args.to}\n  code: ${args.code}`,
      );
      return;
    }
    throw new Error('Email provider not configured (set RESEND_API_KEY)');
  }

  const digits = args.code.length;
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: args.to,
    subject: `Your Mandoob verification code: ${args.code}`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 16px">Confirm your email</h1>
  <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5">
    Enter this ${digits}-digit code in Mandoob to finish creating your account.
  </p>
  <div style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:16px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;letter-spacing:0.5em;font-weight:600">
    ${args.code}
  </div>
  <p style="margin:16px 0 0;color:#666;font-size:12px;line-height:1.5">
    This code expires in 10 minutes. If you didn't request it, ignore this email.
  </p>
</div>`,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
}
