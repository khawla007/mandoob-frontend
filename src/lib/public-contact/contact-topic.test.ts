import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveContactTopic } from './contact-topic';

test('only the exact single PRO interest topic enables the contact handoff', () => {
  assert.equal(resolveContactTopic('pro-interest'), 'pro-interest');
  for (const value of [
    undefined,
    '',
    'other',
    'PRO-interest',
    ['pro-interest'],
    ['pro-interest', 'x'],
  ]) {
    assert.equal(resolveContactTopic(value), undefined);
  }
});
