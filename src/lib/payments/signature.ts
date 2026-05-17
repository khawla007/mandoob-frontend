import crypto from 'node:crypto';

// Tap webhook hashstring: HMAC-SHA256 over the field concatenation
//   x_id|x_amount|x_currency|x_gateway_reference|x_payment_reference|x_status|x_created
// per https://developers.tap.company/docs/webhook (lowercase hex digest).
//
// Caller is responsible for extracting the field values from the parsed payload
// in the order Tap documents — see `tapHashstringInput`.

export type TapHashstringFields = {
  id: string;
  amount: string;
  currency: string;
  gatewayReference: string;
  paymentReference: string;
  status: string;
  created: string;
};

export function tapHashstringInput(fields: TapHashstringFields): string {
  return [
    `x_id${fields.id}`,
    `x_amount${fields.amount}`,
    `x_currency${fields.currency}`,
    `x_gateway_reference${fields.gatewayReference}`,
    `x_payment_reference${fields.paymentReference}`,
    `x_status${fields.status}`,
    `x_created${fields.created}`,
  ].join('');
}

export function computeTapHashstring(fields: TapHashstringFields, secret: string): string {
  return crypto.createHmac('sha256', secret).update(tapHashstringInput(fields)).digest('hex');
}

export function verifyTapHashstring(
  fields: TapHashstringFields,
  header: string,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = computeTapHashstring(fields, secret);
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
