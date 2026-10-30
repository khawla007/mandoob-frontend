import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  signDocumentAccess,
  createDocumentAccessDependencies,
  type DocumentAccessDependencies,
} from './document-access';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../errors';

const id = (n: number) => `${n.toString().padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
const input = {
  actorId: id(1),
  tenantId: id(2),
  companyId: id(3),
  documentId: id(4),
  versionId: id(5),
  lifetimeSeconds: 300,
};
const now = Date.parse('2026-09-17T10:00:00Z');
const expiresAt = new Date(now + 300000).toISOString();
const path = `${input.tenantId}/${input.companyId}/documents/${id(6)}/${id(7)}.pdf`;
const context = {
  status: 'allowed',
  tenantId: input.tenantId,
  companyId: input.companyId,
  requestId: null,
  documentId: input.documentId,
  versionId: input.versionId,
  operationId: id(6),
  sha256: 'a'.repeat(64),
  storageBucket: 'tenant-documents',
  storagePath: path,
  mimeType: 'application/pdf',
  sizeBytes: 1,
  expiresAt,
  objectId: id(7),
  extension: 'pdf',
};
function url(claims = {}, header = { alg: 'HS256', typ: 'JWT' }) {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `https://storage.example/storage/v1/object/sign/tenant-documents/${path}?token=${b64(header)}.${b64({ url: `tenant-documents/${path}`, exp: now / 1000 + 300, ...claims })}.${Buffer.alloc(32, 1).toString('base64url')}`;
}
function urlAt(origin: string) {
  return url().replace('https://storage.example', origin);
}
function fixture() {
  const calls: { name: string; args: Record<string, unknown>; signal: AbortSignal }[] = [];
  const deps: DocumentAccessDependencies = {
    now: () => now,
    apiBaseUrl: 'https://storage.example',
    timeoutMs: 30,
    rpc: async (name, args, signal) => {
      calls.push({ name, args, signal });
      return name === 'resolve_document_access'
        ? { ...context }
        : { status: 'granted', auditId: id(8), expiresAt };
    },
    sign: async () => ({ data: { signedUrl: url() }, error: null }),
  };
  return { deps, calls };
}
async function rejects(deps: DocumentAccessDependencies, status: number, value = input) {
  await assert.rejects(signDocumentAccess(value, deps), (e: unknown) => {
    assert.equal((e as { status: number }).status, status);
    assert.doesNotMatch(JSON.stringify(e), /storage\.example|token=|private sentinel/);
    return true;
  });
}
test('private signing precedes fresh required audit; only bearer and actual expiry escape', async () => {
  const { deps, calls } = fixture();
  const result = await signDocumentAccess(input, deps);
  assert.deepEqual(result, { url: url(), expiresAt });
  assert.deepEqual(
    calls.map((c) => c.name),
    ['resolve_document_access', 'finalize_document_access_grant'],
  );
  assert.deepEqual(calls[0].args, {
    p_actor_id: id(1),
    p_tenant_id: id(2),
    p_company_id: id(3),
    p_document_id: id(4),
    p_version_id: id(5),
    p_lifetime_seconds: 300,
  });
  assert.deepEqual(calls[1].args, {
    ...calls[0].args,
    p_expected_operation_id: id(6),
    p_expected_sha256: 'a'.repeat(64),
    p_provider_expires_at: expiresAt,
  });
  assert.notEqual(calls[0].signal, calls[1].signal);
});
test('committed resolver denial returns generic forbidden without calling provider', async () => {
  const { deps } = fixture();
  let committed = false;
  deps.rpc = async () => {
    committed = true;
    return { status: 'denied' };
  };
  deps.sign = async () => {
    assert.fail('must not sign');
  };
  await rejects(deps, 403);
  assert.equal(committed, true);
});
for (const value of [0, 301, 1.5, NaN])
  test(`invalid lifetime ${value}`, async () => {
    const { deps } = fixture();
    deps.rpc = async () => assert.fail('input rejected first');
    await rejects(deps, 400, { ...input, lifetimeSeconds: value });
  });
