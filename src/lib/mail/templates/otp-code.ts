import type { OtpCode } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function otpCode(input: OtpCode): Rendered {
  const digits = input.code.length;
  const subject = `Your Mandoob verification code: ${input.code}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 16px">Confirm your email</h1>
  <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5">
    Enter this ${digits}-digit code in Mandoob to finish creating your account.
  </p>
  <div style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:16px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;letter-spacing:0.5em;font-weight:600">
    ${input.code}
  </div>
  <p style="margin:16px 0 0;color:#666;font-size:12px;line-height:1.5">
    This code expires in 10 minutes. If you didn't request it, ignore this email.
  </p>
</div>`;
  return { subject, html };
}
