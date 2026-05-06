import type { RenewalReminder } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function renewalReminder(input: RenewalReminder): Rendered {
  const headline =
    input.daysOut === 30
      ? 'Renewal due in 30 days'
      : input.daysOut === 7
        ? 'Renewal due in 7 days'
        : 'Final reminder: renewal due tomorrow';
  const subject = `${headline} — ${input.renewalLabel} (${input.tenantName})`;
  const html = `<p>Hi ${input.customerName},</p>
<p><strong>${headline}.</strong></p>
<p>Your <strong>${input.renewalLabel}</strong> with ${input.tenantName} is due on <strong>${input.dueDate}</strong>. Late renewals can incur AED 25/day fines.</p>
<p><a href="${input.detailUrl}">View renewal details</a></p>
<p>— The ${input.tenantName} team</p>`;
  return { subject, html };
}
