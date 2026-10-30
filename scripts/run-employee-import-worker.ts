/**
 * One pass of the P3.08 employee-import consumer.
 *
 *   node --conditions=react-server --import tsx scripts/run-employee-import-worker.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ENCRYPTION_KEY.
 * Scheduling (cron/queue runner cadence) is owned by P3.10; this entry point
 * only claims and processes currently due `employee.import.requested` jobs.
 */
import { createSupabaseImportWorkerDeps } from '@/lib/employees/import-worker-supabase';
import { runEmployeeImportWorkerOnce } from '@/lib/employees/import-worker';

async function main() {
  const summary = await runEmployeeImportWorkerOnce(await createSupabaseImportWorkerDeps());
  console.log(JSON.stringify({ event: 'employee-import.worker-pass', ...summary }));
}

main().catch(() => {
  console.error('employee-import.worker-pass failed');
  process.exitCode = 1;
});
