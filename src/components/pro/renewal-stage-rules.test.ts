import assert from 'node:assert/strict';
import test from 'node:test';
import { fromMinorUnits, NEXT_RENEWAL_STAGES, toMinorUnits } from './renewal-stage-rules';

test('client stage menu never offers a skip or a terminal exit', () => {
  assert.deepEqual(NEXT_RENEWAL_STAGES.due, ['in_progress', 'cancelled']);
  assert.equal(NEXT_RENEWAL_STAGES.due.includes('completed'), false);
  assert.deepEqual(NEXT_RENEWAL_STAGES.completed, []);
  assert.deepEqual(NEXT_RENEWAL_STAGES.cancelled, []);
});

test('money inputs convert to exact minor units', () => {
  assert.equal(toMinorUnits('1500.50'), 150050);
  assert.equal(toMinorUnits('0.1'), 10);
  assert.equal(toMinorUnits(''), 0);
  assert.equal(toMinorUnits('-1'), null);
  assert.equal(toMinorUnits('1.234'), null);
  assert.equal(fromMinorUnits(150050), '1500.50');
});
