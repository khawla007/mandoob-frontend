import { createHash } from 'node:crypto';
import { identifierLast4, type IdentifierKind } from './identifiers';

export type MaskBackfillRow = {
  id: string;
  passport_no_encrypted: string | null;
  passport_no_last4: string | null;
  visa_no_encrypted: string | null;
  visa_no_last4: string | null;
  emirates_id_encrypted: string | null;
  emirates_id_last4: string | null;
};

const FIELDS: Array<[IdentifierKind, 'passport_no' | 'visa_no' | 'emirates_id']> = [
  ['passport', 'passport_no'],
  ['visa', 'visa_no'],
  ['emirates_id', 'emirates_id'],
];

/**
 * Plans the masked last-4 backfill for rows written before P3.08 (or by a
 * writer that did not supply a mask). Decrypts in the application layer only;
 * a row that cannot be decrypted is skipped rather than guessed.
 */
export function planIdentifierMaskBackfill(
  row: MaskBackfillRow,
  decrypt: (ciphertext: string) => string,
): Record<string, string> | null {
  const patch: Record<string, string> = {};
  for (const [kind, prefix] of FIELDS) {
    const ciphertext = row[`${prefix}_encrypted`];
    if (!ciphertext || row[`${prefix}_last4`]) continue;
    let plain: string;
    try {
      plain = decrypt(ciphertext);
    } catch {
      return null;
    }
    const last4 = identifierLast4(kind, plain);
    if (!last4) continue;
    patch[`${prefix}_last4`] = last4;
    patch[`${prefix}_last4_source`] = createHash('sha256').update(ciphertext, 'utf8').digest('hex');
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
