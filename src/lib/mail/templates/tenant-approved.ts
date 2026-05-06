import type { TenantApproved } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function tenantApproved(input: TenantApproved): Rendered {
  const subject = `${input.tenantName} is approved on Mandoob — set your password`;
  const html = `<p>Hi ${input.adminName},</p>
<p>Good news — your registration for <strong>${input.tenantName}</strong> has been approved. Set your password and sign in to start onboarding clients.</p>
<p><a href="${input.inviteUrl}">Accept invite and set password</a> (link expires in 7 days).</p>
<p>— The Mandoob team</p>`;
  return { subject, html };
}
