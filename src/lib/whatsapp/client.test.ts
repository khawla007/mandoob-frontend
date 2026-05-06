process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMetaError } from './client';

test('mapMetaError: 5xx is retryable', () => {
  const r = mapMetaError(503, { error: { code: 1, message: 'service unavailable' } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('mapMetaError: 429 rate-limit code is retryable', () => {
  const r = mapMetaError(400, { error: { code: 130429, message: 'rate limit hit' } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('mapMetaError: 131056 pair-rate-limit is retryable', () => {
  const r = mapMetaError(400, { error: { code: 131056, message: 'pair rate limited' } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('mapMetaError: 131047 re-engagement is non-retryable', () => {
  const r = mapMetaError(400, { error: { code: 131047, message: 're-engagement window' } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, false);
});

test('mapMetaError: generic 4xx is non-retryable', () => {
  const r = mapMetaError(400, { error: { code: 100, message: 'invalid parameter' } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, false);
});

test('mapMetaError: missing payload still produces error string', () => {
  const r = mapMetaError(500, null);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.retryable, true);
    assert.match(r.error, /Meta HTTP 500/);
  }
});