test('traversal input rejected before boundary', async () => {
  const { deps } = fixture();
  await rejects(deps, 400, { ...input, documentId: '../private' });
});
for (const change of [
  { tenantId: id(9) },
  { companyId: id(9) },
  { documentId: id(9) },
  { versionId: id(9) },
  { storagePath: '../private' },
  { sha256: 'bad' },
  { sizeBytes: 0 },
  { mimeType: 'text/html' },
  { extra: true },
  { expiresAt: new Date(now + 301000).toISOString() },
])
  test(`resolver protocol rejects ${Object.keys(change)[0]}`, async () => {
    const { deps } = fixture();
    deps.rpc = async () => ({ ...context, ...change });
    deps.sign = async () => assert.fail('invalid context');
    await rejects(deps, 502);
  });
for (const signedUrl of [
  url({ url: 'tenant-documents/foreign' }),
  url({ exp: now / 1000 }),
  url({ exp: now / 1000 + 301 }),
  url({}, { alg: 'none', typ: 'JWT' }),
  url().replace('https:', 'http:'),
  url().replace('storage.example', 'foreign.example'),
  `${url()}&download=x`,
  `${url()}#x`,
])
  test('provider malformed bearer never finalized', async () => {
    const { deps, calls } = fixture();
    deps.sign = async () => ({ data: { signedUrl }, error: null });
    await rejects(deps, 502);
    assert.equal(calls.length, 1);
  });
for (const result of [
  { status: 'denied' },
  { status: 'granted', expiresAt },
  { status: 'granted', auditId: id(8), expiresAt, url: 'private sentinel' },
  { status: 'granted', auditId: id(8), expiresAt: new Date(now + 299000).toISOString() },
])
  test('fresh denial or missing/malformed mandatory audit hides private bearer', async () => {
    const { deps } = fixture();
    deps.rpc = async (name) => (name === 'resolve_document_access' ? context : result);
    await rejects(deps, result.status === 'denied' ? 403 : 502);
  });
test('provider failure cannot finalize and raw errors are redacted', async () => {
  const { deps, calls } = fixture();
  deps.sign = async () => {
    throw new Error('private sentinel');
  };
  await rejects(deps, 503);
  assert.equal(calls.length, 1);
});
test('lost grant acknowledgement does not guess success', async () => {
  const { deps } = fixture();
  deps.rpc = async (name) => {
    if (name === 'resolve_document_access') return context;
    throw { message: 'private sentinel', code: 'unknown' };
  };
  await rejects(deps, 503);
});
for (const boundary of ['resolve', 'sign', 'finalize'])
  test(`stalled ${boundary} bounded and late result cannot escape`, async () => {
    const { deps } = fixture();
    let signal: AbortSignal | undefined;
    const stall = async (s: AbortSignal) => {
      signal = s;
      return new Promise<never>(() => {});
    };
    const rpc = deps.rpc;
    deps.rpc = async (name, args, s) =>
      name ===
      (boundary === 'resolve'
        ? 'resolve_document_access'
        : boundary === 'finalize'
          ? 'finalize_document_access_grant'
          : '')
        ? stall(s)
        : rpc(name, args, s);
    if (boundary === 'sign') deps.sign = async (_b, _p, _t, s) => stall(s);
    await rejects(deps, 503);
    assert.equal(signal?.aborted, true);
  });
