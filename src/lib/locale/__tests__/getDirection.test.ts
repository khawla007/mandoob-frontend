import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDirection } from '../getDirection';

test('getDirection returns ltr for en', () => {
  assert.equal(getDirection('en'), 'ltr');
});

test('getDirection returns rtl for ar', () => {
  assert.equal(getDirection('ar'), 'rtl');
});
