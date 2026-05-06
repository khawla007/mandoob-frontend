import type { TenantPendingReceived } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function tenantPendingReceived(input: TenantPendingReceived): Rendered {
  const subject = `We received your application for ${input.tenantName}`;
  const html = `<p>Hi ${input.adminName},</p>
<p>Thanks for applying. We received your registration for <strong>${input.tenantName}</strong> and a Mandoob admin will review it within 1–2 business days. You will get another email once a decision is made.</p>
<p>— The Mandoob team</p>`;
  return { subject, html };
}
