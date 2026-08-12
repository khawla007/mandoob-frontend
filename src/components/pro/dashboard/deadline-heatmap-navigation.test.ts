import assert from 'node:assert/strict';
import test from 'node:test';

import { nextDeadlineCellIndex } from './deadline-heatmap-navigation';

test('deadline grid arrows and row boundaries move focus without wrapping', () => {
  assert.equal(nextDeadlineCellIndex(2, 'ArrowRight', 2, 4, 'ltr'), 3);
  assert.equal(nextDeadlineCellIndex(3, 'ArrowRight', 2, 4, 'ltr'), 3);
  assert.equal(nextDeadlineCellIndex(5, 'ArrowLeft', 2, 4, 'ltr'), 4);
  assert.equal(nextDeadlineCellIndex(1, 'ArrowDown', 2, 4, 'ltr'), 5);
  assert.equal(nextDeadlineCellIndex(5, 'ArrowUp', 2, 4, 'ltr'), 1);
  assert.equal(nextDeadlineCellIndex(6, 'Home', 2, 4, 'ltr'), 4);
  assert.equal(nextDeadlineCellIndex(6, 'End', 2, 4, 'ltr'), 7);
});

test('deadline grid horizontal arrows reverse in RTL', () => {
  assert.equal(nextDeadlineCellIndex(2, 'ArrowRight', 2, 4, 'rtl'), 1);
  assert.equal(nextDeadlineCellIndex(1, 'ArrowLeft', 2, 4, 'rtl'), 2);
});
