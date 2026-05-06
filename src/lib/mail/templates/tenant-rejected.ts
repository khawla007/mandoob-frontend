import type { TenantRejected } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function tenantRejected(input: TenantRejected): Rendered {
  const subject = `Update on your Mandoob application for ${input.tenantName}`;
  const reasonBlock = input.reason ? `<p><strong>Reviewer note:</strong> ${input.reason}</p>` : '';
  const html = `<p>Hi ${input.adminName},</p>
<p>After reviewing your application for <strong>${input.tenantName}</strong>, we are unable to approve it at this time.</p>
${reasonBlock}
<p>If you believe this was in error or have additional information to share, reply to this email and a Mandoob admin will follow up.</p>
<p>— The Mandoob team</p>`;
  return { subject, html };
}
