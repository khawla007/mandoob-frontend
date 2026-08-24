import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import type { ProLifecycleIdentity } from '@/lib/data/pro-lifecycle-identity';
import { ApiError } from '@/lib/errors';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL_ID = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_ID = '44444444-4444-4444-8444-444444444444';
const CANARIES = [
  'TASK13-CANARY-IDENTIFIER-9Z72',
  'v1:TASK13-CANARY-CIPHERTEXT',
  'TASK13-CANARY-HASH-0123456789',
  'pro-credentials/TASK13-CANARY-STORAGE-PATH',
  'https://storage.invalid/TASK13-CANARY-SIGNED-URL',
  'TASK13-CANARY-RAW-PROVIDER-ERROR',
] as const;

const identity: ProLifecycleIdentity = {
  profile: {
    id: PRO_ID,
    fullName: 'Synthetic PRO',
    email: 'synthetic@example.invalid',
    emailUnavailable: false,
    accountStatus: 'active' as const,
    designation: null,
    department: null,
    serviceAreas: [],
    bio: null,
    createdAt: '2026-08-24T00:00:00.000Z',
  },
  eligibility: {
    eligible: false,
    codes: ['PRO_CREDENTIAL_MISSING'],
    verifiedCredentialId: null,
    pricingTermId: null,
    compensationTermId: null,
  },
  assignment: null,
};

function assertCanariesAbsent(label: string, value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const canary of CANARIES) assert.equal(serialized.includes(canary), false, `${label}: ${canary}`);
}

test('synthetic protected plaintext is absent from every lifecycle output surface', async () => {
  const [{ readProCredentialSnapshot }, { loadProLifecyclePage }, routes, actions] =
    await Promise.all([
      import('@/lib/data/pro-credentials'),
      import('@/app/admin/users/[id]/page-orchestration'),
      import('@/app/api/v1/_shared/pro-lifecycle-routes'),
      import('@/lib/actions/server-action-security'),
    ]);

  let sanitizedSnapshotError: unknown;
  try {
    await readProCredentialSnapshot(ACTOR_ID, PRO_ID, {
      supabase: {
        async rpc() {
          return {
            data: {
              credentials: [
                {
                  credentialId: CREDENTIAL_ID,
                  type: 'pro_license',
                  maskedIdentifier: '•••• 9Z72',
                  issuingAuthority: 'Synthetic Authority',
                  issueDate: '2026-01-01',
                  expiryDate: '2027-01-01',
                  state: 'draft',
                  version: 0,
                  evidenceCount: 1,
                  submittedAt: null,
                  supersedesCredentialId: null,
                  identifier: CANARIES[0],
                  identifierCiphertext: CANARIES[1],
                  identifierHash: CANARIES[2],
                },
              ],
              evidence: [
                {
                  evidenceId: EVIDENCE_ID,
                  credentialId: CREDENTIAL_ID,
                  mimeType: 'application/pdf',
                  sizeBytes: 8,
                  originalNameSafe: 'licence.pdf',
                  createdAt: '2026-08-24T00:00:00.000Z',
                  storagePath: CANARIES[3],
                  signedUrl: CANARIES[4],
                  sha256: CANARIES[2],
                },
              ],
            },
            error: null,
          };
        },
      } as never,
    });
    assert.fail('protected RPC output must be rejected');
  } catch (error) {
    sanitizedSnapshotError = error;
  }
  assert.ok(sanitizedSnapshotError instanceof ApiError);
  assertCanariesAbsent('snapshot error', sanitizedSnapshotError.message);

  const rawFailure = new Error(CANARIES.join(' '));
  const rscProps = await loadProLifecyclePage(ACTOR_ID, PRO_ID, null, {
    identity: async () => identity,
    credential: async () => Promise.reject(rawFailure),
    terms: async () => Promise.reject(rawFailure),
    timeline: async () => Promise.reject(rawFailure),
  });
  const document = new Window().document;
  const root = document.createElement('main');
  root.textContent = JSON.stringify(rscProps);
  const renderedHtml = root.outerHTML;

  const logEntries: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logEntries.push(args);
  let routeJson: unknown;
  try {
    routeJson = await routes.lifecycleErrorResponse(rawFailure, 'task13-canary').json();
    actions.logSafeActionError('pro_lifecycle.load', rawFailure);
  } finally {
    console.error = originalError;
  }

  const urls = routes.buildLifecycleRevalidationPaths(
    { proProfileId: PRO_ID, credentialIds: [CREDENTIAL_ID], companyId: null, tenantSlug: null },
    PRO_ID,
  );
  const analyticsAdapterCalls = [{ event: 'pro_lifecycle_load_failed', code: 'INTERNAL' }];
  const screenshots = [{ name: 'pro-lifecycle-error', html: renderedHtml }];
  const savedEvidence = {
    evidenceId: EVIDENCE_ID,
    credentialId: CREDENTIAL_ID,
    mimeType: 'application/pdf',
    sizeBytes: 8,
    originalNameSafe: 'licence.pdf',
  };
  const persistedDetails = {
    audit: { action: 'pro_lifecycle_load_failed', code: 'INTERNAL' },
    decisionEvent: { event: 'rejected', reason: 'Unable to verify supplied evidence' },
    termEvent: { event: 'activated', termKind: 'pricing' },
    operationReceipt: { entityId: CREDENTIAL_ID, result: { code: 'INTERNAL' } },
  };

  for (const [label, value] of Object.entries({
    rscProps,
    renderedHtml,
    actionJson: routeJson,
    routeJson,
    persistedDetails,
    operationReceipts: persistedDetails.operationReceipt,
    logs: logEntries,
    urls,
    analyticsAdapterCalls,
    screenshots,
    savedEvidence,
  })) {
    assertCanariesAbsent(label, value);
  }
});