test('snapshots normalized input and resolver context before signing await', async () => {
  const { deps, calls } = fixture();
  const mutable = { ...input };
  const ctx = { ...context };
  deps.rpc = async (name, args, signal) => {
    calls.push({ name, args, signal });
    return name === 'resolve_document_access'
      ? ctx
      : { status: 'granted', auditId: id(8), expiresAt };
  };
  deps.sign = async () => {
    mutable.companyId = id(9);
    ctx.operationId = id(9);
    ctx.sha256 = 'b'.repeat(64);
    return { data: { signedUrl: url() }, error: null };
  };
  await signDocumentAccess(mutable, deps);
  assert.equal(calls[1].args.p_company_id, id(3));
  assert.equal(calls[1].args.p_expected_operation_id, id(6));
  assert.equal(calls[1].args.p_expected_sha256, 'a'.repeat(64));
});
test('SDK factory uses actual createSignedUrl minimal response shape and fresh global abort client', async () => {
  const signals: AbortSignal[] = [];
  const client = async (signal: AbortSignal) => {
    signals.push(signal);
    return {
      rpc: async (name: string) => ({
        data:
          name === 'resolve_document_access'
            ? context
            : { status: 'granted', auditId: id(8), expiresAt },
        error: null,
      }),
      storage: {
        from: (bucket: string) => {
          assert.equal(bucket, 'tenant-documents');
          return {
            createSignedUrl: async (resource: string, ttl: number) => {
              assert.equal(resource, path);
              assert.equal(ttl, 300);
              return { data: { signedUrl: url() }, error: null };
            },
          };
        },
      },
    } as unknown as SupabaseClient;
  };
  const deps = createDocumentAccessDependencies({ client, apiBaseUrl: 'https://storage.example' });
  deps.now = () => now;
  assert.deepEqual(await signDocumentAccess(input, deps), { url: url(), expiresAt });
  assert.equal(new Set(signals).size, 3);
});
test('ignored provider abort and late bearer never cause a grant', async () => {
  const { deps, calls } = fixture();
  let complete: ((v: unknown) => void) | undefined;
  deps.sign = async () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  await rejects(deps, 503);
  complete?.({ data: { signedUrl: url() }, error: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
});
test('bearer snapshot survives provider response mutation during final audit', async () => {
  const { deps } = fixture();
  const response = { data: { signedUrl: url() }, error: null };
  deps.sign = async () => response;
  deps.rpc = async (name) => {
    if (name === 'resolve_document_access') return context;
    response.data.signedUrl = 'private sentinel';
    return { status: 'granted', auditId: id(8), expiresAt };
  };
  assert.deepEqual(await signDocumentAccess(input, deps), { url: url(), expiresAt });
});
test('actual token expiry, not requested deadline, is forwarded and returned', async () => {
  const { deps, calls } = fixture();
  const actual = new Date(now + 299000).toISOString();
  const rpc = deps.rpc;
  deps.sign = async () => ({ data: { signedUrl: url({ exp: now / 1000 + 299 }) }, error: null });
  deps.rpc = async (name, args, signal) => {
    const result = await rpc(name, args, signal);
    return name === 'resolve_document_access'
      ? result
      : { status: 'granted', auditId: id(8), expiresAt: actual };
  };
  assert.equal((await signDocumentAccess(input, deps)).expiresAt, actual);
  assert.equal(calls[1].args.p_provider_expires_at, actual);
});
test('expiry while audit is awaited hides bearer even on committed grant', async () => {
  const { deps } = fixture();
  let time = now;
  deps.now = () => time;
  deps.rpc = async (name) => {
    if (name === 'resolve_document_access') return context;
    time += 300000;
    return { status: 'granted', auditId: id(8), expiresAt };
  };
  await rejects(deps, 502);
});
test('uppercase PostgreSQL IDs normalize and optional lifetime defaults five minutes', async () => {
  const { deps, calls } = fixture();
  const ids = {
    actorId: input.actorId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    documentId: input.documentId,
    versionId: input.versionId,
  };
  await signDocumentAccess(
    Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.toUpperCase()])) as typeof ids,
    deps,
  );
  assert.equal(calls[0].args.p_actor_id, input.actorId);
  assert.equal(calls[0].args.p_lifetime_seconds, 300);
});
for (const [code, status] of [
  ['DU403', 403],
  ['DU409', 409],
  ['DU410', 410],
  ['DU422', 422],
] as const)
  test(`sanitized SQL ${code} mapping`, async () => {
    const { deps } = fixture();
    deps.rpc = async () => {
      throw { code, message: 'private sentinel', details: url() };
    };
    await rejects(deps, status);
  });
