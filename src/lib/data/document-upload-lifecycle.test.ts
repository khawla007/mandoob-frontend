import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { ApiError } from '../errors';
import type { SupabaseClient } from '@supabase/supabase-js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const companyId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const operationId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const actorId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const documentId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const versionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const objectId = '11111111-1111-1111-1111-111111111111';
const fence = '22222222-2222-2222-2222-222222222222';
const otherId = '33333333-3333-3333-3333-333333333333';
const now = Date.parse('2026-09-17T10:00:00.000Z');
const bytes = new TextEncoder().encode('%PDF-1.7\nprivate evidence\n%%EOF');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const storagePath = `${tenantId}/${companyId}/documents/${operationId}/${objectId}.pdf`;
const scope = { tenantId, companyId, operationId };
const input = {
  ...scope,
  actorId,
  requestId: null,
  documentId: null,
  employeeId: null,
  docType: 'other',
  label: 'Evidence',
  expectedHead: null,
  file: { data: bytes, filename: 'evidence.pdf', mimeType: 'application/pdf' },
};
const identity = {
  ...scope,
  objectId,
  extension: 'pdf',
  documentId,
  versionId,
  storageBucket: 'tenant-documents',
  storagePath,
  deadlineAt: new Date(now + 15 * 60_000).toISOString(),
};
const receipt = {
  status: 'finalized',
  operationId,
  documentId,
  versionId,
  requestId: null,
  finalizedAt: new Date(now).toISOString(),
};
const publicReceipt = { status: 'finalized', operationId, documentId, versionId };
const pending = { status: 'cleanup_pending', operationId };

