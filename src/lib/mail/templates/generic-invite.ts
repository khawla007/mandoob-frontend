import type { GenericInvite } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function genericInvite(input: GenericInvite): Rendered {
  const subject = `You're invited to ${input.tenantName} on Mandoob`;
  const html = `<p>Hi ${input.toName},</p>
<p><strong>${input.tenantName}</strong> has invited you to join as <strong>${input.role}</strong>.</p>
<p><a href="${input.inviteUrl}">Accept invite</a> (link expires in 7 days).</p>
<p>If you weren't expecting this, ignore this email.</p>`;
  return { subject, html };
}
