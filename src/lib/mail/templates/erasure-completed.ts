import type { ErasureCompleted } from '@/lib/validation/email-templates';

export function erasureCompleted(input: ErasureCompleted) {
  const subjectName = escapeHtml(input.subjectName);
  const tenantName = escapeHtml(input.tenantName);
  const requestId = escapeHtml(input.requestId);
  return {
    subject: `Data erasure completed for request ${input.requestId}`,
    html: `
      <p>Hi ${subjectName},</p>
      <p>Your personal data erasure request with ${tenantName} has been completed.</p>
      <p>Request: ${requestId}</p>
      <p>Legal, financial, and audit records required for retention were preserved without direct personal identifiers where applicable.</p>
    `,
    text: `Hi ${input.subjectName}, your erasure request ${input.requestId} with ${input.tenantName} has been completed.`,
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
