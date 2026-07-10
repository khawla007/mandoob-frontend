import assert from 'node:assert/strict';
import test from 'node:test';
import { RESERVED_PAGE_SLUGS, assertPageSlugAvailable, normalizePageSlug } from './slug';

test('page slugs use blog slug normalization', () => assert.equal(normalizePageSlug(' Hello, World! '), 'hello-world'));

test('all platform routes are reserved', () => {
  const expected = '_next about account admin api apply blog callback company-setup contact estimate forgot-password invite knowledge-base legal login mfa pricing pro register reset-password signin t verify-otp'.split(' ');
  assert.deepEqual([...RESERVED_PAGE_SLUGS].sort(), expected.sort());
  for (const slug of expected) assert.throws(() => assertPageSlugAvailable(slug), /reserved/i);
  assert.equal(assertPageSlugAvailable('our-story'), 'our-story');
});

test('availability checks the normalized slug', () => assert.throws(() => assertPageSlugAvailable(' Admin '), /reserved/i));
