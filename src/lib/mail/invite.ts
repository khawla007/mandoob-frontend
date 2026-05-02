import 'server-only';
import { DEFAULT_FROM, getResend } from './client';

export async function sendInviteEmail(args: {
  to: string;
  tenantName: string;
  role: 'pro' | 'customer' | 'employee';
  inviteUrl: string;
}): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: args.to,
    subject: `You're invited to ${args.tenantName} on Mandoob`,
    html: `<p>Hi,</p>
<p>${args.tenantName} has invited you to join as <strong>${args.role}</strong>.</p>
<p><a href="${args.inviteUrl}">Accept invite</a> (link expires in 7 days).</p>
<p>If you weren't expecting this, ignore this email.</p>`,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
}
