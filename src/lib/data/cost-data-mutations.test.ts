import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  createCostDataRow,
  importCostDataRows,
  setCostDataActive,
  updateCostDataRow,
} from './cost-data';

const actorId = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const input = {
  jurisdiction: 'free_zone' as const,
  authority: 'Reviewed authority',
  emirate: 'dubai',
  activityKey: null,
  feeType: 'license' as const,
  label: 'Reviewed fee',
  amount: 0,
  currency: 'AED' as const,
  recurrence: 'annual' as const,
  minShareholders: 1,
  maxShareholders: 50,
  minVisas: 0,
  maxVisas: 200,
  timelineMinDays: 0,
  timelineMaxDays: 0,
  requiredDocumentKeys: [],
  estimateGrade: false,
  active: true,
  validFrom: '2026-09-15',
  validTo: null,
  sourceId: null,
  catalogVersionId: null,
  catalogAuthorityId: null,
};

test('cost mutations call the atomic RPC with actor, operation ID, and expected version', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return {
      data: name === 'import_cost_data' ? { inserted: 1 } : { id, row_version: 8 },
      error: null,
    };
  };
  const deps = { client: { rpc } };

  assert.deepEqual(await createCostDataRow(input, { actorId, operationId }, deps), {
    id,
    rowVersion: 8,
  });
  await updateCostDataRow(id, input, { actorId, operationId, expectedVersion: 7 }, deps);
  await setCostDataActive(id, false, { actorId, operationId, expectedVersion: 8 }, deps);
  assert.deepEqual(await importCostDataRows([input], { actorId, operationId }, deps), {
    inserted: 1,
  });

  assert.deepEqual(
    calls.map((call) => call.name),
    ['mutate_cost_data', 'mutate_cost_data', 'mutate_cost_data', 'import_cost_data'],
  );
  assert.equal(calls[0]?.args.p_action, 'create');
  assert.equal(
    calls[0]?.args.p_payload && (calls[0].args.p_payload as Record<string, unknown>).amount_minor,
    0,
  );
  assert.equal(calls[1]?.args.p_expected_version, 7);
  assert.deepEqual(calls[2]?.args.p_payload, { active: false });
});

test('cost mutation provider errors map to fixed non-disclosing codes', async () => {
  await assert.rejects(
    () =>
      createCostDataRow(
        input,
        { actorId, operationId },
        {
          client: {
            rpc: async () => ({ data: null, error: { message: 'password=secret stale_version' } }),
          },
        },
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === 'COST_DATA_MUTATION_FAILED' &&
      !error.message.includes('secret'),
  );
});
