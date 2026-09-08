import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStartMfaEnrollment,
  runAuthorizedMfaEnrollmentMutation,
  runVerifiedMfaChallengeMutation,
  cleanupUnverifiedTotpFactors,
  finalizeMfaEnrollmentWithDependencies,
  redeemRecoveryCodeWithDependencies,
  replaceRecoveryCodesWithDependencies,
  resetMfaForRecoveryWithDependencies,
} from './mfa-core';

test('AAL1 can enroll only when no verified factor remains', () => {
  assert.equal(canStartMfaEnrollment('aal1', 'aal1', false), true);
  assert.equal(canStartMfaEnrollment('aal1', 'aal2', true), false);
  assert.equal(canStartMfaEnrollment('aal1', 'aal2', false), false);
  assert.equal(canStartMfaEnrollment('aal2', 'aal2', true), true);
});

test('enrollment orchestrator blocks AAL1 verified-factor start and finalize mutations', async () => {
  for (const phase of ['start', 'finalize']) {
    let mutations = 0;
    const result = await runAuthorizedMfaEnrollmentMutation({
      loadFactors: async () => [{ id: 'verified', status: 'verified' }],
      loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal2' }),
      mutate: async () => {
        mutations += 1;
        return phase;
      },
    });
    assert.deepEqual(result, { kind: 'challenge_required' });
    assert.equal(mutations, 0, phase);
  }
});

test('challenge orchestrator mutates only for the supplied verified current-user factor', async () => {
  for (const [factorId, factors, expected] of [
    ['verified', [{ id: 'verified', status: 'verified' }], 'allowed'],
    ['unverified', [{ id: 'unverified', status: 'unverified' }], 'factor_rejected'],
    ['foreign', [{ id: 'verified', status: 'verified' }], 'factor_rejected'],
    ['missing', [], 'factor_rejected'],
  ] as const) {
    let mutations = 0;
    const result = await runVerifiedMfaChallengeMutation(factorId, {
      loadFactors: async () => [...factors],
      mutate: async () => {
        mutations += 1;
        return 'verified';
      },
    });
    assert.equal(result.kind, expected);
    assert.equal(mutations, expected === 'allowed' ? 1 : 0, factorId);
  }
});

test('simultaneous recovery redemption has exactly one winner', async () => {
  let claimed = false;
  const dependencies = {
    listUnused: async () => [{ id: 'code-1', codeHash: 'hash-1' }],
    verify: async () => true,
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
  };

  const results = await Promise.all([
    redeemRecoveryCodeWithDependencies('user-1', 'valid-code', dependencies),
    redeemRecoveryCodeWithDependencies('user-1', 'valid-code', dependencies),
  ]);

  assert.deepEqual(results.sort(), [false, true]);
});

test('recovery redemption fails closed when lookup, verification, or claim fails', async () => {
  const base = {
    listUnused: async () => [{ id: 'code-1', codeHash: 'hash-1' }],
    verify: async () => true,
    claim: async () => true,
  };

  for (const dependencies of [
    { ...base, listUnused: async () => Promise.reject(new Error('lookup')) },
    { ...base, verify: async () => Promise.reject(new Error('verify')) },
    { ...base, claim: async () => Promise.reject(new Error('claim')) },
  ]) {
    assert.equal(
      await redeemRecoveryCodeWithDependencies('user-1', 'valid-code', dependencies),
      false,
    );
  }
});

test('recovery reset removes every factor before clearing enrollment state', async () => {
  const calls: string[] = [];
  const ok = await resetMfaForRecoveryWithDependencies('user-1', {
    revokeSessions: async () => {
      calls.push('revoke');
    },
    deleteRecoveryCodes: async () => {
      calls.push('delete-codes');
    },
    listFactorIds: async () => ['factor-1', 'factor-2'],
    deleteFactor: async (factorId) => {
      calls.push(`delete:${factorId}`);
    },
    clearEnrollment: async () => {
      calls.push('clear');
    },
  });

  assert.equal(ok, 'complete');
  assert.deepEqual(calls, [
    'revoke',
    'delete-codes',
    'delete:factor-1',
    'delete:factor-2',
    'clear',
  ]);
});

test('recovery reset stops before factor mutation when global revocation fails', async () => {
  const calls: string[] = [];
  const ok = await resetMfaForRecoveryWithDependencies('user-1', {
    revokeSessions: async () => Promise.reject(new Error('revoke failed')),
    deleteRecoveryCodes: async () => {
      calls.push('delete-codes');
    },
    listFactorIds: async () => {
      calls.push('list');
      return ['factor-1'];
    },
    deleteFactor: async () => {
      calls.push('delete');
    },
    clearEnrollment: async () => {
      calls.push('clear');
    },
  });

  assert.equal(ok, 'repair_required');
  assert.deepEqual(calls, []);
});

test('recovery reset fails closed and does not clear profile after partial factor deletion', async () => {
  const calls: string[] = [];
  const ok = await resetMfaForRecoveryWithDependencies('user-1', {
    revokeSessions: async () => {
      calls.push('revoke');
    },
    deleteRecoveryCodes: async () => {
      calls.push('delete-codes');
    },
    listFactorIds: async () => ['factor-1', 'factor-2'],
    deleteFactor: async (factorId) => {
      calls.push(`delete:${factorId}`);
      if (factorId === 'factor-2') throw new Error('provider unavailable');
    },
    clearEnrollment: async () => {
      calls.push('clear');
    },
  });

  assert.equal(ok, 'repair_required');
  assert.deepEqual(calls, ['revoke', 'delete-codes', 'delete:factor-1', 'delete:factor-2']);
});

