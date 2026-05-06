import type { DocumentRequested } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function documentRequested(input: DocumentRequested): Rendered {
  const subject = `${input.tenantName} requested a document — ${input.documentLabel}`;
  const dueLine = input.dueDate
    ? `<p>Please upload it by <strong>${input.dueDate}</strong>.</p>`
    : '';
  const html = `<p>Hi ${input.customerName},</p>
<p><strong>${input.tenantName}</strong> needs you to upload <strong>${input.documentLabel}</strong>.</p>
${dueLine}
<p><a href="${input.uploadUrl}">Upload now</a></p>
<p>— The ${input.tenantName} team</p>`;
  return { subject, html };
}
