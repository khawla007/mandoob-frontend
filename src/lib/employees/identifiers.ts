import { createHash } from 'node:crypto';

/** Seals plaintext identifiers into ciphertext + lookup hash + last4 triples. */
export type IdentifierKind = 'passport' | 'visa' | 'emirates_id';

export type IdentifierInput = {
  passport_no?: string | null;
  visa_no?: string | null;
  emirates_id?: string | null;
};

export type SealedIdentifiers = Partial<{
  passport_no_encrypted: string | null;
  passport_no_hash: string | null;
  passport_no_last4: string | null;
  visa_no_encrypted: string | null;
  visa_no_last4: string | null;
  emirates_id_encrypted: string | null;
  emirates_id_last4: string | null;
}>;

export type SealDeps = {
  encrypt: (value: string) => string;
  hashPassport: (companyId: string, normalized: string) => string | null;
};

export function normalizeIdentifier(kind: IdentifierKind, value: string): string {
  const trimmed = value.trim();
  return kind === 'emirates_id' ? trimmed : trimmed.toUpperCase();
}

export function identifierLast4(kind: IdentifierKind, value: string): string | null {
  const pattern = kind === 'emirates_id' ? /[^0-9]/gu : /[^A-Za-z0-9]/gu;
  const compact = value.replace(pattern, '').toUpperCase();
  return compact ? compact.slice(-4) : null;
}

export function sealEmployeeIdentifiers(
  companyId: string,
  input: IdentifierInput,
  deps: SealDeps,
): SealedIdentifiers {
  const sealed: SealedIdentifiers = {};
  if (input.passport_no !== undefined) {
    const normalized = normalizeIdentifier('passport', input.passport_no ?? '');
    sealed.passport_no_encrypted = normalized ? deps.encrypt(normalized) : null;
    sealed.passport_no_hash = normalized ? deps.hashPassport(companyId, normalized) : null;
    sealed.passport_no_last4 = normalized ? identifierLast4('passport', normalized) : null;
  }
  if (input.visa_no !== undefined) {
    const normalized = normalizeIdentifier('visa', input.visa_no ?? '');
    sealed.visa_no_encrypted = normalized ? deps.encrypt(normalized) : null;
    sealed.visa_no_last4 = normalized ? identifierLast4('visa', normalized) : null;
  }
  if (input.emirates_id !== undefined) {
    const normalized = normalizeIdentifier('emirates_id', input.emirates_id ?? '');
    sealed.emirates_id_encrypted = normalized ? deps.encrypt(normalized) : null;
    sealed.emirates_id_last4 = normalized ? identifierLast4('emirates_id', normalized) : null;
  }
  return sealed;
}

export type EmployeeIdentifierColumns = SealedIdentifiers &
  Partial<{
    passport_no_last4_source: string | null;
    visa_no_last4_source: string | null;
    emirates_id_last4_source: string | null;
  }>;

const maskSource = (ciphertext: string | null | undefined) =>
  ciphertext ? createHash('sha256').update(ciphertext, 'utf8').digest('hex') : null;

/**
 * Column set for writers outside the P3.08 RPCs (P3.02 admin user flows). The
 * `*_last4_source` digest binds each masked value to the ciphertext it was
 * derived from; the database guard clears any mask whose source no longer matches.
 */
export function employeeIdentifierColumns(
  companyId: string,
  input: IdentifierInput,
  deps: SealDeps,
): EmployeeIdentifierColumns {
  const sealed: EmployeeIdentifierColumns = sealEmployeeIdentifiers(companyId, input, deps);
  if ('passport_no_encrypted' in sealed)
    sealed.passport_no_last4_source = maskSource(sealed.passport_no_encrypted);
  if ('visa_no_encrypted' in sealed)
    sealed.visa_no_last4_source = maskSource(sealed.visa_no_encrypted);
  if ('emirates_id_encrypted' in sealed)
    sealed.emirates_id_last4_source = maskSource(sealed.emirates_id_encrypted);
  return sealed;
}
