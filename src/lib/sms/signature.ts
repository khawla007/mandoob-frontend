import crypto from 'node:crypto';

// Twilio signature spec: HMAC-SHA1 of `url + concat(sortedParamKeyValues)`,
// base64-encoded. https://www.twilio.com/docs/usage/webhooks/webhooks-security
export function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string,
): boolean {
  if (!signatureHeader) return false;
  const sortedKeys = Object.keys(params).sort();
  let payload = fullUrl;
  for (const key of sortedKeys) payload += key + params[key];
  const expected = crypto.createHmac('sha1', authToken).update(payload).digest('base64');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Unifonic webhook signature: HMAC-SHA256 hex of the raw request body using
// a shared secret. The exact header name depends on Unifonic dashboard
// config; we accept either `x-unifonic-signature` or generic `x-signature`
// at the route layer and pass the value here.
export function verifyUnifonicSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader.toLowerCase());
  const b = Buffer.from(computed);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
