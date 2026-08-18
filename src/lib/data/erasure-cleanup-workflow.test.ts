import assert from 'node:assert/strict';
import test from 'node:test';
import { runErasureExternalCleanup, type ErasureCleanupJob } from './erasure-cleanup-workflow';

function job(): ErasureCleanupJob {
  return {
    requestId: 'request-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
    subjectUserId: 'user-1',
    storagePaths: ['tenant-1/company-1/passport/file.pdf'],
    storageDeleted: false,
    authAnonymized: false,
    notificationQueued: false,
  };
}

test('storage failure remains retryable and a later run rediscovers the persisted paths', async () => {
  const persisted = job();
  let deletes = 0;
  let authCalls = 0;
  let completions = 0;
  const deps = {
    deleteStorage: async (paths: string[]) => {
      deletes += 1;
      assert.deepEqual(paths, persisted.storagePaths);
      if (deletes === 1) throw new Error('storage unavailable');
    },
    anonymizeAuth: async () => {
      authCalls += 1;
    },
    markStep: async (step: 'storage' | 'auth' | 'notification') => {
      if (step === 'storage') persisted.storageDeleted = true;
      else if (step === 'auth') persisted.authAnonymized = true;
      else persisted.notificationQueued = true;
    },
    complete: async () => {
      completions += 1;
    },
    notify: async () => undefined,
  };
  await assert.rejects(runErasureExternalCleanup(persisted, deps), /storage unavailable/u);
  assert.equal(authCalls, 0);
  await runErasureExternalCleanup(persisted, deps);
  assert.equal(deletes, 2);
  assert.equal(authCalls, 1);
  assert.equal(completions, 1);
});

test('auth failure is checked and retries without repeating a persisted storage deletion', async () => {
  const persisted = job();
  let deletes = 0;
  let authCalls = 0;
  const deps = {
    deleteStorage: async () => {
      deletes += 1;
    },
    anonymizeAuth: async () => {
      authCalls += 1;
      if (authCalls === 1) throw new Error('auth update failed');
    },
    markStep: async (step: 'storage' | 'auth' | 'notification') => {
      if (step === 'storage') persisted.storageDeleted = true;
      else if (step === 'auth') persisted.authAnonymized = true;
      else persisted.notificationQueued = true;
    },
    complete: async () => undefined,
    notify: async () => undefined,
  };
  await assert.rejects(runErasureExternalCleanup(persisted, deps), /auth update failed/u);
  await runErasureExternalCleanup(persisted, deps);
  assert.equal(deletes, 1);
  assert.equal(authCalls, 2);
});

test('persisted paths fail closed before any storage or auth side effect', async () => {
  for (const storagePath of [
    'tenant-1/company-2/passport/file.pdf',
    'tenant-1/company-1/../company-2/file.pdf',
    'tenant-1/company-1/%2e%2e/file.pdf',
  ]) {
    const persisted = { ...job(), storagePaths: [storagePath] };
    let storageCalls = 0;
    let authCalls = 0;
    await assert.rejects(
      runErasureExternalCleanup(persisted, {
        deleteStorage: async () => {
          storageCalls += 1;
        },
        anonymizeAuth: async () => {
          authCalls += 1;
        },
        markStep: async () => undefined,
        complete: async () => undefined,
        notify: async () => undefined,
      }),
      /invalid erasure storage path/u,
    );
    assert.equal(storageCalls, 0);
    assert.equal(authCalls, 0);
  }
});

test('notification failure after completion resumes idempotently from completed metadata', async () => {
  const persisted = job();
  let completions = 0;
  let notifications = 0;
  const deps = {
    deleteStorage: async () => undefined,
    anonymizeAuth: async () => undefined,
    markStep: async (step: 'storage' | 'auth' | 'notification') => {
      if (step === 'storage') persisted.storageDeleted = true;
      if (step === 'auth') persisted.authAnonymized = true;
      if (step === 'notification') persisted.notificationQueued = true;
    },
    complete: async () => {
      completions += 1;
    },
    notify: async () => {
      notifications += 1;
      if (notifications === 1) throw new Error('outbox unavailable');
    },
  };

  await assert.rejects(runErasureExternalCleanup(persisted, deps), /outbox unavailable/u);
  await runErasureExternalCleanup(persisted, deps);
  assert.equal(completions, 2);
  assert.equal(notifications, 2);
  assert.equal(persisted.notificationQueued, true);
});