test('every recovery reset dependency failure is terminal repair-required', async () => {
  for (const failedStep of ['revoke', 'codes', 'list', 'factor', 'profile'] as const) {
    const result = await resetMfaForRecoveryWithDependencies('user-1', {
      revokeSessions: async () => {
        if (failedStep === 'revoke') throw new Error('revoke');
      },
      deleteRecoveryCodes: async () => {
        if (failedStep === 'codes') throw new Error('codes');
      },
      listFactorIds: async () => {
        if (failedStep === 'list') throw new Error('list');
        return ['factor-1'];
      },
      deleteFactor: async () => {
        if (failedStep === 'factor') throw new Error('factor');
      },
      clearEnrollment: async () => {
        if (failedStep === 'profile') throw new Error('profile');
      },
    });
    assert.equal(result, 'repair_required', failedStep);
  }
});

test('recovery code replacement never inserts when invalidation fails', async () => {
  const calls: string[] = [];
  await assert.rejects(
    replaceRecoveryCodesWithDependencies('user-1', ['new-code'], {
      deleteExisting: async () => {
        calls.push('delete');
        throw new Error('delete failed');
      },
      hash: async () => {
        calls.push('hash');
        return 'hash';
      },
      insert: async () => {
        calls.push('insert');
      },
    }),
  );
  assert.deepEqual(calls, ['delete']);
});

test('failed enrollment finalization reports repair required when any cleanup fails', async () => {
  const calls: string[] = [];
  const ok = await finalizeMfaEnrollmentWithDependencies('user-1', 'factor-1', ['code'], {
    persistCodes: async () => {
      calls.push('persist');
    },
    markEnrolled: async () => {
      calls.push('mark');
      throw new Error('profile update failed');
    },
    revokeSessions: async () => {
      calls.push('revoke-sessions');
    },
    deleteCodes: async () => {
      calls.push('delete-codes');
    },
    removeFactor: async () => {
      calls.push('remove-factor');
      throw new Error('cleanup unavailable');
    },
    clearEnrollment: async () => {
      calls.push('clear-profile');
    },
  });

  assert.equal(ok, 'repair_required');
  assert.deepEqual(calls, [
    'persist',
    'mark',
    'revoke-sessions',
    'delete-codes',
    'remove-factor',
    'clear-profile',
  ]);
});

test('enrollment finalization reports every cleanup failure combination deterministically', async () => {
  for (let failureMask = 0; failureMask < 16; failureMask += 1) {
    const result = await finalizeMfaEnrollmentWithDependencies('user-1', 'factor-1', ['code'], {
      persistCodes: async () => Promise.reject(new Error('persistence failed')),
      markEnrolled: async () => undefined,
      revokeSessions: async () => {
        if (failureMask & 8) throw new Error('sessions');
      },
      deleteCodes: async () => {
        if (failureMask & 1) throw new Error('codes');
      },
      removeFactor: async () => {
        if (failureMask & 2) throw new Error('factor');
      },
      clearEnrollment: async () => {
        if (failureMask & 4) throw new Error('profile');
      },
    });
    assert.equal(result, failureMask === 0 ? 'failed_clean' : 'repair_required');
  }
});

test('enrollment finalization treats session revocation failure as repair required', async () => {
  const calls: string[] = [];
  const result = await finalizeMfaEnrollmentWithDependencies('user-1', 'factor-1', ['code'], {
    persistCodes: async () => Promise.reject(new Error('persistence failed')),
    markEnrolled: async () => undefined,
    revokeSessions: async () => {
      calls.push('revoke-sessions');
      throw new Error('revocation failed');
    },
    deleteCodes: async () => {
      calls.push('delete-codes');
    },
    removeFactor: async () => {
      calls.push('remove-factor');
    },
    clearEnrollment: async () => {
      calls.push('clear-profile');
    },
  });

  assert.equal(result, 'repair_required');
  assert.deepEqual(calls, ['revoke-sessions', 'delete-codes', 'remove-factor', 'clear-profile']);
});

test('successful enrollment finalization returns complete without cleanup', async () => {
  let cleanups = 0;
  const result = await finalizeMfaEnrollmentWithDependencies('user-1', 'factor-1', ['code'], {
    persistCodes: async () => undefined,
    markEnrolled: async () => undefined,
    revokeSessions: async () => {
      cleanups += 1;
    },
    deleteCodes: async () => {
      cleanups += 1;
    },
    removeFactor: async () => {
      cleanups += 1;
    },
    clearEnrollment: async () => {
      cleanups += 1;
    },
  });
  assert.equal(result, 'complete');
  assert.equal(cleanups, 0);
});

test('enrollment cleanup removes unverified TOTP factors and preserves verified factors', async () => {
  const removed: string[] = [];
  const ok = await cleanupUnverifiedTotpFactors({
    listTotpFactors: async () => [
      { id: 'verified', status: 'verified' },
      { id: 'abandoned', status: 'unverified' },
    ],
    removeFactor: async (factorId) => {
      removed.push(factorId);
    },
  });

  assert.equal(ok, true);
  assert.deepEqual(removed, ['abandoned']);
});

test('enrollment cleanup fails closed when discovery or removal fails', async () => {
  assert.equal(
    await cleanupUnverifiedTotpFactors({
      listTotpFactors: async () => Promise.reject(new Error('private discovery error')),
      removeFactor: async () => undefined,
    }),
    false,
  );
  assert.equal(
    await cleanupUnverifiedTotpFactors({
      listTotpFactors: async () => [{ id: 'abandoned', status: 'unverified' }],
      removeFactor: async () => Promise.reject(new Error('private removal error')),
    }),
    false,
  );
});
