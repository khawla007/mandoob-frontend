import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidencePostHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const C = '20000000-0000-4000-8000-000000000002';
const O = '30000000-0000-4000-8000-000000000003';

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
      register: async () => (touched.push('mutation'), null),
    });
    assert.equal(
      (await handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })))).status,
      403,
    );
    assert.deepEqual(touched, []);
  }
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
    register: async () => ({ credentialId: C }) as never,
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
    store: async (p) => {
      calls.push('storage');
      path = p;
      return 'stored';
    },
    readExisting: async () => ({ bytes: new Uint8Array(), mime: null }),
    register: async () => {
      calls.push('mutation');
      return { credentialId: C, state: 'draft', version: 2 } as never;
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
    'storage',
    'mutation',
    'revalidate',
  ]);
  assert.doesNotMatch(JSON.stringify(await response.json()), /storage|sha256|scan|signed/iu);
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
    store: async (_path, bytes) => {
      calls.push('store');
      if (artifact) return 'exists';
      artifact = bytes;
      return 'stored';
    },
    readExisting: async () => ({ bytes: artifact!, mime: 'application/pdf' }),
    register: async () => {
      calls.push('register');
      if (registrations++ === 0) throw new Error('private crash after upload');
      return { credentialId: C };
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
    store: async (_path, bytes) => {
      if (artifact) return 'exists';
      artifact = bytes;
      return 'stored';
    },
    readExisting: async () => ({ bytes: artifact!, mime: 'application/pdf' }),
    register: async () => ({ credentialId: C, replay: registrations++ > 0 }),
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
    store: async () => 'exists',
    readExisting: async () => ({ bytes: existing, mime: 'application/pdf' }),
    register: async () => {
      registrations += 1;
      return { credentialId: C };
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
    store: async () => 'exists',
    readExisting: async () => ({ bytes: existing, mime: null }),
    register: async () => {
      registrations += 1;
      return { credentialId: C };
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
    store: async (_path, bytes) => {
      if (artifact) return 'exists';
      artifact = bytes;
      return 'stored';
    },
    readExisting: async () => ({ bytes: artifact!, mime: 'application/pdf' }),
    register: async () => {
      if (!committed) {
        committed = true;
        throw new Error('ambiguous response');
      }
      return { credentialId: C };
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  assert.equal(
    (await handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })))).status,
    500,
  );
  assert.equal(
    (await handler(upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })))).status,
    200,
  );
  assert.ok(artifact);
});
