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

test('nextScheduledFor: attempt 1 → 2 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(1, now).getTime();
  assert.equal((t - now) / 60_000, 2);
});

test('nextScheduledFor: attempt 2 → 4 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(2, now).getTime();
  assert.equal((t - now) / 60_000, 4);
});

test('nextScheduledFor: attempt 4 → 16 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(4, now).getTime();
  assert.equal((t - now) / 60_000, 16);
});

test('nextScheduledFor: attempt 6 → capped at 60 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(6, now).getTime();
  assert.equal((t - now) / 60_000, 60);
});

test('nextScheduledFor: attempt 10 → still capped at 60', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(10, now).getTime();
  assert.equal((t - now) / 60_000, 60);
});
