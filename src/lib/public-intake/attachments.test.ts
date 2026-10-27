import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = 'encryption-key-with-enough-length-32chars';

const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const ATT_ID = '66666666-6666-4666-8666-666666666666';

const draftView = {
  draftId: DRAFT_ID,
  version: 1,
  answers: {},
  expiresAt: '2026-09-29T00:00:00.000Z',
  definitionId: '33333333-3333-4333-8333-333333333333',
  definitionVersion: 1,
};

const validated = {
  data: new Uint8Array([1, 2, 3]),
  mimeType: 'application/pdf',
  extension: 'pdf',
  sizeBytes: 3,
  sha256: 'a'.repeat(64),
  filename: 'doc.pdf',
};

function baseDeps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      resume: async () => draftView,
      validate: async () => {
        calls.push('validate');
        return validated;
      },
      scan: async () => {
        calls.push('scan');
        return { clean: true, provider: 'clamav' } as const;
      },
      reserve: async () => {
        calls.push('reserve');
        return { attachmentId: ATT_ID };
      },
      store: async (path: string) => {
        calls.push(`store:${path}`);
      },
      finalize: async () => {
        calls.push('finalize');
      },
      ...overrides,
    },
  };
}

const input = {
  draftId: DRAFT_ID,
  resumeSecret: 'opaque-resume-secret-value-abcdef',
  operationId: '11111111-1111-4111-8111-111111111111',
  fieldId: 'passport_copy',
  file: { data: new Uint8Array([1, 2, 3]), filename: 'doc.pdf', mimeType: 'application/pdf' },
};

test('validates, scans, reserves, stores, and finalizes in order under a private path', async () => {
  const { uploadDraftAttachment } = await import('./attachments');
  const { calls, deps } = baseDeps();
  const receipt = await uploadDraftAttachment(input, deps as never);
  assert.deepEqual(receipt, { attachmentId: ATT_ID, fieldId: 'passport_copy', scanState: 'clean' });
  assert.deepEqual(calls, [
    'validate',
    'scan',
    'reserve',
    `store:public-intake/${DRAFT_ID}/${ATT_ID}.pdf`,
    'finalize',
  ]);
});

test('rejects malware before any reservation or storage', async () => {
  const { uploadDraftAttachment } = await import('./attachments');
  const { calls, deps } = baseDeps({
    scan: async () => ({ clean: false, reason: 'malware_detected', provider: 'clamav' }),
  });
  await assert.rejects(uploadDraftAttachment(input, deps as never), /MALWARE_DETECTED/);
  assert.equal(calls.includes('reserve'), false);
  assert.equal(
    calls.some((c) => c.startsWith('store')),
    false,
  );
});

test('surfaces scanner unavailability without persisting', async () => {
  const { uploadDraftAttachment } = await import('./attachments');
  const { calls, deps } = baseDeps({
    scan: async () => ({ clean: false, reason: 'scanner_unavailable', provider: 'clamav' }),
  });
  await assert.rejects(uploadDraftAttachment(input, deps as never), /SCANNER_UNAVAILABLE/);
  assert.equal(calls.includes('reserve'), false);
});

test('refuses upload when the resume credential does not resolve a draft', async () => {
  const { uploadDraftAttachment } = await import('./attachments');
  const { deps } = baseDeps({ resume: async () => null });
  await assert.rejects(uploadDraftAttachment(input, deps as never), /DRAFT_UNAVAILABLE/);
});

test('deletes an attachment and removes its stored object when present', async () => {
  const { deleteDraftAttachment } = await import('./attachments');
  const removed: string[] = [];
  const result = await deleteDraftAttachment(
    { attachmentId: ATT_ID, draftId: DRAFT_ID, resumeSecret: 'opaque-resume-secret-value-abcdef' },
    {
      remove: async () => ({ storagePath: `public-intake/${DRAFT_ID}/${ATT_ID}.pdf` }),
      removeObject: async (path) => {
        removed.push(path);
      },
    },
  );
  assert.deepEqual(result, { deleted: true });
  assert.deepEqual(removed, [`public-intake/${DRAFT_ID}/${ATT_ID}.pdf`]);
});

test('deletes idempotently without object removal when nothing was stored', async () => {
  const { deleteDraftAttachment } = await import('./attachments');
  const removed: string[] = [];
  await deleteDraftAttachment(
    { attachmentId: ATT_ID, draftId: DRAFT_ID, resumeSecret: 'opaque-resume-secret-value-abcdef' },
    {
      remove: async () => ({ storagePath: null }),
      removeObject: async (path) => {
        removed.push(path);
      },
    },
  );
  assert.deepEqual(removed, []);
});
