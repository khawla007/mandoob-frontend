import assert from 'node:assert/strict';
import test from 'node:test';

import { finalizeBulkImportSuccess } from './import-audit';

test('a failed bulk_imported audit preserves the successful mutation result and uses company_id', async () => {
  const written: unknown[] = [];
  const success = { ok: true as const, data: { processedRows: 0, errorRows: 0 } };
  const originalError = console.error;
  console.error = () => undefined;
  let result = success;
  try {
    result = await finalizeBulkImportSuccess(success, {
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      companyId: 'company-1',
      details: { kind: 'employees', total: 0, succeeded: 0, skipped: 0, failed: 0 },
      write: async (record) => {
        written.push(record);
        throw new Error('audit unavailable');
      },
    });
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(result, success);
  assert.deepEqual(written, [
    {
      tenant_id: 'tenant-1',
      actor_id: 'actor-1',
      action: 'bulk_imported',
      source: 'self_serve',
      details: {
        company_id: 'company-1',
        kind: 'employees',
        total: 0,
        succeeded: 0,
        skipped: 0,
        failed: 0,
      },
    },
  ]);
});
