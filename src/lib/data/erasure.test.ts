import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadErasure() {
  return import('./erasure');
}

test('anonymizeEmployeeFields redacts direct PII and records a before-after diff', async () => {
  const { anonymizeEmployeeFields } = await loadErasure();

  const result = anonymizeEmployeeFields({
    name: 'Aisha Khan',
    email: 'aisha@example.com',
    phone: '+971501234567',
    passport_no_encrypted: 'passport-ciphertext',
    visa_no_encrypted: 'visa-ciphertext',
    emirates_id_encrypted: 'eid-ciphertext',
    nationality: 'India',
    status: 'active',
  });

  assert.deepEqual(result.update, {
    name: '[redacted]',
    email: null,
    phone: null,
    passport_no_encrypted: '[redacted]',
    visa_no_encrypted: '[redacted]',
    emirates_id_encrypted: '[redacted]',
  });
  assert.equal(result.diff.name.before, 'Aisha Khan');
  assert.equal(result.diff.name.after, '[redacted]');
  assert.equal(result.diff.email.before, 'aisha@example.com');
  assert.equal(result.diff.email.after, null);
  assert.equal(result.diff.nationality, undefined);
  assert.equal(result.diff.status, undefined);
});

test('anonymizeCustomerFields redacts profile PII and preserves business linkage', async () => {
  const { anonymizeCustomerFields } = await loadErasure();

  const result = anonymizeCustomerFields({
    profile: {
      full_name: 'Omar Ali',
      phone: '+971501111111',
      username: 'omar',
      title: 'Owner',
      bio: 'Founder',
    },
    customerProfile: {
      nationality: 'UAE',
      passport_no_encrypted: 'passport-ciphertext',
      linked_client_id: 'client-1',
    },
  });

  assert.deepEqual(result.profileUpdate, {
    full_name: '[redacted]',
    phone: null,
    username: null,
    title: null,
    bio: null,
  });
  assert.deepEqual(result.customerProfileUpdate, {
    nationality: null,
    passport_no_encrypted: '[redacted]',
  });
  assert.equal(result.diff.profile.full_name.before, 'Omar Ali');
  assert.equal(result.diff.customerProfile.linked_client_id, undefined);
});

test('isActiveErasureStatus only allows one unresolved request per subject', async () => {
  const { isActiveErasureStatus } = await loadErasure();

  assert.equal(isActiveErasureStatus('pending_verification'), true);
  assert.equal(isActiveErasureStatus('submitted'), true);
  assert.equal(isActiveErasureStatus('under_review'), true);
  assert.equal(isActiveErasureStatus('approved'), true);
  assert.equal(isActiveErasureStatus('completed'), false);
  assert.equal(isActiveErasureStatus('rejected'), false);
  assert.equal(isActiveErasureStatus('cancelled'), false);
});
