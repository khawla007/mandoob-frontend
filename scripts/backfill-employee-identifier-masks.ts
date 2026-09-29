/**
 * One-off, idempotent backfill of masked identifier last-4 values.
 *
 *   node --conditions=react-server --import tsx scripts/backfill-employee-identifier-masks.ts [--dry-run]
 *
 * Needed once after migration 0108 for employees written before P3.08 and for
 * rows whose mask was cleared by `p308_employee_mask_guard` (P3.02 role-change
 * RPC, erasure, legacy self-passport update). Requires NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY and ENCRYPTION_KEY. Plaintext never leaves memory.
 */
import { decrypt } from '@/lib/crypto/pii';
import { planIdentifierMaskBackfill, type MaskBackfillRow } from '@/lib/employees/mask-backfill';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const PAGE = 500;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const admin = createSupabaseServiceRoleClient();
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { data, error } = await admin
      .from('employees')
      .select(
        'id, passport_no_encrypted, passport_no_last4, visa_no_encrypted, visa_no_last4, emirates_id_encrypted, emirates_id_last4',
      )
      .or(
        'and(passport_no_encrypted.not.is.null,passport_no_last4.is.null),and(visa_no_encrypted.not.is.null,visa_no_last4.is.null),and(emirates_id_encrypted.not.is.null,emirates_id_last4.is.null)',
      )
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error('BACKFILL_READ_FAILED');
    const rows = (data ?? []) as MaskBackfillRow[];
    for (const row of rows) {
      scanned += 1;
      lastId = row.id;
      const patch = planIdentifierMaskBackfill(row, decrypt);
      if (!patch) {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        const { error: updateError } = await admin.from('employees').update(patch).eq('id', row.id);
        if (updateError) throw new Error('BACKFILL_WRITE_FAILED');
      }
      updated += 1;
    }
    // Keyset pagination by id: stable under concurrent updates, skipped rows never repeat.
    if (rows.length < PAGE) break;
    lastId = rows[rows.length - 1].id;
  }
  console.log(
    JSON.stringify({ event: 'employee-mask-backfill', dryRun, scanned, updated, skipped }),
  );
}

main().catch(() => {
  console.error('employee-mask-backfill failed');
  process.exitCode = 1;
});
