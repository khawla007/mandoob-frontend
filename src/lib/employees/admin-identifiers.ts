import 'server-only';

import { encrypt } from '@/lib/crypto/pii';
import { hashPassportForLookup } from '@/lib/crypto/passport-lookup';
import { employeeIdentifierColumns, type EmployeeIdentifierColumns } from './identifiers';

/**
 * Single helper for the P3.02 admin create/edit/role-change employee writes.
 * Always emits the full triple (ciphertext, keyed hash, last4) plus mask sources,
 * so a replaced identifier can never keep a stale masked value.
 */
export function adminEmployeeIdentifierColumns(
  companyId: string,
  input: { passport_no?: string | null; visa_no?: string | null; emirates_id?: string | null },
): EmployeeIdentifierColumns {
  return employeeIdentifierColumns(
    companyId,
    {
      passport_no: input.passport_no ?? null,
      visa_no: input.visa_no ?? null,
      emirates_id: input.emirates_id ?? null,
    },
    { encrypt, hashPassport: hashPassportForLookup },
  );
}
