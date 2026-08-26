// Set env before any import that touches @/lib/env or @/lib/crypto/pii
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type AccountSelfModule = typeof import('./account-self');
let mod: AccountSelfModule | null = null;
async function loadMod(): Promise<AccountSelfModule> {
  if (!mod) mod = await import('./account-self');
  return mod;
}

test('diffProfile detects display_name change', async () => {
  const { diffProfile } = await loadMod();
  const d = diffProfile(
    { full_name: 'Old', phone: '+971500000000' },
    { display_name: 'New', phone: '+971500000000' },
  );
  assert.deepEqual(d.changedKeys, ['full_name']);
  assert.equal(d.update.full_name, 'New');
});

test('diffProfile no-op returns empty changedKeys', async () => {
  const { diffProfile } = await loadMod();
  const d = diffProfile(
    { full_name: 'Same', phone: '+971500000000' },
    { display_name: 'Same', phone: '+971500000000' },
  );
  assert.deepEqual(d.changedKeys, []);
});

test('buildRoleUpdate for pro contains non-credential profile fields only', async () => {
  const { buildRoleUpdate } = await loadMod();
  const u = buildRoleUpdate('pro', {
    designation: 'PRO',
    department: 'Ops',
    service_areas: ['Dubai'],
    bio: null,
  });
  assert.equal('license_no_encrypted' in u, false);
  assert.equal(u.designation, 'PRO');
});

test('self credential loader returns only masks and safe evidence metadata', async () => {
  const { readSelfProCredentialSnapshot } = await loadMod();
  const profileId = '11111111-1111-4111-8111-111111111111';
  const snapshot = await readSelfProCredentialSnapshot(profileId, {
    readCredentialSnapshot: async (actorId, targetId) => {
      assert.equal(actorId, profileId);
      assert.equal(targetId, profileId);
      return {
        credentials: [
          {
            credentialId: '22222222-2222-4222-8222-222222222222',
            type: 'pro_license' as const,
            maskedIdentifier: '•••• 1234',
            issuingAuthority: 'DET',
            issueDate: '2026-01-01',
            expiryDate: '2027-01-01',
            state: 'verified' as const,
            version: 2,
            evidenceCount: 1,
            submittedAt: '2026-08-20T10:00:00.000Z',
            supersedesCredentialId: null,
          },
        ],
        evidence: [
          {
            evidenceId: '33333333-3333-4333-8333-333333333333',
            credentialId: '22222222-2222-4222-8222-222222222222',
            mimeType: 'application/pdf' as const,
            sizeBytes: 1024,
            originalNameSafe: 'licence.pdf',
            createdAt: '2026-08-20T10:00:00.000Z',
          },
        ],
      };
    },
    readTimeline: async () => ({
      items: [
        {
          eventAt: '2026-08-20T12:00:00.000Z',
          eventId: '44444444-4444-4444-8444-444444444444',
          eventKind: 'credential_verified',
          summaryCode: 'VERIFIED',
          reasonCode: null,
          reason: null,
          actorDisplayName: null,
          companyDisplayName: null,
        },
      ],
      nextCursor: null,
    }),
  });
  assert.equal(snapshot.credentials[0]?.maskedIdentifier, '•••• 1234');
  assert.equal(snapshot.latestDecision?.summaryCode, 'VERIFIED');
  assert.doesNotMatch(JSON.stringify(snapshot), /ciphertext|identifierHash|storagePath|sha256/u);
});

test('self credential loader isolates optional timeline failure from the masked snapshot', async () => {
  const { readSelfProCredentialSnapshot } = await loadMod();
  const profileId = '11111111-1111-4111-8111-111111111111';
  const snapshot = await readSelfProCredentialSnapshot(profileId, {
    readCredentialSnapshot: async () => ({ credentials: [], evidence: [] }),
    readTimeline: async () => {
      throw new Error('private source error');
    },
  });
  assert.deepEqual(snapshot, { credentials: [], evidence: [], latestDecision: null });
});

test('buildRoleUpdate for customer encrypts passport_no', async () => {
  const { buildRoleUpdate } = await loadMod();
  const u = buildRoleUpdate('customer', {
    nationality: 'AE',
    passport_no: 'A1234567',
  });
  assert.equal(typeof u.passport_no_encrypted, 'string');
  assert.equal(u.nationality, 'AE');
});

test('employee role updates cannot use the browser-RLS patch builder', async () => {
  const { buildRoleUpdate } = await loadMod();
  assert.throws(
    () => buildRoleUpdate('employee', { passport_no: 'B7654321' }),
    /Employee role details require live authorization/,
  );
});
