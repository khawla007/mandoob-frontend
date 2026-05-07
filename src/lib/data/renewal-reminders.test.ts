process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type Mod = typeof import('./renewal-reminders');
let mod: Mod | null = null;
async function load(): Promise<Mod> {
  if (!mod) mod = await import('./renewal-reminders');
  return mod;
}

test('reminderVariantFor: 30 days out → 30', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-05-31T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 30);
});

test('reminderVariantFor: 90 days out → 90', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-04-01T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 90);
});

test('reminderVariantFor: 60 days out → 60', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-05-01T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 60);
});

test('reminderVariantFor: 7 days out → 7', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-06-23T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 7);
});

test('reminderVariantFor: 14 days out → 14', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-06-16T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 14);
});

test('reminderVariantFor: 1 day out → 1', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-06-29T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 1);
});

test('reminderVariantFor: 3 days out → 3', async () => {
  const { reminderVariantFor } = await load();
  const due = new Date('2026-06-30T00:00:00Z');
  const at = new Date('2026-06-27T00:00:00Z');
  assert.equal(reminderVariantFor(due, at), 3);
});
