import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MULTIPART_BODY_ENVELOPE_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { PRO_CREDENTIAL_EVIDENCE_MAX_BYTES } from '@/lib/validation/pro-lifecycle';
import { ApiError } from '@/lib/errors';
import { createEvidencePostHandler } from './route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

test('Next proxy preserves the full 10 MiB evidence file plus multipart envelope', () => {
  const config = readFileSync('next.config.ts', 'utf8');
  assert.match(config, /proxyClientMaxBodySize:\s*11 \* 1024 \* 1024/u);
});

test('credential evidence route is statically pinned to the private-only scanner', () => {
  const source = readFileSync('src/app/api/v1/account/pro/credentials/evidence/route.ts', 'utf8');
  assert.match(source, /scanFilePrivate/u);
  assert.doesNotMatch(source, /\.scanFile\(bytes/u);
});

const A = '10000000-0000-4000-8000-000000000001';
const C = '20000000-0000-4000-8000-000000000002';
const O = '30000000-0000-4000-8000-000000000003';

const publicCredential = () => ({
  credentialId: C,
  type: 'pro_license' as const,
  maskedIdentifier: '•••• 9Z72',
  issuingAuthority: 'Synthetic Authority',
  issueDate: '2026-01-01',
  expiryDate: '2027-01-01',
  state: 'draft' as const,
  version: 2,
  evidenceCount: 1,
  submittedAt: null,
  supersedesCredentialId: null,
});
const preparedReservation = () => ({
  status: 'prepared' as const,
  credentialId: C,
  evidenceId: O,
  storagePath: `pro-credentials/${A}/${C}/${O}`,
  cleanup: [],
});

function upload(file: File, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set('credentialId', C);
  form.set('expectedVersion', '1');
  form.set('operationId', O);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', file);
  return new Request('http://localhost/upload', { method: 'POST', body: form });
}

function uploadWithExtraField(file: File) {
  const request = upload(file);
  return request.formData().then((form) => {
    form.set('unexpected', 'dirty');
    return new Request('http://localhost/upload', { method: 'POST', body: form });
  });
}

function chunkedMultipart(bytes: number) {
  return new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=fixture' },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(bytes));
      },
    }),
    duplex: 'half',
  } as RequestInit);
}

test('evidence upload missing and mismatched CSRF touch no downstream stage', async () => {
  for (const code of ['CSRF_REQUIRED', 'CSRF_MISMATCH']) {
    const touched: string[] = [];
    const handler = createEvidencePostHandler({
      guardCsrf: async () => Response.json({ code }, { status: 403 }),
      requirePro: async () => {
        touched.push('session');
        throw new Error('must not run');
      },
      resolveTarget: async () => (touched.push('target'), null),
      limit: async () => (touched.push('limit'), 'allowed'),
      finalize: async () => (touched.push('mutation'), null),
    });
    assert.equal(
      (await handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })))).status,
      403,
    );
    assert.deepEqual(touched, []);
  }
});

test('evidence upload limits before rejecting an oversized declared multipart body', async () => {
  const calls: string[] = [];
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => (calls.push('target'), { proProfileId: A, credentialIds: [C] }),
    limit: async () => (calls.push('limit'), 'allowed'),
    finalize: async () => (calls.push('mutation'), null),
  });
  const oversized = upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' }));
  oversized.headers.set(
    'content-length',
    String(PRO_CREDENTIAL_EVIDENCE_MAX_BYTES + MULTIPART_BODY_ENVELOPE_BYTES + 1),
  );
  const response = await handler(oversized);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
  calls.length = 0;
  const chunkedResponse = await handler(
    chunkedMultipart(PRO_CREDENTIAL_EVIDENCE_MAX_BYTES + MULTIPART_BODY_ENVELOPE_BYTES + 1),
  );
  assert.equal(chunkedResponse.status, 413);
  assert.equal((await chunkedResponse.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
});

