import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertImportJobTransitionMatched,
  ImportJobTransitionConflict,
  isImportJobCancellable,
  scopeImportJobMutation,
  shouldCompensateImportFailure,
} from './import-job-scope';

test('cross-tenant import job cannot match a privileged mutation scope', () => {
  const filters: Array<[string, unknown]> = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return query;
    },
  };
  scopeImportJobMutation(query, 'tenant-a', 'company-a', 'job-1', 'importing');

  const matches = (row: Record<string, unknown>) =>
    filters.every(([column, value]) => row[column] === value);
  assert.equal(
    matches({ tenant_id: 'tenant-a', company_id: 'company-a', id: 'job-1', status: 'importing' }),
    true,
  );
  assert.equal(
    matches({ tenant_id: 'tenant-b', company_id: 'company-a', id: 'job-1', status: 'importing' }),
    false,
  );
  assert.equal(
    matches({ tenant_id: 'tenant-a', company_id: 'company-b', id: 'job-1', status: 'importing' }),
    false,
  );
  assert.equal(
    matches({ tenant_id: 'tenant-a', company_id: 'company-a', id: 'job-1', status: 'validated' }),
    false,
  );
});

type Status = 'validated' | 'importing' | 'cancelled' | 'completed';

async function raceTransitions(nextStatuses: [Status, Status]) {
  let status: Status = 'validated';
  let downstreamWrites = 0;
  let compensationWrites = 0;
  const transition = async (next: Status) => {
    try {
      await Promise.resolve();
      const matched = status === 'validated' ? { id: 'job-1' } : null;
      if (matched) status = next;
      assertImportJobTransitionMatched(matched);
      downstreamWrites += 1;
    } catch (error) {
      if (shouldCompensateImportFailure(error)) compensationWrites += 1;
      throw error;
    }
  };
  const results = await Promise.allSettled(nextStatuses.map(transition));
  return { results, status: status as Status, downstreamWrites, compensationWrites };
}

test('concurrent execute requests have one CAS winner and loser does no downstream work', async () => {
  const race = await raceTransitions(['importing', 'importing']);
  assert.equal(race.results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(race.downstreamWrites, 1);
  assert.equal(race.compensationWrites, 0);
  const rejection = race.results.find((result) => result.status === 'rejected');
  assert.ok(rejection?.status === 'rejected');
  assert.ok(rejection.reason instanceof ImportJobTransitionConflict);
});

test('execute versus cancel has one exact-status winner and loser does no downstream work', async () => {
  const race = await raceTransitions(['importing', 'cancelled']);
  assert.equal(race.results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(race.downstreamWrites, 1);
  assert.equal(race.compensationWrites, 0);
  assert.ok(race.status === 'importing' || race.status === 'cancelled');
});

test('cancel loses after execute owns importing and only executor completes', () => {
  let status: Status = 'validated';
  let executorWrites = 0;
  let cancelWrites = 0;

  assertImportJobTransitionMatched(status === 'validated' ? { id: 'job-1' } : null);
  status = 'importing';
  assert.equal(isImportJobCancellable(status), false);
  if (isImportJobCancellable(status)) cancelWrites += 1;

  assertImportJobTransitionMatched(status === 'importing' ? { id: 'job-1' } : null);
  status = 'completed';
  executorWrites += 1;

  assert.equal(status, 'completed');
  assert.equal(executorWrites, 1);
  assert.equal(cancelWrites, 0);
});
