import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import * as roleTransition from './admin-role-transition';
import {
  AtomicRoleChangeError,
  isRoleMetadataResyncSourceSafe,
  type RoleMetadataClaims,
} from './admin-role-transition';

type ChangeExecutor = (args: {
  oldClaims: RoleMetadataClaims;
  oldVersion: string;
  newClaims: RoleMetadataClaims;
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  changeDatabase(): Promise<{ message: string } | null>;
  readCurrentSnapshot(): Promise<{ claims: RoleMetadataClaims; version: string } | null>;
}) => Promise<void>;

const executeRoleChangeTransition = (
  roleTransition as typeof roleTransition & { executeRoleChangeTransition: ChangeExecutor }
).executeRoleChangeTransition;

type ResyncExecutor = (args: {
  currentClaims: RoleMetadataClaims;
  currentVersion: string;
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  readCurrentSnapshot(): Promise<{ claims: RoleMetadataClaims; version: string } | null>;
}) => Promise<void>;

const executeRoleMetadataResync = (
  roleTransition as typeof roleTransition & { executeRoleMetadataResync: ResyncExecutor }
).executeRoleMetadataResync;

const oldClaims: RoleMetadataClaims = {
  mandoob_role: 'admin',
  tenant_id: null,
  mandoob_status: 'active',
  mandoob_role_transition: null,
};
const newClaims: RoleMetadataClaims = {
  mandoob_role: 'pro',
  tenant_id: 'tenant-1',
  mandoob_status: 'active',
  mandoob_role_transition: null,
};
const neutralClaims: RoleMetadataClaims = {
  mandoob_role: null,
  tenant_id: null,
  mandoob_status: 'active',
  mandoob_role_transition: 'pending',
};

const oldSnapshot = { claims: oldClaims, version: 'version-1' };

function harness(
  failAt?: string,
  snapshots: Array<{ claims: RoleMetadataClaims; version: string } | null> = [oldSnapshot],
) {
  const calls: Array<{ op: string; claims?: RoleMetadataClaims }> = [];
  const fails = (operation: string) => failAt?.split('+').includes(operation) ?? false;
  let revokeCount = 0;
  let metadataCount = 0;
  let readCount = 0;
  return {
    calls,
    run: () =>
      executeRoleChangeTransition({
        oldClaims,
        oldVersion: oldSnapshot.version,
        newClaims,
        revoke: async () => {
          revokeCount += 1;
          calls.push({ op: `revoke-${revokeCount}` });
          if (fails(`revoke-${revokeCount}`)) throw new Error('provider revoke secret');
        },
        writeMetadata: async (claims) => {
          metadataCount += 1;
          calls.push({ op: `metadata-${metadataCount}`, claims });
          if (fails(`metadata-${metadataCount}`)) throw new Error('provider metadata secret');
        },
        changeDatabase: async () => {
          calls.push({ op: 'rpc' });
          return fails('rpc') || failAt === 'rpc-and-restore'
            ? { message: 'provider rpc secret' }
            : null;
        },
        readCurrentSnapshot: async () => {
          readCount += 1;
          calls.push({ op: `read-${readCount}` });
          if (fails(`read-${readCount}`)) throw new Error('provider database secret');
          return snapshots[readCount - 1] ?? null;
        },
      }),
  };
}

async function rejectsCode(run: () => Promise<unknown>, code: string, message: RegExp) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    assert.doesNotMatch(error.message, /provider|secret/i);
    return true;
  });
}

test('revoke failure prevents metadata and database changes', async () => {
  const flow = harness('revoke-1');
  await rejectsCode(flow.run, 'SESSION_REVOKE_FAILED', /revoke user sessions/i);
  assert.deepEqual(flow.calls, [{ op: 'revoke-1' }]);
});

test('neutral metadata failure prevents the RPC', async () => {
  const flow = harness('metadata-1');
  await rejectsCode(flow.run, 'AUTH_METADATA_NEUTRALIZE_FAILED', /disable user authorization/i);
  assert.deepEqual(flow.calls, [{ op: 'revoke-1' }, { op: 'metadata-1', claims: neutralClaims }]);
});

test('neutral claims and a second mandatory revoke precede the RPC', async () => {
  const flow = harness();
  await flow.run();
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'rpc' },
    { op: 'metadata-2', claims: newClaims },
  ]);
});

