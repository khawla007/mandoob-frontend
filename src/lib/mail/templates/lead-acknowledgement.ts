import type { LeadAcknowledgement } from '@/lib/validation/email-templates';

export function leadAcknowledgement(input: LeadAcknowledgement) {
  const rawJurisdiction = input.jurisdiction.replace('_', ' ');
  const jurisdiction = escapeHtml(rawJurisdiction);
  const leadName = escapeHtml(input.leadName);
  const tenantName = escapeHtml(input.tenantName);
  const leadReference = escapeHtml(input.leadReference);
  const authority = escapeHtml(input.authority);
  return {
    subject: `We received your application request ${input.leadReference}`,
    html: `
      <p>Hi ${leadName},</p>
      <p>We received your ${jurisdiction} setup request for ${authority}.</p>
      <p>${tenantName} will review your details and contact you with next steps.</p>
      <p>Reference: ${leadReference}</p>
    `,
    text: `Hi ${input.leadName}, we received your ${rawJurisdiction} setup request for ${input.authority}. Reference: ${input.leadReference}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
