import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/lib/errors';
import { removeMfaFactorWithInvariant } from './mfa-factor-removal';

const USER = '10000000-0000-4000-8000-000000000001';
const OPERATION = '20000000-0000-4000-8000-000000000002';

test('simultaneous different-factor removals for a privileged user cannot remove both factors', async () => {
  const factors = new Set(['factor-a', 'factor-b']);
  let reservation: string | null = null;
  let unblockFirst!: () => void;
  let firstEntered!: () => void;
  const firstEnteredPromise = new Promise<void>((resolve) => (firstEntered = resolve));
  const firstGate = new Promise<void>((resolve) => (unblockFirst = resolve));
  const deps = {
    operationId: () => OPERATION,
    reserve: async (_userId: string, factorId: string) => {
      if (reservation !== null) return false;
      reservation = factorId;
      return true;
    },
    release: async () => {
      reservation = null;
    },
    listVerifiedFactorIds: async () => [...factors],
    unenroll: async (factorId: string) => {
      if (factorId === 'factor-a') {
        firstEntered();
        await firstGate;
      }
      factors.delete(factorId);
    },
  };

  const first = removeMfaFactorWithInvariant(
    { userId: USER, role: 'admin', factorId: 'factor-a' },
    deps,
  );
  await firstEnteredPromise;
  await assert.rejects(
    removeMfaFactorWithInvariant({ userId: USER, role: 'admin', factorId: 'factor-b' }, deps),
    (error: unknown) => error instanceof ApiError && error.code === 'MFA_MUTATION_IN_PROGRESS',
  );
  unblockFirst();
  await first;
  assert.deepEqual([...factors], ['factor-b']);
});

test('known failure releases the durable reservation for a safe retry', async () => {
  let releases = 0;
  await assert.rejects(
    removeMfaFactorWithInvariant(
      { userId: USER, role: 'pro', factorId: 'factor-a' },
      {
        operationId: () => OPERATION,
        reserve: async () => true,
        release: async () => {
          releases += 1;
        },
        listVerifiedFactorIds: async () => {
          throw new Error('auth unavailable');
        },
        unenroll: async () => undefined,
      },
    ),
  );
  assert.equal(releases, 1);
});

test('last verified factor remains protected after serialization', async () => {
  let unenrolled = false;
  await assert.rejects(
    removeMfaFactorWithInvariant(
      { userId: USER, role: 'super_admin', factorId: 'factor-a' },
      {
        operationId: () => OPERATION,
        reserve: async () => true,
        release: async () => undefined,
        listVerifiedFactorIds: async () => ['factor-a'],
        unenroll: async () => {
          unenrolled = true;
        },
      },
    ),
    (error: unknown) => error instanceof ApiError && error.code === 'MFA_REQUIRED',
  );
  assert.equal(unenrolled, false);
});
