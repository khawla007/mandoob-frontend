import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAllRangePages } from './range-pagination';

test('loads beyond 1000 rows without losing equal-timestamp stable-id rows', async () => {
  const rows = Array.from({ length: 2005 }, (_, index) => ({
    id: String(index).padStart(4, '0'),
    created_at: '2026-08-18T00:00:00.000Z',
  }));
  const ranges: Array<[number, number]> = [];
  const loaded = await loadAllRangePages('rows', async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.equal(loaded.length, 2005);
  assert.deepEqual(
    loaded.map((row) => row.id),
    rows.map((row) => row.id),
  );
  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test('fails closed when a later page errors instead of returning a partial report', async () => {
  await assert.rejects(
    loadAllRangePages('payments', async (from) =>
      from === 0
        ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
        : { data: null, error: { message: 'later page failed' } },
    ),
    /Failed to load payments: later page failed/u,
  );
});