// Stateful boundary double: reservations, publication, and cleanup really mutate
// independently, including lost responses after commit. It is not an RPC echo.
function fixture() {
  let state = 'absent';
  let stored: Uint8Array | null = null;
  let fingerprint = '';
  let authorized = false;
  let held = false;
  let referenced = false;
  let revoked = false;
  let time = now;
  let completionDeleted: unknown;
  const calls: string[] = [];
  const rpcArgs: Record<string, unknown>[] = [];
  const overrides = new Map<string, (args: Record<string, unknown>) => unknown>();
  let scanResult: unknown = { clean: true, provider: 'clamav' };
  let metadataMime = 'application/pdf';
  let metadataSize: number | undefined;
  let downloadCanceled = false;
  let createMode = 'normal';
  let removeMode = 'normal';
  const deps = {
    now: () => time,
    timeoutMs: 20,
    rpc: async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
      assert.equal(signal.aborted, false, 'each request needs a fresh signal');
      calls.push(name);
      rpcArgs.push(args);
      if (overrides.has(name)) return overrides.get(name)!(args);
      if (name === 'prepare_document_upload') {
        if (revoked) throw { code: 'DU403', message: 'SECRET actor' };
        const next = JSON.stringify(args);
        if (state !== 'absent' && fingerprint !== next) throw { code: 'DU409' };
        if (state === 'finalized') return receipt;
        if (state !== 'absent' && state !== 'prepared') throw { code: 'DU409' };
        fingerprint = next;
        state = 'prepared';
        return { status: state, ...identity };
      }
      if (name === 'get_document_upload_receipt') {
        if (revoked) throw { code: 'DU403', message: 'SECRET actor' };
        if (state === 'absent') throw { code: 'DU403' };
        return state === 'finalized' ? receipt : { status: state, operationId };
      }
      if (name === 'finalize_document_upload') {
        if (revoked) throw { code: 'DU403' };
        if (state !== 'prepared' || stored === null) throw { code: 'DU409' };
        assert.equal(args.p_sha256, sha256);
        assert.equal(args.p_storage_path, storagePath);
        assert.equal(args.p_scan_provider, 'clamav');
        assert.equal(args.p_scan_state, 'clean');
        state = 'finalized';
        return receipt;
      }
      if (name === 'reconcile_document_upload_cleanup') {
        if (state === 'absent') throw { code: 'DU403' };
        if (state === 'finalized') return receipt;
        if (state === 'cleaned') return { status: state, operationId };
        return { status: state, ...identity };
      }
      if (name === 'claim_document_upload_cleanup') {
        if (held || referenced || ['absent', 'cleaned', 'finalized'].includes(state))
          throw { code: 'DU409' };
        state = 'cleanup_pending';
        return {
          status: state,
          ...identity,
          fence,
          leaseUntil: new Date(time + 300_000).toISOString(),
        };
      }
      if (name === 'authorize_document_upload_cleanup') {
        if (held || referenced || state !== 'cleanup_pending' || args.p_fence !== fence)
          throw { code: 'DU409' };
        authorized = true;
        return {
          status: 'delete_authorized',
          ...identity,
          fence,
          leaseUntil: new Date(time + 300_000).toISOString(),
        };
      }
      if (name === 'complete_document_upload_cleanup') {
        completionDeleted = args.p_deleted;
        assert.equal(authorized, true);
        assert.equal(args.p_fence, fence);
        if (args.p_deleted === true) {
          assert.equal(stored, null);
          state = 'cleaned';
          return { status: state, operationId };
        }
        return pending;
      }
      if (name === 'list_document_upload_cleanup_candidates') {
        return {
          status: 'candidates',
          operations:
            state === 'prepared' && time >= now + 900_000
              ? [{ status: 'prepared', ...identity }]
              : [],
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    scan: async (data: Uint8Array, signal: AbortSignal) => {
      assert.equal(signal.aborted, false);
      calls.push('scan');
      assert.deepEqual(data, bytes);
      return typeof scanResult === 'function' ? scanResult() : scanResult;
    },
    storage: {
      create: async (
        bucket: string,
        path: string,
        data: Uint8Array,
        mime: string,
        signal: AbortSignal,
      ) => {
        calls.push('create');
        assert.equal(bucket, 'tenant-documents');
        assert.equal(path, storagePath);
        assert.equal(mime, 'application/pdf');
        assert.equal(signal.aborted, false);
        if (createMode === 'hang') return new Promise<never>(() => {});
        if (createMode === 'fail-before') return 'rejected' as const;
        if (stored) return 'already_exists' as const;
        stored = new Uint8Array(data);
        if (createMode === 'fail-after') throw new Error('SECRET wrote bytes');
        return 'created' as const;
      },
      download: async (bucket: string, path: string, signal: AbortSignal) => {
        calls.push('download');
        assert.equal(bucket, 'tenant-documents');
        assert.equal(path, storagePath);
        assert.equal(signal.aborted, false);
        const data = stored!;
        return {
          mimeType: metadataMime,
          sizeBytes: metadataSize ?? data.byteLength,
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(data);
            },
            // An oversized adversarial provider keeps writing; cancellation
            // must be observable rather than racing an already-closed stream.
            pull(controller) {
              if (data.byteLength <= bytes.byteLength) controller.close();
            },
            cancel() {
              downloadCanceled = true;
            },
          }),
        };
      },
      remove: async (bucket: string, paths: string[], signal: AbortSignal): Promise<void> => {
        calls.push('remove');
        assert.equal(authorized, true);
        assert.equal(bucket, 'tenant-documents');
        assert.deepEqual(paths, [storagePath]);
        assert.equal(signal.aborted, false);
        if (removeMode === 'fail') throw new Error('SECRET remove');
        if (removeMode === 'hang') return new Promise<never>(() => {});
        stored = null;
      },
    },
  };
  return {
    deps,
    calls,
    rpcArgs,
    overrides,
    get state() {
      return state;
    },
    set state(value: string) {
      state = value;
    },
    get stored() {
      return stored;
    },
    set stored(value: Uint8Array | null) {
      stored = value;
    },
    get completionDeleted() {
      return completionDeleted;
    },
    get canceled() {
      return downloadCanceled;
    },
    set scan(value: unknown) {
      scanResult = value;
    },
    set mime(value: string) {
      metadataMime = value;
    },
    set size(value: number) {
      metadataSize = value;
    },
    set createMode(value: string) {
      createMode = value;
    },
    set removeMode(value: string) {
      removeMode = value;
    },
    set held(value: boolean) {
      held = value;
    },
    set referenced(value: boolean) {
      referenced = value;
    },
    set revoked(value: boolean) {
      revoked = value;
    },
    set time(value: number) {
      time = value;
    },
  };
}

async function api() {
  // Missing implementation is an assertion RED, not an environment import error.
  try {
    return await import('./document-upload-lifecycle');
  } catch (error) {
    assert.fail(`Coordinator module unavailable: ${(error as Error).message}`);
  }
}
async function rejectUpload(f: ReturnType<typeof fixture>, value: unknown = input) {
  const { coordinateDocumentUpload } = await api();
  await assert.rejects(
    coordinateDocumentUpload(value as typeof input, f.deps),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /SECRET|private evidence|documents\//);
      return true;
    },
  );
}

test('publishes verified private bytes once and retry returns original sanitized IDs', async () => {
  const { coordinateDocumentUpload } = await api();
  const f = fixture();
  assert.deepEqual(await coordinateDocumentUpload(input, f.deps), publicReceipt);
  assert.deepEqual(await coordinateDocumentUpload(input, f.deps), publicReceipt);
  assert.equal(f.state, 'finalized');
  assert.deepEqual(f.stored, bytes);
  assert.equal(f.calls.filter((call) => call === 'create').length, 1);
  assert.equal(f.calls.filter((call) => call === 'finalize_document_upload').length, 1);
  const prepare = f.rpcArgs[0];
  assert.equal(prepare.p_expected_head, null);
  assert.equal(prepare.p_sha256, sha256);
  assert.ok(f.calls.indexOf('scan') < f.calls.indexOf('create'));
  assert.ok(f.calls.indexOf('download') < f.calls.indexOf('finalize_document_upload'));
});

