process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type SenderModule = typeof import('./sender');
let mod: SenderModule | null = null;
async function load(): Promise<SenderModule> {
  if (!mod) mod = await import('./sender');
  return mod;
}

test('buildSenderConfig: SMTP enabled → smtp transport', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(
    { email_sender_name: 'Acme PRO', email_reply_to: 'reply@acme.com' },
    {
      host: 'smtp.acme.com',
      port: 587,
      username: 'u',
      from_address: 'noreply@acme.com',
      enabled: true,
    },
    'platform@mail.test',
  );
  assert.equal(cfg.transport, 'smtp');
  assert.equal(cfg.from, 'noreply@acme.com');
  assert.equal(cfg.replyTo, 'reply@acme.com');
});

test('buildSenderConfig: SMTP disabled → resend with branded from', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(
    { email_sender_name: 'Acme PRO', email_reply_to: 'reply@acme.com' },
    {
      host: 'smtp.acme.com',
      port: 587,
      username: 'u',
      from_address: 'noreply@acme.com',
      enabled: false,
    },
    'platform@mail.test',
  );
  assert.equal(cfg.transport, 'resend');
  assert.equal(cfg.from, 'Acme PRO <platform@mail.test>');
  assert.equal(cfg.replyTo, 'reply@acme.com');
});

test('buildSenderConfig: no SMTP, no sender name → bare platform from', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(
    { email_sender_name: null, email_reply_to: null },
    null,
    'platform@mail.test',
  );
  assert.equal(cfg.transport, 'resend');
  assert.equal(cfg.from, 'platform@mail.test');
  assert.equal(cfg.replyTo, null);
});

test('buildSenderConfig: null tenant → bare platform from', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(null, null, 'platform@mail.test');
  assert.equal(cfg.transport, 'resend');
  assert.equal(cfg.from, 'platform@mail.test');
  assert.equal(cfg.replyTo, null);
});

test('buildSenderConfig: whitespace-only sender name treated as empty', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(
    { email_sender_name: '   ', email_reply_to: null },
    null,
    'platform@mail.test',
  );
  assert.equal(cfg.from, 'platform@mail.test');
});
