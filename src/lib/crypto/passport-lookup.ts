import 'server-only';
import { createHmac } from 'node:crypto';

const HASH_CONTEXT = 'mandoob:employee-passport-lookup:v1';

let lookupKey: Buffer | undefined;

function loadLookupKey(): Buffer {
  if (lookupKey) return lookupKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_KEY_MISSING');
  const encryptionKey = Buffer.from(raw, 'base64');
  if (encryptionKey.length !== 32) throw new Error('PII_KEY_INVALID_LENGTH');
  lookupKey = createHmac('sha256', encryptionKey).update(HASH_CONTEXT).digest();
  return lookupKey;
}

export function normalizePassportForLookup(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

export function hashPassportForLookup(
  companyId: string,
  value: string | null | undefined,
): string | null {
  const normalized = normalizePassportForLookup(value);
  const companyScope = companyId.trim().toLowerCase();
  if (!companyScope) throw new Error('PASSPORT_COMPANY_SCOPE_MISSING');
  return normalized
    ? createHmac('sha256', loadLookupKey())
        .update(companyScope)
        .update('\0')
        .update(normalized)
        .digest('hex')
    : null;
}
