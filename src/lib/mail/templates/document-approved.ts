import type { DocumentApproved } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function documentApproved(input: DocumentApproved): Rendered {
  const subject = `${input.documentLabel} approved`;
  const html = `<p>Hi ${input.customerName},</p>
<p>Your upload of <strong>${input.documentLabel}</strong> has been reviewed and approved by <strong>${input.tenantName}</strong>. No further action is needed.</p>
<p>— The ${input.tenantName} team</p>`;
  return { subject, html };
}