for (const [key, value] of [
  ['label', 'Changed'],
  ['expectedHead', otherId],
  ['requestId', otherId],
  ['documentId', otherId],
  ['employeeId', otherId],
] as const) {
  test(`changed ${key} prepare conflicts without cleaning original operation`, async () => {
    const { coordinateDocumentUpload } = await api();
    const f = fixture();
    await coordinateDocumentUpload(input, f.deps);
    await rejectUpload(f, { ...input, [key]: value });
    assert.equal(f.state, 'finalized');
    assert.ok(!f.calls.includes('remove'));
  });
}

test('ambiguous prepare retries exact payload before claiming ownership', async () => {
  const { coordinateDocumentUpload } = await api();
  const f = fixture();
  let attempts = 0;
  let original: unknown;
  f.overrides.set('prepare_document_upload', (args) => {
    attempts++;
    if (attempts === 1) {
      original = args;
      throw new Error('SECRET lost response');
    }
    assert.deepEqual(args, original);
    f.state = 'prepared';
    return { status: 'prepared', ...identity };
  });
  assert.deepEqual(await coordinateDocumentUpload(input, f.deps), publicReceipt);
  assert.equal(attempts, 2);
  assert.ok(!f.calls.includes('remove'));
});
test('unresolved prepare cannot license private cleanup even if foreign reservation exists', async () => {
  const f = fixture();
  f.state = 'prepared';
  f.stored = bytes;
  f.overrides.set('prepare_document_upload', () => {
    throw new Error('SECRET uncertain');
  });
  await rejectUpload(f);
  assert.ok(!f.calls.includes('reconcile_document_upload_cleanup'));
  assert.ok(!f.calls.includes('remove'));
  assert.deepEqual(f.stored, bytes);
});

const malformedIdentities: [string, Record<string, unknown>][] = [
  ['tenant', { tenantId: otherId }],
  ['company', { companyId: otherId }],
  ['operation', { operationId: otherId }],
  ['object UUID', { objectId: '../foreign' }],
  ['document UUID', { documentId: 'bad' }],
  ['version UUID', { versionId: 7 }],
  ['path', { storagePath: `${tenantId}/foreign.pdf` }],
  ['bucket', { storageBucket: 'public' }],
  ['extension', { extension: 'exe' }],
  ['deadline', { deadlineAt: 'tomorrow' }],
  ['infinite TTL', { deadlineAt: new Date(now + 901_000).toISOString() }],
  ['extra fields', { secret: 'SECRET' }],
];
for (const [name, mutation] of malformedIdentities) {
  test(`malformed prepare ${name} performs no object operation or private cleanup`, async () => {
    const f = fixture();
    f.overrides.set('prepare_document_upload', () => ({
      status: 'prepared',
      ...identity,
      ...mutation,
    }));
    await rejectUpload(f);
    for (const call of ['create', 'remove', 'scan', 'reconcile_document_upload_cleanup'])
      assert.ok(!f.calls.includes(call));
  });
}
for (const status of ['cleanup_pending', 'delete_authorized', 'cleaned', 'candidate', undefined]) {
  test(`unexpected prepare status ${status} cannot grant provider access`, async () => {
    const f = fixture();
    f.overrides.set('prepare_document_upload', () => ({ ...identity, status }));
    await rejectUpload(f);
    assert.ok(!f.calls.includes('create'));
    assert.ok(!f.calls.includes('remove'));
  });
}
test('expired prepared response grants no provider access', async () => {
  const f = fixture();
  f.overrides.set('prepare_document_upload', () => ({
    status: 'prepared',
    ...identity,
    deadlineAt: new Date(now).toISOString(),
  }));
  await rejectUpload(f);
  assert.ok(!f.calls.includes('create'));
  assert.ok(!f.calls.includes('remove'));
});
test('uppercase canonical non-RFC UUID inputs normalize consistently', async () => {
  const { coordinateDocumentUpload } = await api();
  const f = fixture();
  assert.deepEqual(
    await coordinateDocumentUpload(
      {
        ...input,
        tenantId: tenantId.toUpperCase(),
        companyId: companyId.toUpperCase(),
        actorId: actorId.toUpperCase(),
        operationId: operationId.toUpperCase(),
      },
      f.deps,
    ),
    publicReceipt,
  );
  assert.equal(f.rpcArgs[0].p_tenant_id, tenantId);
});

