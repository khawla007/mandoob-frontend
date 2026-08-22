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
    },
    register: async () => ({ credentialId: C }) as never,
    rollback: async () => undefined,
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
    },
    register: async () => {
      calls.push('mutation');
      return { credentialId: C, state: 'draft', version: 2 } as never;
    },
    rollback: async () => {
      calls.push('rollback');
    },
    revalidate: () => {
      calls.push('revalidate');
    },
    now: () => new Date('2026-08-22T00:00:00.000Z'),
    resolveRegistration: async () => false,
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
    'rollback',
    'storage',
    'mutation',
    'revalidate',
  ]);
  assert.doesNotMatch(JSON.stringify(await response.json()), /storage|sha256|scan|signed/iu);
});

test('registration failure removes the exact orphan and never reports success', async () => {
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
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    resolveRegistration: async () => false,
    store: async () => {
      calls.push('store');
    },
    register: async () => {
      calls.push('register');
      throw new Error('private rpc path');
    },
    rollback: async () => {
      calls.push('cleanup');
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(calls, ['cleanup', 'store', 'register', 'cleanup']);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private|path/iu);
});

test('ambiguous registration failure never deletes evidence that became registered', async () => {
  let registrationsChecked = 0;
  let cleanups = 0;
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
    resolveRegistration: async () => registrationsChecked++ > 0,
    rollback: async () => {
      cleanups += 1;
    },
    store: async () => undefined,
    register: async () => {
      throw new Error('ambiguous private transport failure');
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const response = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(response.status, 500);
  assert.equal(registrationsChecked, 2);
  assert.equal(cleanups, 1, 'only the pre-upload orphan cleanup may run');
});

test('cleanup failure is sanitized and remains retryable via stable orphan pre-cleanup', async () => {
  let attempt = 0;
  let cleanupFailures = 1;
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
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    inspectFile: async () => ({ mime: 'application/pdf' }),
    scan: async () => ({ clean: true, provider: 'test' }),
    resolveRegistration: async () => false,
    rollback: async (path) => {
      calls.push(`cleanup:${path}`);
      if (cleanupFailures-- > 0) throw new Error('private storage failure');
    },
    store: async (path) => {
      calls.push(`store:${path}`);
    },
    register: async () => {
      calls.push('register');
      if (attempt++ === 0) throw new Error('private rpc failure');
      return { credentialId: C };
    },
    revalidate: () => undefined,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const first = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(first.status, 503);
  assert.doesNotMatch(JSON.stringify(await first.json()), /private|storage|path/iu);
  const second = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(second.status, 500);
  const third = await handler(
    upload(new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' })),
  );
  assert.equal(third.status, 200);
  assert.equal(calls.filter((call) => call === `cleanup:pro-credentials/${A}/${C}/${O}`).length, 4);
});
