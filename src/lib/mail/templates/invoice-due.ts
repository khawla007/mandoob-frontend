import type { InvoiceDue } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function invoiceDue(input: InvoiceDue): Rendered {
  const subject = `Invoice from ${input.tenantName} — ${input.amount}`;
  const html = `<p>Hi ${input.customerName},</p>
<p><strong>${input.tenantName}</strong> sent you an invoice for <strong>${input.amount}</strong>.</p>
<p><a href="${input.invoiceUrl}">View invoice</a></p>
<p>— The ${input.tenantName} team</p>`;
  return { subject, html };
}