for (const [name, scan] of [
  ['malware', { clean: false, reason: 'malware_detected', provider: 'clamav' }],
  ['EICAR', { clean: false, reason: 'eicar_test', provider: 'local' }],
  ['unavailable', { clean: false, reason: 'scanner_unavailable', provider: 'clamav' }],
  ['external provider', { clean: true, provider: 'virustotal' }],
  ['local provider', { clean: true, provider: 'local' }],
  ['missing provider', { clean: true }],
  ['truthy clean', { clean: 'true', provider: 'clamav' }],
  ['null', null],
  ['extra fields', { clean: true, provider: 'clamav', secret: 'SECRET' }],
  ['contradictory reason', { clean: true, provider: 'clamav', reason: 'malware_detected' }],
] as const) {
  test(`private scan ${name} fails closed before create/finalize`, async () => {
    const f = fixture();
    f.scan = scan;
    await rejectUpload(f);
    assert.ok(!f.calls.includes('create'));
    assert.ok(!f.calls.includes('finalize_document_upload'));
  });
}
test('scanner hang is bounded and never creates bytes', async () => {
  const f = fixture();
  f.scan = () => new Promise(() => {});
  await rejectUpload(f);
  assert.ok(!f.calls.includes('create'));
  assert.ok(!f.calls.includes('finalize_document_upload'));
});
test('scanner exception is redacted', async () => {
  const f = fixture();
  f.scan = () => {
    throw new Error('SECRET scanner');
  };
  await rejectUpload(f);
  assert.ok(!f.calls.includes('create'));
});
test('late download resolution after abort cancels its still-open empty stream', async () => {
  const f = fixture();
  let canceled = false;
  let delivered!: () => void;
  const delivery = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  f.deps.storage.download = async (_bucket, _path, signal) => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(signal.aborted, true);
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });
    delivered();
    return { stream, mimeType: 'application/pdf', sizeBytes: bytes.byteLength };
  };
  await rejectUpload(f);
  await delivery;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(canceled, true);
  assert.equal(f.state, 'prepared');
  assert.ok(!f.calls.includes('remove'));
  assert.ok(!f.calls.includes('finalize_document_upload'));
});
for (const mode of ['empty', 'tiny-progress']) {
  test(`adversarial immediately-readable ${mode} chunks cannot starve timeout or finalize`, async () => {
    const f = fixture();
    f.deps.timeoutMs = 1;
    const data = mode === 'empty' ? bytes : new Uint8Array(262_144);
    if (mode === 'tiny-progress') data.set(bytes);
    f.deps.scan = async () => ({ clean: true, provider: 'clamav' });
    let reads = 0;
    let canceled = false;
    f.deps.storage.download = async () => ({
      mimeType: 'application/pdf',
      sizeBytes: data.byteLength,
      stream: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (mode === 'empty') {
            if (reads++ < 100_000) controller.enqueue(new Uint8Array());
            else if (reads === 100_001) controller.enqueue(data);
            else controller.close();
          } else if (reads < data.byteLength) {
            controller.enqueue(data.subarray(reads, ++reads));
          } else controller.close();
        },
        cancel() {
          canceled = true;
        },
      }),
    });
    f.overrides.set('finalize_document_upload', (args) => {
      assert.equal(args.p_sha256, createHash('sha256').update(data).digest('hex'));
      assert.equal(args.p_size_bytes, data.byteLength);
      f.state = 'finalized';
      return receipt;
    });
    await rejectUpload(f, { ...input, file: { ...input.file, data } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(canceled, true);
    assert.ok(reads < (mode === 'empty' ? 100_000 : data.byteLength));
    assert.equal(f.state, 'prepared');
    assert.ok(!f.calls.includes('finalize_document_upload'));
    assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
    assert.ok(!f.calls.includes('remove'));
  });
}

for (const mode of ['hash', 'oversize', 'mime', 'size', 'empty']) {
  test(`already existing stored bytes ${mode} mismatch prevents finalization`, async () => {
    const f = fixture();
    f.stored = new Uint8Array(bytes);
    if (mode === 'hash') {
      f.stored[15] ^= 1;
    }
    if (mode === 'oversize') {
      f.stored = new Uint8Array(bytes.byteLength + 1);
      f.size = bytes.byteLength;
    }
    if (mode === 'mime') f.mime = 'image/png';
    if (mode === 'size') f.size = bytes.byteLength + 1;
    if (mode === 'empty') f.stored = new Uint8Array();
    await rejectUpload(f);
    assert.ok(!f.calls.includes('finalize_document_upload'));
    if (mode === 'oversize') assert.equal(f.canceled, true);
  });
}

