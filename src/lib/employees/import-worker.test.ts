import assert from 'node:assert/strict';
import test from 'node:test';
import { runEmployeeImportWorkerOnce, type ImportWorkerDeps } from './import-worker';
import { sha256Hex } from './import-artifact';
import { P308Error } from '@/lib/p308/rpc';

type FakeJob = {
  status: 'importing' | 'completed' | 'cancelled' | 'failed';
  totalRows: number;
  nextRow: number;
  nextBatch: number;
  cancelRequested: boolean;
  outcomes: Map<number, string>;
  failureCode: string | null;
};

function csv(rows: number, duplicateAt?: number) {
  const lines = ['name,passport_no'];
  for (let i = 1; i <= rows; i += 1) {
    lines.push(`Person ${i},P${String(i === duplicateAt ? 1 : i).padStart(7, '0')}`);
  }
  return new TextEncoder().encode(`${lines.join('\n')}\n`);
}

function harness(bytes: Uint8Array, options: { crashAfterBatches?: number; sha?: string } = {}) {
  const job: FakeJob = {
    status: 'importing',
    totalRows: bytes ? new TextDecoder().decode(bytes).trim().split('\n').length - 1 : 0,
    nextRow: 0,
    nextBatch: 0,
    cancelRequested: false,
    outcomes: new Map(),
    failureCode: null,
  };
  const calls: string[] = [];
  let applied = 0;
  let queue = [
    { eventJobId: 'ej-1', leaseToken: 'lease-1', importJobId: 'job-1', attempt: 1, maxAttempts: 5 },
  ];
  const deps: ImportWorkerDeps = {
    workerId: 'worker-1',
    claim: async () => {
      const claimed = queue;
      queue = [];
      return claimed;
    },
    readExecution: async () => ({
      status: job.status,
      tenantId: 't',
      companyId: 'c',
      storagePath: 'p',
      artifactSha256: options.sha ?? sha256Hex(bytes),
      totalRows: job.totalRows,
      nextRow: job.nextRow,
      nextBatch: job.nextBatch,
      cancelRequested: job.cancelRequested,
    }),
    downloadArtifact: async () => bytes,
    decryptArtifact: (sealed) => sealed,
    recordAccess: async () => {
      calls.push('access');
    },
    sealEmployee: (_companyId, value) => ({ name: value.name, passport_no_last4: 'x' }),
    applyBatch: async (_job, batchNo, firstRow, rows) => {
      if (options.crashAfterBatches !== undefined && applied >= options.crashAfterBatches) {
        options.crashAfterBatches = undefined;
        throw new Error('ECONNRESET');
      }
      if (batchNo < job.nextBatch) return { state: 'replayed' };
      assert.equal(batchNo, job.nextBatch);
      assert.equal(firstRow, job.nextRow + 1);
      if (job.cancelRequested) return { state: 'cancel_requested' };
      for (const row of rows) job.outcomes.set(row.row_number, row.outcome);
      job.nextRow += rows.length;
      job.nextBatch += 1;
      applied += 1;
      return { state: 'applied' };
    },
    finalize: async (_job, failureCode) => {
      calls.push(`finalize:${failureCode ?? 'none'}`);
      job.status = failureCode
        ? 'failed'
        : job.cancelRequested
          ? 'cancelled'
          : job.nextRow === job.totalRows
            ? 'completed'
            : (() => {
                throw new Error('IMPORT_INCOMPLETE');
              })();
      job.failureCode = failureCode;
      return { state: job.status };
    },
    complete: async () => {
      calls.push('complete');
    },
    fail: async (_claim, retryable) => {
      calls.push(`fail:${retryable}`);
      queue = [
        {
          eventJobId: 'ej-1',
          leaseToken: 'lease-2',
          importJobId: 'job-1',
          attempt: 2,
          maxAttempts: 5,
        },
      ];
    },
    log: () => {},
  };
  return { job, calls, deps };
}

test('imports 250 rows in three ordered atomic batches then finalizes and completes', async () => {
  const { job, calls, deps } = harness(csv(250, 200));
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 1, retried: 0, lost: 0 });
  assert.equal(job.status, 'completed');
  assert.equal(job.nextBatch, 3);
  assert.equal(job.outcomes.size, 250);
  assert.equal(job.outcomes.get(200), 'duplicate_in_file');
  assert.deepEqual(calls, ['access', 'finalize:none', 'complete']);
});

test('a crash mid-import is retried and resumes at the durable cursor without duplicates', async () => {
  const { job, calls, deps } = harness(csv(250), { crashAfterBatches: 1 });
  const first = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(first, { processed: 1, completed: 0, retried: 1, lost: 0 });
  assert.equal(job.nextBatch, 1);
  const second = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(second, { processed: 1, completed: 1, retried: 0, lost: 0 });
  assert.equal(job.outcomes.size, 250);
  assert.equal(job.status, 'completed');
  assert.ok(calls.includes('fail:true'));
});