test('evidence upload rejects oversized, dirty, mismatched and malware files before storage', async () => {
  let stored = 0;
  const base = {
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro' as const,
      tenantId: A,
      aal: 'aal2' as const,
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed' as const,
    inspectFile: async (_bytes: Uint8Array, declared: string) =>
      declared === 'application/pdf' ? { mime: 'application/pdf' as const } : null,
    scan: async () => ({ clean: true, provider: 'test' }),
    store: async () => {
      stored += 1;
      return 'stored' as const;
    },
    readExisting: async () => ({ bytes: new Uint8Array(), mime: null }),
    finalize: async () => ({ credentialId: C }) as never,
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
    randomId: () => '40000000-0000-4000-8000-000000000004',
  };
  const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'proof.pdf', {
    type: 'application/pdf',
  });
  assert.equal((await createEvidencePostHandler(base)(upload(oversized))).status, 413);
  assert.equal(
    (
      await createEvidencePostHandler(base)(
        upload(new File(['x'], '../dirty.pdf', { type: 'application/pdf' })),
      )
    ).status,
    400,
  );
  for (const expectedVersion of ['', '1e2', '01']) {
    assert.equal(
      (
        await createEvidencePostHandler(base)(
          upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' }), {
            expectedVersion,
          }),
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await createEvidencePostHandler(base)(
        await uploadWithExtraField(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await createEvidencePostHandler(base)(
        upload(new File(['x'], 'proof.png', { type: 'image/png' })),
      )
    ).status,
    415,
  );
  const infected = createEvidencePostHandler({
    ...base,
    scan: async () => ({ clean: false, reason: 'malware_detected', provider: 'test' }),
  });
  assert.equal(
    (await infected(upload(new File(['x'], 'proof.pdf', { type: 'application/pdf' })))).status,
    422,
  );
  assert.equal(stored, 0);
});

test('evidence upload hides denied live PRO sessions', async () => {
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => {
      throw new Error('inactive account');
    },
  });
  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 404);
  assert.doesNotMatch(JSON.stringify(await response.json()), /inactive account/iu);
});

test('evidence upload scans before private storage and registers a stable retry path without secrets', async () => {
  const calls: string[] = [];
  let path = '';
  const handler = createEvidencePostHandler({
    guardCsrf: async () => (calls.push('csrf'), null),
    requirePro: async () => (
      calls.push('session'),
      { id: A, role: 'pro', tenantId: A, aal: 'aal2', mfaEnrolled: true, email: null }
    ),
    resolveTarget: async () => (calls.push('target'), { proProfileId: A, credentialIds: [C] }),
    limit: async () => (calls.push('limit'), 'allowed'),
    inspectFile: async () => (calls.push('magic'), { mime: 'application/pdf' }),
    scan: async () => (calls.push('scan'), { clean: true, provider: 'test' }),
    reserve: async () => (calls.push('reserve'), preparedReservation()),
    store: async (p) => {
      calls.push('storage');
      path = p;
      return 'stored';
    },
    readExisting: async () => ({ bytes: new Uint8Array(), mime: null }),
    finalize: async () => {
      calls.push('mutation');
      return publicCredential();
    },
    revalidate: () => {
      calls.push('revalidate');
    },
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 200);
  assert.equal(path, `pro-credentials/${A}/${C}/${O}`);
  assert.deepEqual(calls, [
    'csrf',
    'session',
    'target',
    'limit',
    'magic',
    'scan',
    'reserve',
    'storage',
    'mutation',
    'revalidate',
  ]);
  assert.doesNotMatch(JSON.stringify(await response.json()), /storage|sha256|scan|signed/iu);
});

test('credential evidence upload aborts and returns before a late Storage write settles', async () => {
  let releaseStore!: (value: 'stored') => void;
  let storeSignal: AbortSignal | undefined;
  let finalized = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'clamav' }),
    reserve: async () => preparedReservation(),
    store: async (_path, _bytes, _mime, signal) => {
      storeSignal = signal;
      return new Promise<'stored'>((resolve) => {
        releaseStore = resolve;
      });
    },
    finalize: async () => {
      finalized += 1;
      return publicCredential();
    },
    uploadTimeoutMs: 5,
    revalidate: () => undefined,
    now: () => new Date('2026-08-26T10:00:00.000Z'),
  });
  const responsePromise = handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  const wasAborted = storeSignal?.aborted ?? false;
  releaseStore('stored');
  const response = await responsePromise;
  assert.equal(wasAborted, true);
  assert.equal(response.status, 500);
  assert.equal(finalized, 0);
  assert.doesNotMatch(await response.text(), /storage|path|timeout/iu);
});

