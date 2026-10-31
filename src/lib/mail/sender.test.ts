process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type SenderModule = typeof import('./sender');
let mod: SenderModule | null = null;
async function load(): Promise<SenderModule> {
  if (!mod) mod = await import('./sender');
  return mod;
}

test('buildSenderConfig: branded tenant uses the platform transport', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(
    { email_sender_name: 'Acme PRO', email_reply_to: 'reply@acme.com' },
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
    'platform@mail.test',
  );
  assert.equal(cfg.transport, 'resend');
  assert.equal(cfg.from, 'platform@mail.test');
  assert.equal(cfg.replyTo, null);
});

test('buildSenderConfig: null tenant → bare platform from', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(null, 'platform@mail.test');
  assert.equal(cfg.transport, 'resend');
  assert.equal(cfg.from, 'platform@mail.test');
  assert.equal(cfg.replyTo, null);
});

test('buildSenderConfig: whitespace-only sender name treated as empty', async () => {
  const { buildSenderConfig } = await load();
  const cfg = buildSenderConfig(
    { email_sender_name: '   ', email_reply_to: null },
    'platform@mail.test',
  );
  assert.equal(cfg.from, 'platform@mail.test');
});

test('legacy SMTP rows are unreachable while tenant branding resolves the platform sender', async () => {
  const { resolveSenderForTenant } = await load();
  let tenantReads = 0;
  const sender = await resolveSenderForTenant('tenant-id', {
    async readTenant() {
      tenantReads += 1;
      return { email_sender_name: 'Acme', email_reply_to: null };
    },
  });
  assert.equal(sender.transport, 'resend');
  assert.equal(sender.from, 'Acme <no-reply@mail.fanaticcoders.com>');
  assert.equal(tenantReads, 1);
});

test('sender module contains no tenant-selected SMTP path or dead SMTP test hooks', () => {
  const source = readFileSync(new URL('./sender.ts', import.meta.url), 'utf8');
  for (const forbidden of [
    /tenant_smtp_config/iu,
    /\bnodemailer\b/iu,
    /\bcreateTransport\b/u,
    /@\/lib\/crypto\/pii/u,
    /\bdecrypt\b/u,
    /\bsmtp\b/iu,
  ])
    assert.doesNotMatch(source, forbidden);
});