for (const mode of ['fail-before']) {
  test(`definitive create ${mode} preserves live reservation then expired recovery uses fenced cleanup`, async () => {
    const f = fixture();
    f.createMode = mode;
    await rejectUpload(f);
    assert.equal(f.state, 'prepared');
    assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
    assert.ok(!f.calls.includes('remove'));
    const { recoverDocumentUploadCleanup } = await api();
    f.time = now + 900_000;
    assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), {
      status: 'cleaned',
      operationId,
    });
    assert.ok(
      f.calls.indexOf('get_document_upload_receipt') <
        f.calls.indexOf('claim_document_upload_cleanup'),
    );
    assert.ok(f.calls.indexOf('authorize_document_upload_cleanup') < f.calls.indexOf('remove'));
  });
}
test('ambiguous network failure after provider write preserves reservation and bytes', async () => {
  const f = fixture();
  f.createMode = 'fail-after';
  await rejectUpload(f);
  assert.equal(f.state, 'prepared');
  assert.deepEqual(f.stored, bytes);
  assert.ok(!f.calls.includes('remove'));
  assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
});
test('unsettled create timeout never treats abort as provider writer quiescence', async () => {
  const f = fixture();
  f.createMode = 'hang';
  await rejectUpload(f);
  assert.equal(f.state, 'prepared');
  assert.ok(!f.calls.includes('remove'));
  assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
});
test('finalize lost response after commit preserves object and returns actor receipt', async () => {
  const { coordinateDocumentUpload } = await api();
  const f = fixture();
  f.overrides.set('finalize_document_upload', () => {
    f.state = 'finalized';
    throw new Error('SECRET lost response');
  });
  assert.deepEqual(await coordinateDocumentUpload(input, f.deps), publicReceipt);
  assert.deepEqual(f.stored, bytes);
  assert.ok(!f.calls.includes('remove'));
});
test('definitive SQL finalize rejection preserves live reservation for expired recovery', async () => {
  const f = fixture();
  f.overrides.set('finalize_document_upload', () => {
    throw { code: 'DU412', message: 'SECRET SQL' };
  });
  await rejectUpload(f);
  assert.equal(f.state, 'prepared');
  assert.deepEqual(f.stored, bytes);
  assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
  const { recoverDocumentUploadCleanup } = await api();
  f.time = now + 900_000;
  assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), {
    status: 'cleaned',
    operationId,
  });
});
test('concurrent retry scanner failure cannot claim or delete while another same-operation writer is active', async () => {
  const { coordinateDocumentUpload } = await api();
  const f = fixture();
  f.deps.timeoutMs = 1_000;
  let scans = 0;
  f.scan = () =>
    ++scans === 1
      ? { clean: true, provider: 'clamav' }
      : { clean: false, provider: 'clamav', reason: 'malware_detected' };
  let writerEntered!: () => void;
  let finishWriter!: () => void;
  const entered = new Promise<void>((resolve) => {
    writerEntered = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    finishWriter = resolve;
  });
  const originalCreate = f.deps.storage.create;
  f.deps.storage.create = async (...args) => {
    writerEntered();
    await finished;
    return originalCreate(...args);
  };
  const first = coordinateDocumentUpload(input, f.deps).catch(() => null);
  await entered;
  try {
    await rejectUpload(f);
    assert.equal(f.state, 'prepared');
    assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
    assert.ok(!f.calls.includes('remove'));
  } finally {
    finishWriter();
    await first;
  }
  assert.equal(f.state, 'finalized');
  assert.deepEqual(f.stored, bytes);
});
test('boundary-created ApiError cannot leak raw provider messages or details', async () => {
  const f = fixture();
  f.scan = () => {
    throw new ApiError('MALWARE_DETECTED', 'SECRET scanner', 422, { secret: 'SECRET' });
  };
  await rejectUpload(f);
});
test('concurrent completion with different scan timestamp returns original receipt', async () => {
  const { coordinateDocumentUpload } = await api();
  const f = fixture();
  let reads = 0;
  f.overrides.set('get_document_upload_receipt', () => {
    reads++;
    if (reads >= 2) {
      f.state = 'finalized';
      return receipt;
    }
    return { status: 'prepared', operationId };
  });
  f.overrides.set('finalize_document_upload', () => {
    assert.fail('must reconcile concurrent commit before incompatible attestation replay');
  });
  assert.deepEqual(await coordinateDocumentUpload(input, f.deps), publicReceipt);
  assert.ok(!f.calls.includes('remove'));
});
test('unresolved actor receipt after finalize failure keeps operation intact', async () => {
  const f = fixture();
  let reads = 0;
  f.overrides.set('get_document_upload_receipt', () => {
    if (++reads > 2) throw new Error('SECRET uncertain');
    return { status: 'prepared', operationId };
  });
  f.overrides.set('finalize_document_upload', () => {
    throw new Error('SECRET lost response');
  });
  await rejectUpload(f);
  assert.ok(!f.calls.includes('remove'));
  assert.deepEqual(f.stored, bytes);
});
test('revoked actor never receives private finalized receipt as public success', async () => {
  const f = fixture();
  f.overrides.set('finalize_document_upload', () => {
    f.state = 'finalized';
    f.revoked = true;
    throw { code: 'DU403' };
  });
  await rejectUpload(f);
  assert.ok(!f.calls.includes('remove'));
  assert.deepEqual(f.stored, bytes);
});

