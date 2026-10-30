import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeAccountMfaMutation } from './mfa-mutation-authorization';

test('privileged AAL1 session cannot mutate MFA when a verified factor already exists', async () => {
  await assert.rejects(
    () =>
      authorizeAccountMfaMutation('pro', {
        loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal2' }),
        listVerifiedFactorIds: async () => ['trusted-factor'],
      }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'AAL2_REQUIRED' &&
      !error.message.includes('trusted-factor'),
  );
});

test('first-factor enrollment remains available and established privileged sessions require AAL2', async () => {
  await authorizeAccountMfaMutation('pro', {
    loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal1' }),
    listVerifiedFactorIds: async () => [],
  });
  await authorizeAccountMfaMutation('admin', {
    loadAssurance: async () => ({ currentLevel: 'aal2', nextLevel: 'aal2' }),
    listVerifiedFactorIds: async () => ['trusted-factor'],
  });
});

test('privileged AAL1 session cannot mutate MFA when assurance proves a stale factor list', async () => {
  await assert.rejects(
    () =>
      authorizeAccountMfaMutation('super_admin', {
        loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal2' }),
        listVerifiedFactorIds: async () => [],
      }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'AAL2_REQUIRED',
  );
});

test('privileged MFA mutation fails closed when assurance is unavailable', async () => {
  await assert.rejects(
    () =>
      authorizeAccountMfaMutation('admin', {
        loadAssurance: async () => ({ currentLevel: null, nextLevel: null }),
        listVerifiedFactorIds: async () => [],
      }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'MFA_AUTHORIZATION_FAILED',
  );
});

test('non-privileged accounts do not gain a new MFA step-up requirement', async () => {
  let inspected = false;
  await authorizeAccountMfaMutation('customer', {
    loadAssurance: async () => {
      inspected = true;
      return { currentLevel: null, nextLevel: null };
    },
    listVerifiedFactorIds: async () => {
      inspected = true;
      return [];
    },
  });
  assert.equal(inspected, false);
});
