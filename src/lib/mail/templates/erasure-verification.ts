import type { ErasureVerification } from '@/lib/validation/email-templates';

export function erasureVerification(input: ErasureVerification) {
  const subjectName = escapeHtml(input.subjectName);
  const tenantName = escapeHtml(input.tenantName);
  const verificationUrl = escapeHtml(input.verificationUrl);
  return {
    subject: `Confirm your data erasure request with ${input.tenantName}`,
    html: `
      <p>Hi ${subjectName},</p>
      <p>Confirm that you requested erasure of your personal data linked to ${tenantName}.</p>
      <p><a href="${verificationUrl}">Confirm erasure request</a></p>
      <p>If you did not request this, ignore this email.</p>
    `,
    text: `Hi ${input.subjectName}, confirm your erasure request: ${input.verificationUrl}`,
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