test('second revoke failure leaves neutral claims and prevents the RPC', async () => {
  const flow = harness('revoke-2');
  await rejectsCode(flow.run, 'SESSION_REVOKE_FAILED', /confirm user session revocation/i);
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
  ]);
});

test('RPC failure restores exact old claims and never writes final claims', async () => {
  const flow = harness('rpc');
  await assert.rejects(flow.run, (error: unknown) => {
    assert.ok(error instanceof AtomicRoleChangeError);
    assert.equal(error.databaseError.message, 'provider rpc secret');
    return true;
  });
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'rpc' },
    { op: 'read-1' },
    { op: 'metadata-2', claims: oldClaims },
    { op: 'revoke-3' },
  ]);
});

test('RPC and restoration failure reports a sanitized compound failure', async () => {
  const calls: Array<{ op: string; claims?: RoleMetadataClaims }> = [];
  let metadataWrites = 0;
  await rejectsCode(
    () =>
      executeRoleChangeTransition({
        oldClaims,
        oldVersion: oldSnapshot.version,
        newClaims,
        revoke: async () => {
          calls.push({ op: 'revoke' });
        },
        writeMetadata: async (claims) => {
          metadataWrites += 1;
          calls.push({ op: 'metadata', claims });
          if (metadataWrites === 2) throw new Error('provider restore secret');
        },
        changeDatabase: async () => {
          calls.push({ op: 'rpc' });
          return { message: 'provider rpc secret' };
        },
        readCurrentSnapshot: async () => {
          calls.push({ op: 'read' });
          return oldSnapshot;
        },
      }),
    'ROLE_CHANGE_RESTORE_FAILED',
    /database role change failed.*prior authorization metadata/i,
  );
  assert.deepEqual(calls, [
    { op: 'revoke' },
    { op: 'metadata', claims: neutralClaims },
    { op: 'revoke' },
    { op: 'rpc' },
    { op: 'read' },
    { op: 'metadata', claims: oldClaims },
  ]);
});

test('losing concurrent role transition neutralizes winner claims and never restores stale role', async () => {
  const winnerClaims: RoleMetadataClaims = {
    mandoob_role: 'customer',
    tenant_id: 'tenant-2',
    mandoob_status: 'active',
    mandoob_role_transition: null,
  };
  const flow = harness('rpc', [{ claims: winnerClaims, version: 'version-2' }]);
  await rejectsCode(
    flow.run,
    'ROLE_CHANGE_STATE_CONFLICT',
    /profile changed.*login remains disabled/i,
  );
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'rpc' },
    { op: 'read-1' },
    {
      op: 'metadata-2',
      claims: { ...neutralClaims, mandoob_status: winnerClaims.mandoob_status },
    },
    { op: 'revoke-3' },
  ]);
  assert.equal(
    flow.calls.some((call) => call.claims === oldClaims),
    false,
  );
});

test('RPC rollback revalidation fails closed for status, version, missing, and read changes', async () => {
  const cases: Array<{
    failAt?: string;
    snapshot: { claims: RoleMetadataClaims; version: string } | null;
    code: string;
  }> = [
    {
      snapshot: { claims: { ...oldClaims, mandoob_status: 'suspended' }, version: 'version-2' },
      code: 'ROLE_CHANGE_STATE_CONFLICT',
    },
    { snapshot: { claims: oldClaims, version: 'version-2' }, code: 'ROLE_CHANGE_STATE_CONFLICT' },
    { snapshot: null, code: 'ROLE_CHANGE_STATE_CONFLICT' },
    { failAt: 'rpc+read-1', snapshot: oldSnapshot, code: 'ROLE_CHANGE_REVALIDATION_FAILED' },
  ];
  for (const testCase of cases) {
    const flow = harness(testCase.failAt ?? 'rpc', [testCase.snapshot]);
    if (testCase.failAt === 'rpc+read-1') {
      const originalRun = flow.run;
      await rejectsCode(originalRun, testCase.code, /revalidate.*login remains disabled/i);
    } else {
      await rejectsCode(flow.run, testCase.code, /profile changed.*login remains disabled/i);
    }
    assert.equal(
      flow.calls.some((call) => call.claims === oldClaims),
      false,
    );
    assert.equal(flow.calls.at(-2)?.op.startsWith('metadata'), true);
    assert.equal(flow.calls.at(-1)?.op.startsWith('revoke'), true);
  }
});