for (const point of ['prepare', 'uploaded', 'scan', 'delete']) {
  test(`private recovery after process crash at ${point} works after actor revocation`, async () => {
    const { recoverDocumentUploadCleanup } = await api();
    const f = fixture();
    f.state = point === 'delete' ? 'cleanup_pending' : 'prepared';
    f.revoked = true;
    f.time = now + 900_000;
    f.stored = ['uploaded', 'scan'].includes(point) ? bytes : null;
    assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), {
      status: 'cleaned',
      operationId,
    });
    assert.equal(f.state, 'cleaned');
    assert.ok(!f.calls.includes('get_document_upload_receipt'));
  });
}
for (const protection of ['held', 'referenced', 'finalized', 'cleaned']) {
  test(`recovery ${protection} never deletes provider bytes`, async () => {
    const { recoverDocumentUploadCleanup } = await api();
    const f = fixture();
    f.state = 'prepared';
    f.stored = bytes;
    f.time = now + 900_000;
    if (protection === 'held') f.held = true;
    if (protection === 'referenced') f.referenced = true;
    if (protection === 'finalized' || protection === 'cleaned') f.state = protection;
    await recoverDocumentUploadCleanup(scope, f.deps);
    assert.ok(!f.calls.includes('remove'));
    if (protection === 'held' || protection === 'referenced') {
      assert.ok(f.calls.includes('claim_document_upload_cleanup'));
      assert.ok(!f.calls.includes('authorize_document_upload_cleanup'));
    }
  });
}
for (const protection of ['held', 'referenced']) {
  test(`recovery ${protection} introduced after claim blocks fresh authorization`, async () => {
    const { recoverDocumentUploadCleanup } = await api();
    const f = fixture();
    f.state = 'prepared';
    f.stored = bytes;
    f.time = now + 900_000;
    f.overrides.set('claim_document_upload_cleanup', () => {
      f.state = 'cleanup_pending';
      if (protection === 'held') f.held = true;
      else f.referenced = true;
      return {
        status: 'cleanup_pending',
        ...identity,
        fence,
        leaseUntil: new Date(now + 1_200_000).toISOString(),
      };
    });
    assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), pending);
    assert.ok(f.calls.includes('claim_document_upload_cleanup'));
    assert.ok(f.calls.includes('authorize_document_upload_cleanup'));
    assert.ok(!f.calls.includes('remove'));
  });
}
for (const phase of ['claim_document_upload_cleanup', 'authorize_document_upload_cleanup']) {
  for (const [name, mutation] of [
    ...malformedIdentities,
    ['fence', { fence: 'bad' }],
    ['expired lease', { leaseUntil: new Date(now).toISOString() }],
    ['infinite lease', { leaseUntil: new Date(now + 900_000 + 301_000).toISOString() }],
  ] as [string, Record<string, unknown>][]) {
    test(`recovery ${phase} malformed ${name} cannot remove bytes`, async () => {
      const { recoverDocumentUploadCleanup } = await api();
      const f = fixture();
      f.state = 'prepared';
      f.stored = bytes;
      f.time = now + 900_000;
      f.overrides.set(phase, () => ({
        status: phase.startsWith('claim') ? 'cleanup_pending' : 'delete_authorized',
        ...identity,
        fence,
        leaseUntil: new Date(now + 1_200_000).toISOString(),
        ...mutation,
      }));
      await recoverDocumentUploadCleanup(scope, f.deps);
      assert.ok(!f.calls.includes('remove'));
    });
  }
}
test('changed immutable identity between claim and authorization cannot remove bytes', async () => {
  const { recoverDocumentUploadCleanup } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.time = now + 900_000;
  f.overrides.set('authorize_document_upload_cleanup', () => ({
    status: 'delete_authorized',
    ...identity,
    objectId: otherId,
    storagePath: storagePath.replace(objectId, otherId),
    fence,
    leaseUntil: new Date(now + 1_200_000).toISOString(),
  }));
  await recoverDocumentUploadCleanup(scope, f.deps);
  assert.ok(!f.calls.includes('remove'));
});
test('replacement stale fence cannot remove bytes', async () => {
  const { recoverDocumentUploadCleanup } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.time = now + 900_000;
  f.overrides.set('authorize_document_upload_cleanup', () => ({
    status: 'delete_authorized',
    ...identity,
    fence: otherId,
    leaseUntil: new Date(now + 1_200_000).toISOString(),
  }));
  await recoverDocumentUploadCleanup(scope, f.deps);
  assert.ok(!f.calls.includes('remove'));
});
for (const mode of ['fail', 'hang']) {
  test(`provider deletion ${mode} acknowledges false and remains pending`, async () => {
    const { recoverDocumentUploadCleanup } = await api();
    const f = fixture();
    f.state = 'prepared';
    f.stored = bytes;
    f.removeMode = mode;
    f.time = now + 900_000;
    assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), pending);
    assert.equal(f.completionDeleted, false);
    assert.equal(f.state, 'cleanup_pending');
    assert.deepEqual(f.stored, bytes);
  });
}
test('lost completion response reconciles durable cleaned without another delete', async () => {
  const { recoverDocumentUploadCleanup } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.time = now + 900_000;
  f.overrides.set('complete_document_upload_cleanup', () => {
    f.state = 'cleaned';
    f.time = now + 301_000;
    throw new Error('SECRET lost completion');
  });
  assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), {
    status: 'cleaned',
    operationId,
  });
  assert.equal(f.calls.filter((call) => call === 'remove').length, 1);
});
test('failed required completion audit remains pending rather than fabricated success', async () => {
  const { recoverDocumentUploadCleanup } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.time = now + 900_000;
  f.overrides.set('complete_document_upload_cleanup', () => {
    throw new Error('SECRET audit failure');
  });
  assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), pending);
  assert.equal(f.state, 'cleanup_pending');
});