test('provider cannot smuggle a frozen ApiError with private details', async () => {
  const { deps } = fixture();
  deps.sign = async () => {
    throw Object.freeze(new ApiError('RAW', 'private sentinel', 503, { url: url() }));
  };
  await rejects(deps, 503);
});
test('unexpected provider envelope metadata is rejected before grant', async () => {
  const { deps, calls } = fixture();
  deps.sign = async () => ({
    data: { signedUrl: url(), privateName: 'private sentinel' },
    error: null,
  });
  await rejects(deps, 502);
  assert.equal(calls.length, 1);
});
test('resolver clock advances during response; context future bound uses fresh receive time', async () => {
  const { deps } = fixture();
  let time = now;
  deps.now = () => time;
  deps.rpc = async (name) => {
    if (name === 'resolve_document_access') {
      time += 50;
      return { ...context, expiresAt: new Date(now + 300050).toISOString() };
    }
    return { status: 'granted', auditId: id(8), expiresAt };
  };
  assert.deepEqual(await signDocumentAccess(input, deps), { url: url(), expiresAt });
});
test('resolver latency reduces provider TTL to remaining whole seconds', async () => {
  const { deps } = fixture();
  let time = now;
  let signedTtl: number | undefined;
  const providerExpiresAt = new Date(now + 299000).toISOString();
  deps.now = () => time;
  deps.rpc = async (name) => {
    if (name === 'resolve_document_access') {
      time += 2100;
      return { ...context, expiresAt: new Date(time + 300000).toISOString() };
    }
    return { status: 'granted', auditId: id(8), expiresAt: providerExpiresAt };
  };
  deps.sign = async (_bucket, _path, ttl) => {
    signedTtl = ttl;
    const signingSecond = Math.floor(time / 1000);
    return { data: { signedUrl: url({ exp: signingSecond + ttl }) }, error: null };
  };
  assert.deepEqual(await signDocumentAccess(input, deps), {
    url: url({ exp: now / 1000 + 299 }),
    expiresAt: providerExpiresAt,
  });
  assert.equal(signedTtl, 297);
});
test('exhausted authorization window fails closed without calling provider', async () => {
  const { deps } = fixture();
  let time = now;
  deps.now = () => time;
  deps.rpc = async () => {
    time += 300000;
    return { ...context, expiresAt: new Date(time + 300000).toISOString() };
  };
  deps.sign = async () => assert.fail('must not sign after deadline');
  await rejects(deps, 502);
});
test('HTTP provider origin is rejected by default even on loopback', async () => {
  const { deps, calls } = fixture();
  deps.apiBaseUrl = 'http://127.0.0.1:54321';
  deps.sign = async () => ({ data: { signedUrl: urlAt(deps.apiBaseUrl) }, error: null });
  await rejects(deps, 502);
  assert.equal(calls.length, 1);
});
test('explicit factory capability permits HTTP solely for loopback with actual SDK shape', async () => {
  const signals: AbortSignal[] = [];
  const origin = 'http://localhost:54321';
  const client = async (signal: AbortSignal) => {
    signals.push(signal);
    return {
      rpc: async (name: string) => ({
        data:
          name === 'resolve_document_access'
            ? context
            : { status: 'granted', auditId: id(8), expiresAt },
        error: null,
      }),
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: { signedUrl: urlAt(origin) },
            error: null,
          }),
        }),
      },
    } as unknown as SupabaseClient;
  };
  const deps = createDocumentAccessDependencies({
    client,
    apiBaseUrl: origin,
    allowHttpLoopback: true,
  });
  deps.now = () => now;
  assert.deepEqual(await signDocumentAccess(input, deps), {
    url: urlAt(origin),
    expiresAt,
  });
  assert.equal(new Set(signals).size, 3);
});
test('explicit loopback capability cannot permit non-loopback HTTP', async () => {
  const { deps, calls } = fixture();
  deps.apiBaseUrl = 'http://storage.example';
  deps.allowHttpLoopback = true;
  deps.sign = async () => ({ data: { signedUrl: urlAt(deps.apiBaseUrl) }, error: null });
  await rejects(deps, 502);
  assert.equal(calls.length, 1);
});
