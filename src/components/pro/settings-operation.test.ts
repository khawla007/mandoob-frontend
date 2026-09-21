import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('retry retains operation identity until edit or success; new work uses the advanced version', async () => {
  assert.ok(existsSync(join(process.cwd(), 'src/components/pro/settings-operation.ts')));
  const { prepareSettingsOperation } = await import('./settings-operation');
  let ids = 0;
  const createId = () => String(++ids);
  const first = prepareSettingsOperation(null, 4, createId);
  assert.deepEqual(first, { operation_id: '1', expected_version: 4 });
  assert.equal(prepareSettingsOperation(first, 4, createId), first);
  const edited = prepareSettingsOperation(null, 4, createId);
  assert.equal(edited.operation_id, '2');
  const next = prepareSettingsOperation(null, 5, createId);
  assert.deepEqual(next, { operation_id: '3', expected_version: 5 });
});