test('RPC rollback conflict attempts both neutral metadata and revoke when either cleanup fails', async () => {
  const winnerSnapshot = {
    claims: { ...oldClaims, mandoob_role: 'customer' as const, tenant_id: 'tenant-2' },
    version: 'version-2',
  };
  for (const failure of ['metadata-2', 'revoke-3']) {
    const flow = harness(`rpc+${failure}`, [winnerSnapshot]);
    await rejectsCode(flow.run, 'ROLE_CHANGE_ROLLBACK_LOCK_FAILED', /fail-closed recovery failed/i);
    assert.equal(flow.calls.at(-2)?.op, 'metadata-2');
    assert.deepEqual(flow.calls.at(-1), { op: 'revoke-3' });
    assert.equal(
      flow.calls.some((call) => call.claims === oldClaims),
      false,
    );
  }
});

test('final sync failure leaves neutral claims and never restores old privileges', async () => {
  const flow = harness('metadata-2');
  await rejectsCode(
    flow.run,
    'AUTH_METADATA_SYNC_FAILED',
    /login remains disabled.*Resync login access/i,
  );
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'rpc' },
    { op: 'metadata-2', claims: newClaims },
  ]);
  assert.equal(
    flow.calls.some((call, index) => index > 1 && call.claims === oldClaims),
    false,
  );
});

test('pending transitions are denied by session loading and password login even with a stale role', () => {
  const requireUser = readFileSync(join(process.cwd(), 'src/lib/auth/require-user.ts'), 'utf8');
  const login = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/login/route.ts'), 'utf8');
  assert.match(
    requireUser,
    /if \(appMeta\.mandoob_role_transition === 'pending' \|\| !appMeta\.mandoob_role\) return null/,
  );
  assert.match(
    login,
    /if \(appMeta\.mandoob_role_transition === 'pending' \|\| !appMeta\.mandoob_role\)[\s\S]*auth\.signOut\(\)[\s\S]*AUTHORIZATION_UNAVAILABLE/,
  );
});

const currentSnapshot = { claims: newClaims, version: 'version-1' };

function resyncHarness(
  failAt?: string,
  snapshots: Array<{ claims: RoleMetadataClaims; version: string } | null> = [
    currentSnapshot,
    currentSnapshot,
  ],
) {
  const calls: Array<{ op: string; claims?: RoleMetadataClaims }> = [];
  let revokeCount = 0;
  let metadataCount = 0;
  let readCount = 0;
  return {
    calls,
    run: () =>
      executeRoleMetadataResync({
        currentClaims: newClaims,
        currentVersion: currentSnapshot.version,
        revoke: async () => {
          revokeCount += 1;
          calls.push({ op: `revoke-${revokeCount}` });
          if (failAt === `revoke-${revokeCount}`) throw new Error('provider revoke secret');
        },
        writeMetadata: async (claims) => {
          metadataCount += 1;
          calls.push({ op: `metadata-${metadataCount}`, claims });
          if (failAt === `metadata-${metadataCount}`) throw new Error('provider metadata secret');
        },
        readCurrentSnapshot: async () => {
          readCount += 1;
          calls.push({ op: `read-${readCount}` });
          if (failAt === `read-${readCount}`) throw new Error('provider database secret');
          return snapshots[readCount - 1] ?? null;
        },
      }),
  };
}

test('metadata resync is idempotent and uses pending claims between mandatory revokes', async () => {
  const flow = resyncHarness();
  await flow.run();
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'read-1' },
    { op: 'metadata-2', claims: newClaims },
    { op: 'read-2' },
    { op: 'revoke-3' },
  ]);
});

test('metadata resync accepts only pending or already-canonical provider metadata', () => {
  assert.equal(
    isRoleMetadataResyncSourceSafe(
      {
        mandoob_role: 'admin',
        tenant_id: null,
        mandoob_status: 'active',
        mandoob_role_transition: 'pending',
      },
      newClaims,
    ),
    true,
  );
  assert.equal(isRoleMetadataResyncSourceSafe(newClaims, newClaims), true);
  assert.equal(
    isRoleMetadataResyncSourceSafe(
      {
        mandoob_role: 'admin',
        tenant_id: null,
        mandoob_status: 'active',
      },
      newClaims,
    ),
    false,
  );
});