test('cancel requested between batches stops at the batch boundary', async () => {
  const { job, deps } = harness(csv(250));
  const apply = deps.applyBatch;
  deps.applyBatch = async (...args) => {
    const result = await apply(...args);
    job.cancelRequested = true;
    return result;
  };
  await runEmployeeImportWorkerOnce(deps);
  assert.equal(job.status, 'cancelled');
  assert.equal(job.outcomes.size, 100);
});

test('artifact hash mismatch fails the import closed without applying rows', async () => {
  const { job, calls, deps } = harness(csv(3), { sha: 'f'.repeat(64) });
  await runEmployeeImportWorkerOnce(deps);
  assert.equal(job.status, 'failed');
  assert.equal(job.failureCode, 'IMPORT_ARTIFACT_MISMATCH');
  assert.equal(job.outcomes.size, 0);
  assert.deepEqual(calls, ['finalize:IMPORT_ARTIFACT_MISMATCH', 'complete']);
});

test('a lost lease stops work without finalizing or completing', async () => {
  const { job, calls, deps } = harness(csv(150));
  deps.applyBatch = async () => {
    throw new P308Error('LEASE_LOST', 409);
  };
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 0, retried: 0, lost: 1 });
  assert.equal(job.status, 'importing');
  assert.deepEqual(calls, ['access']);
});

test('an already finalized import is acknowledged without re-reading the artifact', async () => {
  const { job, calls, deps } = harness(csv(3));
  job.status = 'cancelled';
  await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(calls, ['complete']);
});

test('a permanently missing artifact fails the import closed instead of retrying forever', async () => {
  const { job, calls, deps } = harness(csv(3));
  deps.downloadArtifact = async () => {
    throw new Error('IMPORT_ARTIFACT_MISSING');
  };
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 1, retried: 0, lost: 0 });
  assert.equal(job.failureCode, 'IMPORT_ARTIFACT_MISSING');
  assert.deepEqual(calls, ['finalize:IMPORT_ARTIFACT_MISSING', 'complete']);
});

test('a cancel requested before the first lease finalizes without reading the artifact', async () => {
  const { job, calls, deps } = harness(csv(3));
  job.cancelRequested = true;
  await runEmployeeImportWorkerOnce(deps);
  assert.equal(job.status, 'cancelled');
  assert.deepEqual(calls, ['finalize:none', 'complete']);
});

test('code-review F1: a database-rejected batch finalizes the job failed instead of retrying', async () => {
  const { job, calls, deps } = harness(csv(3));
  deps.applyBatch = async () => {
    throw new P308Error('VALIDATION_FAILED', 400);
  };
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 1, retried: 0, lost: 0 });
  assert.equal(job.failureCode, 'IMPORT_BATCH_REJECTED');
  assert.deepEqual(calls, ['access', 'finalize:IMPORT_BATCH_REJECTED', 'complete']);
});

test('code-review F1: the last allowed attempt finalizes the job instead of leaving it importing', async () => {
  const { job, calls, deps } = harness(csv(3));
  const claim = deps.claim;
  deps.claim = async () => (await claim()).map((item) => ({ ...item, attempt: 5, maxAttempts: 5 }));
  deps.applyBatch = async () => {
    throw new Error('ECONNRESET');
  };
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 1, retried: 0, lost: 0 });
  assert.equal(job.failureCode, 'IMPORT_ATTEMPTS_EXHAUSTED');
  assert.deepEqual(calls, ['access', 'finalize:IMPORT_ATTEMPTS_EXHAUSTED', 'complete']);
});

test('code-review F2: an undecryptable artifact is terminal', async () => {
  const { job, calls, deps } = harness(csv(3));
  deps.decryptArtifact = () => {
    throw new Error('IMPORT_ARTIFACT_DECRYPT_FAILED');
  };
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 1, retried: 0, lost: 0 });
  assert.equal(job.failureCode, 'IMPORT_ARTIFACT_UNREADABLE');
  assert.deepEqual(calls, ['finalize:IMPORT_ARTIFACT_UNREADABLE', 'complete']);
});

test('code-review F3: a lost lease reported through callP308 is not failed or retried', async () => {
  const { calls, deps } = harness(csv(3));
  deps.readExecution = async () => {
    throw new P308Error('LEASE_LOST', 409);
  };
  const summary = await runEmployeeImportWorkerOnce(deps);
  assert.deepEqual(summary, { processed: 1, completed: 0, retried: 0, lost: 1 });
  assert.deepEqual(calls, []);
});

test('code-review F1: each pass first reconciles imports whose execution job was dead-lettered', async () => {
  const { calls, deps } = harness(csv(3));
  deps.reconcile = async () => {
    calls.push('reconcile');
    return 1;
  };
  await runEmployeeImportWorkerOnce(deps);
  assert.equal(calls[0], 'reconcile');
});

test('long imports expose deterministic batch checkpoints for lease extension', async () => {
  const { calls, deps } = harness(csv(250));
  deps.checkpoint = async () => {
    calls.push('checkpoint');
  };
  await runEmployeeImportWorkerOnce(deps);
  assert.equal(calls.filter((call) => call === 'checkpoint').length, 3);
});
