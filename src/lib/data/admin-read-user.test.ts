import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/data/admin-read-user.ts'), 'utf8');

test('generic PRO read uses one masked lifecycle aggregate and never reads raw credential fields', () => {
  assert.match(source, /readEditableProCredentialSummary/u);
  assert.doesNotMatch(
    source,
    /license_no|credentials_verified|verified_at|verified_by_profile_id/u,
  );
  assert.doesNotMatch(source, /from\('pro_credentials'\)|decryptOptional\([^)]*licen/u);
});

test('inactive PRO profiles skip masked lifecycle reads while active PROs retain the summary', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

  const { readEditableProCredentialSummary } = await import('./admin-read-user');
  const mask = {
    credentialId: '33333333-3333-4333-8333-333333333333',
    type: 'pro_license' as const,
    maskedIdentifier: '•••• 1234',
    issuingAuthority: null,
    issueDate: null,
    expiryDate: null,
    state: 'verified' as const,
    version: 1,
    evidenceCount: 1,
    submittedAt: '2026-08-22T10:00:00.000Z',
    supersedesCredentialId: null,
  };
  let calls = 0;
  const reader = async () => {
    calls += 1;
    return { credentials: [mask], evidence: [] };
  };

  for (const status of ['suspended', 'disabled', 'invited'] as const) {
    assert.equal(
      await readEditableProCredentialSummary(status, 'actor-id', 'target-id', reader),
      null,
    );
  }
  assert.equal(calls, 0);
  assert.deepEqual(
    await readEditableProCredentialSummary('active', 'actor-id', 'target-id', reader),
    mask,
  );
  assert.equal(calls, 1);
});