test('metadata resync never writes current claims when neutralization cannot be secured', async () => {
  for (const failure of ['revoke-1', 'metadata-1', 'revoke-2']) {
    const flow = resyncHarness(failure);
    await assert.rejects(flow.run, (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.doesNotMatch(error.message, /provider|secret/i);
      return true;
    });
    assert.equal(
      flow.calls.some((call) => call.claims === newClaims),
      false,
    );
  }
});

test('metadata resync final write failure remains pending with a supported recovery instruction', async () => {
  const flow = resyncHarness('metadata-2');
  await rejectsCode(
    flow.run,
    'AUTH_METADATA_SYNC_FAILED',
    /login remains disabled.*Resync login access/i,
  );
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'read-1' },
    { op: 'metadata-2', claims: newClaims },
  ]);
});

test('metadata resync final revoke failure returns to pending claims', async () => {
  const flow = resyncHarness('revoke-3');
  await rejectsCode(flow.run, 'SESSION_REVOKE_FAILED', /authorization remains disabled/i);
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'read-1' },
    { op: 'metadata-2', claims: newClaims },
    { op: 'read-2' },
    { op: 'revoke-3' },
    { op: 'metadata-3', claims: neutralClaims },
  ]);
});

test('post-write concurrent role and tenant change neutralizes old snapshot before failing', async () => {
  const concurrentClaims: RoleMetadataClaims = {
    mandoob_role: 'customer',
    tenant_id: 'tenant-2',
    mandoob_status: 'active',
    mandoob_role_transition: null,
  };
  const concurrentNeutral: RoleMetadataClaims = {
    ...concurrentClaims,
    mandoob_role: null,
    tenant_id: null,
    mandoob_role_transition: 'pending',
  };
  const flow = resyncHarness(undefined, [
    currentSnapshot,
    { claims: concurrentClaims, version: 'version-2' },
  ]);
  await rejectsCode(
    flow.run,
    'ROLE_METADATA_STATE_CONFLICT',
    /profile changed.*login remains disabled/i,
  );
  assert.deepEqual(flow.calls, [
    { op: 'revoke-1' },
    { op: 'metadata-1', claims: neutralClaims },
    { op: 'revoke-2' },
    { op: 'read-1' },
    { op: 'metadata-2', claims: newClaims },
    { op: 'read-2' },
    { op: 'metadata-3', claims: concurrentNeutral },
    { op: 'revoke-3' },
  ]);
});

test('pre-write status change prevents stale final claims and remains pending', async () => {
  const concurrentClaims: RoleMetadataClaims = {
    ...newClaims,
    mandoob_status: 'suspended',
  };
  const flow = resyncHarness(undefined, [{ claims: concurrentClaims, version: 'version-2' }]);
  await rejectsCode(
    flow.run,
    'ROLE_METADATA_STATE_CONFLICT',
    /profile changed.*login remains disabled/i,
  );
  assert.equal(
    flow.calls.some((call) => call.claims === newClaims),
    false,
  );
  assert.deepEqual(flow.calls.at(-2), {
    op: 'metadata-2',
    claims: { ...neutralClaims, mandoob_status: 'suspended' },
  });
  assert.deepEqual(flow.calls.at(-1), { op: 'revoke-3' });
});

test('conflict cleanup attempts both neutral metadata and mandatory revoke when either fails', async () => {
  const concurrentClaims: RoleMetadataClaims = { ...newClaims, tenant_id: 'tenant-2' };
  for (const failure of ['metadata-3', 'revoke-3']) {
    const flow = resyncHarness(failure, [
      currentSnapshot,
      { claims: concurrentClaims, version: 'version-2' },
    ]);
    await rejectsCode(flow.run, 'ROLE_METADATA_RESYNC_LOCK_FAILED', /fail-closed recovery failed/i);
    assert.equal(flow.calls.at(-2)?.op, 'metadata-3');
    assert.deepEqual(flow.calls.at(-1), { op: 'revoke-3' });
  }
});

test('missing profile during mandatory post-write revalidation also returns to pending', async () => {
  const flow = resyncHarness(undefined, [currentSnapshot, null]);
  await rejectsCode(
    flow.run,
    'ROLE_METADATA_STATE_CONFLICT',
    /profile changed.*login remains disabled/i,
  );
  assert.deepEqual(flow.calls.at(-2), { op: 'metadata-3', claims: neutralClaims });
  assert.deepEqual(flow.calls.at(-1), { op: 'revoke-3' });
});
