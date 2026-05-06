import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minorToMajor } from './tap';

test('minorToMajor formats AED fils to two decimals', () => {
  assert.equal(minorToMajor(BigInt(125000), 'AED'), '1250.00');
  assert.equal(minorToMajor(BigInt(50), 'AED'), '0.50');
  assert.equal(minorToMajor(BigInt(0), 'AED'), '0.00');
});

test('minorToMajor accepts number input', () => {
  assert.equal(minorToMajor(199, 'AED'), '1.99');
});

test('minorToMajor falls back to 2 decimals for unknown currency', () => {
  assert.equal(minorToMajor(BigInt(1234), 'XYZ'), '12.34');
});
