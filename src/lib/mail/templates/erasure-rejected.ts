import type { ErasureRejected } from '@/lib/validation/email-templates';

export function erasureRejected(input: ErasureRejected) {
  const subjectName = escapeHtml(input.subjectName);
  const tenantName = escapeHtml(input.tenantName);
  const requestId = escapeHtml(input.requestId);
  const reason = input.reason ? `<p>Reviewer note: ${escapeHtml(input.reason)}</p>` : '';
  return {
    subject: `Data erasure request ${input.requestId} was not approved`,
    html: `
      <p>Hi ${subjectName},</p>
      <p>Your personal data erasure request with ${tenantName} was reviewed and not approved.</p>
      ${reason}
      <p>Request: ${requestId}</p>
    `,
    text: `Hi ${input.subjectName}, your erasure request ${input.requestId} with ${input.tenantName} was not approved.${input.reason ? ` Reason: ${input.reason}` : ''}`,
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