async function adapterRemovalCase(data: unknown, physicallyAbsent = true) {
  const { createDocumentUploadDependencies, recoverDocumentUploadCleanup } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.stored = bytes;
  f.time = now + 900_000;
  let configured = false;
  let clients = 0;
  let removes = 0;
  const options = {
    get client() {
      configured = true;
      return async (signal: AbortSignal) => {
        clients++;
        assert.equal(signal.aborted, false);
        return {
          storage: {
            from(bucket: string) {
              assert.equal(bucket, 'tenant-documents');
              return {
                async remove(paths: string[]) {
                  removes++;
                  assert.deepEqual(paths, [storagePath]);
                  if (physicallyAbsent) f.stored = null;
                  return { data, error: null };
                },
              };
            },
          },
        } as unknown as SupabaseClient;
      };
    },
  };
  const adapter = createDocumentUploadDependencies(options);
  // A missing injection seam fails BEFORE any env-dependent or real SDK call.
  assert.equal(configured, true, 'production adapter must honor injected SDK client');
  f.deps.storage.remove = adapter.storage.remove;
  const result = await recoverDocumentUploadCleanup(scope, f.deps);
  assert.equal(clients, 1);
  assert.equal(removes, 1);
  return { f, result };
}
for (const [name, data] of [
  ['null', null],
  ['non-array', {}],
  ['string', storagePath],
  ['foreign path', [{ name: 'foreign/object.pdf' }]],
  ['foreign bucket', [{ name: storagePath, bucket_id: 'public' }]],
  ['missing name', [{}]],
  ['duplicate', [{ name: storagePath }, { name: storagePath }]],
  ['oversized', Array(26).fill({ name: storagePath })],
  ['null entry', [null]],
  ['invalid optional metadata', [{ name: storagePath, metadata: 'SECRET' }]],
  ['invalid optional UUID', [{ name: storagePath, id: 7 }]],
  ['invalid optional timestamp', [{ name: storagePath, updated_at: 'tomorrow' }]],
  ['unexpected fields', [{ name: storagePath, secret: 'SECRET' }]],
] as const) {
  test(`production removal adapter ${name} response acknowledges false and stays pending`, async () => {
    const { f, result } = await adapterRemovalCase(data);
    assert.equal(f.completionDeleted, false);
    assert.deepEqual(result, pending);
  });
}
for (const [name, data] of [
  ['minimal backend name', [{ name: storagePath }]],
  ['already absent', []],
  [
    'SDK fields',
    [
      {
        name: storagePath,
        id: otherId,
        bucket_id: 'tenant-documents',
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        last_accessed_at: null,
        metadata: null,
        owner: null,
        owner_id: null,
        version: otherId,
        user_metadata: null,
      },
    ],
  ],
] as const) {
  test(`production removal adapter accepts ${name} transport acknowledgement with independent SQL absence`, async () => {
    const { f, result } = await adapterRemovalCase(data);
    assert.equal(f.completionDeleted, true);
    assert.deepEqual(result, { status: 'cleaned', operationId });
  });
}
test('empty provider removal acknowledgement does not bypass SQL actual object absence', async () => {
  const { f, result } = await adapterRemovalCase([], false);
  assert.equal(f.completionDeleted, true);
  assert.deepEqual(result, pending);
  assert.deepEqual(f.stored, bytes);
});

