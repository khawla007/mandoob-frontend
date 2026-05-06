process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type SendModule = typeof import('./send');
let mod: SendModule | null = null;
async function load(): Promise<SendModule> {
  if (!mod) mod = await import('./send');
  return mod;
}

test('sms nextScheduledFor: attempt 1 → 2 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  assert.equal((nextScheduledFor(1, now).getTime() - now) / 60_000, 2);
});

test('sms nextScheduledFor: attempt 4 → 16 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  assert.equal((nextScheduledFor(4, now).getTime() - now) / 60_000, 16);
});

test('sms nextScheduledFor: attempt 6 → capped at 60', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  assert.equal((nextScheduledFor(6, now).getTime() - now) / 60_000, 60);
});

test('sms MAX_ATTEMPTS shared with email + WA — 5', async () => {
  const { MAX_ATTEMPTS } = await load();
  assert.equal(MAX_ATTEMPTS, 5);
});
