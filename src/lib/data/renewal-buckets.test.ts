import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bucketRenewals } from './renewal-buckets';
import type { RenewalRow } from './renewals';

function row(id: string, daysOut: number, status: RenewalRow['status'] = 'upcoming'): RenewalRow {
  return {
    id,
    tenantId: 't',
    clientId: 'c',
    type: 'visa',
    label: `r-${id}`,
    dueDate: '2026-12-31',
    daysOut,
    status,
    source: 'manual',
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('bucketRenewals', () => {
  it('groups rows into 30/60/90/later buckets and rolls overdue into d30', () => {
    const rows: RenewalRow[] = [
      row('a', 5),
      row('b', 35),
      row('c', 70),
      row('d', 100),
      row('e', -2, 'overdue'),
    ];
    const b = bucketRenewals(rows);
    assert.equal(b.d30.length, 2);
    assert.equal(b.d60.length, 1);
    assert.equal(b.d90.length, 1);
    assert.equal(b.later.length, 1);
    assert.deepEqual(b.d30.map((r) => r.id).sort(), ['a', 'e']);
    assert.equal(b.later[0].id, 'd');
  });

  it('treats edge-case days-out values inclusively at upper bounds', () => {
    const rows: RenewalRow[] = [row('30', 30), row('60', 60), row('90', 90), row('91', 91)];
    const b = bucketRenewals(rows);
    assert.equal(b.d30.length, 1);
    assert.equal(b.d60.length, 1);
    assert.equal(b.d90.length, 1);
    assert.equal(b.later.length, 1);
    assert.equal(b.d30[0].id, '30');
    assert.equal(b.d60[0].id, '60');
    assert.equal(b.d90[0].id, '90');
    assert.equal(b.later[0].id, '91');
  });

  it('returns four empty buckets for an empty input', () => {
    const b = bucketRenewals([]);
    assert.equal(b.d30.length, 0);
    assert.equal(b.d60.length, 0);
    assert.equal(b.d90.length, 0);
    assert.equal(b.later.length, 0);
  });
});
