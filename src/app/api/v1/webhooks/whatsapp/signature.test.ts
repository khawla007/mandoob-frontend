process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyHubSignature } from '@/lib/whatsapp/signature';

const SECRET = 'meta-app-secret-test';

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

test('verifyHubSignature: valid signature passes', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account' });
  assert.equal(verifyHubSignature(body, sign(body), SECRET), true);
});

test('verifyHubSignature: tampered body fails', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account' });
  const sig = sign(body);
  const tampered = body + ' ';
  assert.equal(verifyHubSignature(tampered, sig, SECRET), false);
});

test('verifyHubSignature: missing prefix fails', () => {
  const body = 'hello';
  const sigNoPrefix = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  assert.equal(verifyHubSignature(body, sigNoPrefix, SECRET), false);
});

test('verifyHubSignature: empty signature fails', () => {
  assert.equal(verifyHubSignature('hello', '', SECRET), false);
});