test('late Storage write after first cleanup remains discoverable and is erased on the second pass', async () => {
  const { cleanupAbandonedProCredentialEvidenceUploads } =
    await import('@/lib/data/pro-evidence-upload-cleanup');
  let releaseStore!: () => void;
  let objectExists = false;
  let cleanupPass = 0;
  const erasedExisting: boolean[] = [];
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'clamav' }),
    reserve: async () => preparedReservation(),
    store: async () =>
      new Promise<'stored'>((resolve) => {
        releaseStore = () => {
          objectExists = true;
          resolve('stored');
        };
      }),
    finalize: async () => publicCredential(),
    uploadTimeoutMs: 5,
    revalidate: () => undefined,
    now: () => new Date('2026-08-26T10:00:00.000Z'),
  });
  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 500);

  const cleanup = () =>
    cleanupAbandonedProCredentialEvidenceUploads({
      workerId: () => A,
      claim: async () => [
        {
          reservationId: O,
          recoveryOperationId: A,
          proProfileId: A,
          credentialId: C,
          evidenceId: O,
          storagePath: `pro-credentials/${A}/${C}/${O}`,
        },
      ],
      erase: async () => {
        erasedExisting.push(objectExists);
        objectExists = false;
      },
      finalize: async () => ({ status: cleanupPass++ === 0 ? 'quiescing' : 'cleaned' }),
    });

  const first = await cleanup();
  assert.equal(first.quiescing, 1);
  releaseStore();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(objectExists, true);
  const second = await cleanup();
  assert.equal(second.cleaned, 1);
  assert.deepEqual(erasedExisting, [false, true]);
  assert.equal(objectExists, false);
});

test('evidence upload rejects protected registration output at the saved-evidence JSON boundary', async () => {
  const canaries = [
    'TASK13-CANARY-IDENTIFIER-9Z72',
    'v1:TASK13-CANARY-CIPHERTEXT',
    'TASK13-CANARY-HASH-0123456789',
    'pro-credentials/TASK13-CANARY-STORAGE-PATH',
    'https://storage.invalid/TASK13-CANARY-SIGNED-URL',
    'TASK13-CANARY-RAW-PROVIDER-ERROR',
  ];
  const response = await createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    reserve: async () => preparedReservation(),
    store: async () => 'stored',
    finalize: async () => ({
      credentialId: C,
      type: 'pro_license',
      maskedIdentifier: '•••• 9Z72',
      issuingAuthority: 'Synthetic Authority',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      state: 'draft',
      version: 2,
      evidenceCount: 1,
      submittedAt: null,
      supersedesCredentialId: null,
      identifier: canaries[0],
      identifierCiphertext: canaries[1],
      identifierHash: canaries[2],
      storagePath: canaries[3],
      signedUrl: canaries[4],
      rawError: canaries[5],
    }),
    revalidate: () => undefined,
    now: () => new Date('2026-08-24T00:00:00.000Z'),
  })(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })));
  const body = await response.text();
  assert.equal(response.status, 500);
  for (const canary of canaries) assert.equal(body.includes(canary), false);
});

