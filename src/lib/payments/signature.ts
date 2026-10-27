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

const ISO_CURRENCY_EXPONENTS: Record<string, number> = {
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
};

export function tapCurrencyExponent(currency: string): number {
  return ISO_CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function canonicalTapAmount(value: string | number, currency: string): string | null {
  const exponent = tapCurrencyExponent(currency);
  const text = typeof value === 'number' ? value.toFixed(exponent) : value.trim();
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return null;
  const [major, fraction = ''] = text.split('.');
  if (fraction.length > exponent && /[1-9]/u.test(fraction.slice(exponent))) return null;
  return `${BigInt(major).toString()}.${fraction.slice(0, exponent).padEnd(exponent, '0')}`;
}

export function tapMajorToMinor(value: string | number, currency: string): number | null {
  const canonical = canonicalTapAmount(value, currency);
  if (!canonical) return null;
  const minor = Number(canonical.replace('.', ''));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function normalizeTapCreated(value: string | number): string | null {
  const text = String(value).trim();
  const numeric = Number(text);
  const date = /^\d+$/u.test(text) && Number.isFinite(numeric) ? new Date(numeric) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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
