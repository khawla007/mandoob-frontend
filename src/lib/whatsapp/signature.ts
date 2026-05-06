import crypto from 'node:crypto';

export function verifyHubSignature(rawBody: string, header: string, secret: string): boolean {
  if (!header.startsWith('sha256=')) return false;
  const provided = header.slice('sha256='.length);
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (provided.length !== computed.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}