test('bounded discovery expires scope-local reservations only', async () => {
  const { recoverExpiredDocumentUploads } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.time = now + 900_000;
  assert.deepEqual(await recoverExpiredDocumentUploads({ tenantId, companyId, limit: 1 }, f.deps), [
    { status: 'cleaned', operationId },
  ]);
  assert.equal(f.rpcArgs[0].p_limit, 1);
  assert.equal(f.state, 'cleaned');
});
test('generic recovery cannot guess writer quiescence for a live prepared reservation', async () => {
  const { recoverDocumentUploadCleanup } = await api();
  const f = fixture();
  f.state = 'prepared';
  f.stored = bytes;
  assert.deepEqual(await recoverDocumentUploadCleanup(scope, f.deps), {
    status: 'prepared',
    operationId,
  });
  assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
  assert.ok(!f.calls.includes('remove'));
});
test('discovery accepts abandoned pending operation with expired lease before original deadline', async () => {
  const { recoverExpiredDocumentUploads } = await api();
  const f = fixture();
  f.state = 'cleanup_pending';
  f.time = now + 301_000;
  f.overrides.set('list_document_upload_cleanup_candidates', () => ({
    status: 'candidates',
    operations: [{ status: 'cleanup_pending', ...identity }],
  }));
  assert.deepEqual(await recoverExpiredDocumentUploads({ tenantId, companyId, limit: 1 }, f.deps), [
    { status: 'cleaned', operationId },
  ]);
});
for (const limit of [0, 26, -1, 1.5, NaN, '1', undefined]) {
  test(`discovery rejects invalid limit ${limit} before RPC`, async () => {
    const { recoverExpiredDocumentUploads } = await api();
    const f = fixture();
    await assert.rejects(
      recoverExpiredDocumentUploads(
        { tenantId, companyId, limit } as { tenantId: string; companyId: string; limit: number },
        f.deps,
      ),
    );
    assert.deepEqual(f.calls, []);
  });
}
for (const [name, payload] of [
  [
    'duplicate',
    {
      status: 'candidates',
      operations: [
        { status: 'prepared', ...identity },
        { status: 'prepared', ...identity },
      ],
    },
  ],
  [
    'over limit',
    { status: 'candidates', operations: Array(26).fill({ status: 'prepared', ...identity }) },
  ],
  [
    'foreign',
    { status: 'candidates', operations: [{ status: 'prepared', ...identity, tenantId: otherId }] },
  ],
  ['terminal', { status: 'candidates', operations: [{ status: 'finalized', ...identity }] }],
  ['live', { status: 'candidates', operations: [{ status: 'prepared', ...identity }] }],
  ['malformed', { status: 'candidates', operations: null }],
  ['extra', { status: 'candidates', operations: [], secret: 'SECRET' }],
] as const) {
  test(`discovery rejects ${name} snapshot before any claim/delete`, async () => {
    const { recoverExpiredDocumentUploads } = await api();
    const f = fixture();
    f.overrides.set('list_document_upload_cleanup_candidates', () => payload);
    await assert.rejects(recoverExpiredDocumentUploads({ tenantId, companyId, limit: 25 }, f.deps));
    assert.ok(!f.calls.includes('claim_document_upload_cleanup'));
    assert.ok(!f.calls.includes('remove'));
  });
}

for (const value of [
  null,
  {},
  { ...input, actorId: '../' },
  { ...input, docType: 'unknown' },
  { ...input, label: '\0SECRET' },
  { ...input, file: null },
  { ...input, file: { ...input.file, mimeType: 'image/png' } },
  { ...input, file: { ...input.file, data: new Uint8Array() } },
  { ...input, expectedHead: 7 },
]) {
  test(`runtime input validation fails closed ${JSON.stringify(value)?.slice(0, 40)}`, async () => {
    const f = fixture();
    await rejectUpload(f, value);
    assert.deepEqual(f.calls, []);
  });
}
for (const [name, mutation] of [
  ['foreign operation', { operationId: otherId }],
  ['wrong reserved version', { versionId: otherId }],
  ['unexpected path', { storagePath }],
  ['bad timestamp', { finalizedAt: 'tomorrow' }],
  ['bad request', { requestId: 'bad' }],
] as const) {
  test(`malformed finalized receipt ${name} cannot report success or remove committed bytes`, async () => {
    const f = fixture();
    f.overrides.set('finalize_document_upload', () => {
      f.state = 'finalized';
      return { ...receipt, ...mutation };
    });
    f.overrides.set('get_document_upload_receipt', () =>
      f.state === 'finalized' ? { ...receipt, ...mutation } : { status: 'prepared', operationId },
    );
    await rejectUpload(f);
    assert.ok(!f.calls.includes('remove'));
  });
}