test('crash after upload leaves a retryable artifact and an identical retry reuses it', async () => {
  const calls: string[] = [];
  let artifact: Uint8Array | null = null;
  let registrations = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    reserve: async () => preparedReservation(),
    store: async (_path, bytes) => {
      calls.push('store');
      if (artifact) return 'exists';
      artifact = bytes;
      return 'stored';
    },
    readExisting: async () => ({ bytes: artifact!, mime: 'application/pdf' }),
    finalize: async () => {
      calls.push('register');
      if (registrations++ === 0) throw new Error('private crash after upload');
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const first = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(first.status, 500);
  assert.doesNotMatch(JSON.stringify(await first.json()), /private|path|sha256/iu);
  const second = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(second.status, 200);
  assert.deepEqual(calls, ['store', 'register', 'store', 'register']);
});

test('two identical concurrent retries share create-only bytes and both reach idempotent registration', async () => {
  let artifact: Uint8Array | null = null;
  let registrations = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    reserve: async () => preparedReservation(),
    store: async (_path, bytes) => {
      if (artifact) return 'exists';
      artifact = bytes;
      return 'stored';
    },
    readExisting: async () => ({ bytes: artifact!, mime: 'application/pdf' }),
    finalize: async () => {
      registrations += 1;
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const responses = await Promise.all([
    handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' }))),
    handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' }))),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  );
  assert.equal(registrations, 2);
});

test('same operation with different bytes conflicts without registration or deletion', async () => {
  const existing = new TextEncoder().encode('%PDF-existing');
  let registrations = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    reserve: async () => preparedReservation(),
    store: async () => 'exists',
    readExisting: async () => ({ bytes: existing, mime: 'application/pdf' }),
    finalize: async () => {
      registrations += 1;
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const response = await handler(
    upload(new File(['%PDF-new'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'OPERATION_REUSED');
  assert.equal(registrations, 0);
});

test('same operation fails closed when stored MIME metadata is missing', async () => {
  const existing = new TextEncoder().encode('%PDF-new');
  let registrations = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    reserve: async () => preparedReservation(),
    store: async () => 'exists',
    readExisting: async () => ({ bytes: existing, mime: null }),
    finalize: async () => {
      registrations += 1;
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const response = await handler(
    upload(new File([existing], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'OPERATION_REUSED');
  assert.equal(registrations, 0);
});

test('ambiguous post-commit error leaves bytes untouched and retry reaches DB replay', async () => {
  let artifact: Uint8Array | null = null;
  let committed = false;
  let erasures = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    reserve: async () => preparedReservation(),
    store: async (_path, bytes) => {
      if (artifact) return 'exists';
      artifact = bytes;
      return 'stored';
    },
    readExisting: async () => ({ bytes: artifact!, mime: 'application/pdf' }),
    erase: async () => {
      erasures += 1;
    },
    finalize: async () => {
      if (!committed) {
        committed = true;
        throw new Error('ambiguous response');
      }
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  assert.equal(
    (await handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })))).status,
    500,
  );
  assert.equal(erasures, 0);
  assert.equal(
    (await handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })))).status,
    200,
  );
  assert.ok(artifact);
  assert.equal(erasures, 0);
});

test('expired reservation recovery cleans only the fenced unreferenced predecessor before storage', async () => {
  const calls: string[] = [];
  const cleanupPath = `pro-credentials/${A}/${C}/40000000-0000-4000-8000-000000000004`;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'clamav' }),
    reserve: async () => ({
      ...preparedReservation(),
      cleanup: [
        { reservationId: '40000000-0000-4000-8000-000000000004', storagePath: cleanupPath },
      ],
    }),
    erase: async (path) => {
      calls.push(`erase:${path}`);
    },
    store: async () => {
      calls.push('store');
      return 'stored';
    },
    finalize: async () => {
      calls.push('finalize');
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-26T10:00:00.000Z'),
  });

  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [`erase:${cleanupPath}`, 'store', 'finalize']);
  assert.doesNotMatch(await response.text(), /pro-credentials|sha256|cleanup/iu);
});

test('stale reservation preflight rejects before private storage', async () => {
  let stored = 0;
  let finalized = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'clamav' }),
    reserve: async () => {
      throw new ApiError('STALE_CREDENTIAL_VERSION', 'safe', 409);
    },
    store: async () => {
      stored += 1;
      return 'stored';
    },
    finalize: async () => {
      finalized += 1;
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-26T10:00:00.000Z'),
  });

  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'STALE_CREDENTIAL_VERSION');
  assert.equal(stored, 0);
  assert.equal(finalized, 0);
});

test('completed reservation replay returns without storage or finalization', async () => {
  let stored = 0;
  let finalized = 0;
  const handler = createEvidencePostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'clamav' }),
    reserve: async () => ({ status: 'complete', credential: publicCredential() }),
    store: async () => {
      stored += 1;
      return 'stored';
    },
    finalize: async () => {
      finalized += 1;
      return publicCredential();
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-26T10:00:00.000Z'),
  });

  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 200);
  assert.equal(stored, 0);
  assert.equal(finalized, 0);
});

test('upload reservation conflicts return sanitized route-level 409 codes before storage', async () => {
  for (const code of ['EVIDENCE_UPLOAD_IN_PROGRESS', 'EVIDENCE_UPLOAD_RESERVATION_LOST']) {
    let stored = 0;
    const handler = createEvidencePostHandler({
      guardCsrf: async () => null,
      requirePro: async () => ({
        id: A,
        role: 'pro',
        tenantId: A,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
      limit: async () => 'allowed',
      inspectFile: async () => ({ mime: 'application/pdf' }),
      scan: async () => ({ clean: true, provider: 'clamav' }),
      reserve: async () => {
        throw new ApiError(code, 'private storage path/hash', 409);
      },
      store: async () => {
        stored += 1;
        return 'stored';
      },
      revalidate: () => undefined,
      now: () => new Date('2026-08-26T10:00:00.000Z'),
    });
    const response = await handler(
      upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
    );
    assert.equal(response.status, 409);
    const body = await response.text();
    assert.match(body, new RegExp(code, 'u'));
    assert.doesNotMatch(body, /private|storage path|hash/u);
    assert.equal(stored, 0);
  }
});
